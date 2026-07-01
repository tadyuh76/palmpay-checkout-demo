import { appDb, ensureAppTables } from "@/lib/db";

export type ExperimentState = {
  assignmentHistory: unknown[];
  assignmentQueue: unknown[];
  completedSessions: unknown[];
  currentSession: unknown | null;
  participantCounter: number;
};

type ExperimentStatePatch = Partial<ExperimentState>;

const defaultState: ExperimentState = {
  assignmentHistory: [],
  assignmentQueue: [],
  completedSessions: [],
  currentSession: null,
  participantCounter: 0,
};

const stateKeys = Object.keys(defaultState) as Array<keyof ExperimentState>;

type StateRow = {
  key: keyof ExperimentState;
  value_json: string;
};

type SessionRow = {
  session_json: string;
};

type StoredSession = {
  assigned_group?: unknown;
  checkout_completed_at?: unknown;
  created_at?: unknown;
  participant_id?: unknown;
  post_survey_completed_at?: unknown;
  session_status?: unknown;
};

function parseStateValue(key: keyof ExperimentState, value: string) {
  try {
    return JSON.parse(value) as ExperimentState[typeof key];
  } catch {
    return defaultState[key];
  }
}

function normalizePatch(patch: ExperimentStatePatch) {
  return Object.fromEntries(
    Object.entries(patch).filter(([key]) =>
      stateKeys.includes(key as keyof ExperimentState),
    ),
  ) as ExperimentStatePatch;
}

function normalizeCompletedSession(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const session = value as StoredSession;
  if (
    typeof session.participant_id !== "string" ||
    typeof session.assigned_group !== "string"
  ) {
    return null;
  }

  const status =
    typeof session.session_status === "string" ? session.session_status : "completed";
  const completedAt =
    typeof session.post_survey_completed_at === "string"
      ? session.post_survey_completed_at
      : typeof session.checkout_completed_at === "string"
        ? session.checkout_completed_at
        : typeof session.created_at === "string"
          ? session.created_at
          : null;

  return {
    assignedGroup: session.assigned_group,
    completedAt,
    participantId: session.participant_id,
    session: value,
    status,
  };
}

async function listCompletedSessionRecords() {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<SessionRow>(
      `SELECT session_json FROM experiment_sessions
       ORDER BY completed_at DESC NULLS LAST, updated_at DESC`,
    );
    return result.rows.flatMap((row) => {
      try {
        return [JSON.parse(row.session_json)];
      } catch {
        return [];
      }
    });
  }

  const rows = appDb.sqlite
    .prepare(
      `SELECT session_json FROM experiment_sessions
       ORDER BY completed_at DESC, updated_at DESC`,
    )
    .all() as SessionRow[];

  return rows.flatMap((row) => {
    try {
      return [JSON.parse(row.session_json)];
    } catch {
      return [];
    }
  });
}

async function syncCompletedSessionRecords(value: unknown) {
  if (!Array.isArray(value)) return;

  await ensureAppTables();
  const records = value.flatMap((item) => {
    const normalized = normalizeCompletedSession(item);
    return normalized ? [normalized] : [];
  });

  if (appDb.kind === "postgres") {
    const client = await appDb.pool.connect();
    try {
      await client.query("BEGIN");
      for (const record of records) {
        await client.query(
          `INSERT INTO experiment_sessions (
            participant_id,
            assigned_group,
            session_status,
            session_json,
            completed_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          ON CONFLICT (participant_id)
          DO UPDATE SET
            assigned_group = EXCLUDED.assigned_group,
            session_status = EXCLUDED.session_status,
            session_json = EXCLUDED.session_json,
            completed_at = EXCLUDED.completed_at,
            updated_at = CURRENT_TIMESTAMP`,
          [
            record.participantId,
            record.assignedGroup,
            record.status,
            JSON.stringify(record.session),
            record.completedAt,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  const statement = appDb.sqlite.prepare(
    `INSERT INTO experiment_sessions (
      participant_id,
      assigned_group,
      session_status,
      session_json,
      completed_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(participant_id)
    DO UPDATE SET
      assigned_group = excluded.assigned_group,
      session_status = excluded.session_status,
      session_json = excluded.session_json,
      completed_at = excluded.completed_at,
      updated_at = CURRENT_TIMESTAMP`,
  );

  const writeMany = appDb.sqlite.transaction(
    (items: typeof records) => {
      for (const record of items) {
        statement.run(
          record.participantId,
          record.assignedGroup,
          record.status,
          JSON.stringify(record.session),
          record.completedAt,
        );
      }
    },
  );
  writeMany(records);
}

export async function getExperimentState(): Promise<ExperimentState> {
  await ensureAppTables();
  let state: ExperimentState;

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<StateRow>(
      "SELECT key, value_json FROM experiment_state",
    );
    state = result.rows.reduce<ExperimentState>(
      (state, row) => ({
        ...state,
        [row.key]: parseStateValue(row.key, row.value_json),
      }),
      { ...defaultState },
    );
  } else {
    const rows = appDb.sqlite
      .prepare("SELECT key, value_json FROM experiment_state")
      .all() as StateRow[];

    state = rows.reduce<ExperimentState>(
      (state, row) => ({
        ...state,
        [row.key]: parseStateValue(row.key, row.value_json),
      }),
      { ...defaultState },
    );
  }

  const completedSessions = await listCompletedSessionRecords();
  return completedSessions.length ? { ...state, completedSessions } : state;
}

export async function updateExperimentState(patch: ExperimentStatePatch) {
  await ensureAppTables();
  const normalizedPatch = normalizePatch(patch);
  const entries = Object.entries(normalizedPatch) as Array<
    [keyof ExperimentState, ExperimentState[keyof ExperimentState]]
  >;

  if (entries.length === 0) {
    return getExperimentState();
  }

  if (appDb.kind === "postgres") {
    for (const [key, value] of entries) {
      await appDb.pool.query(
        `INSERT INTO experiment_state (key, value_json, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (key)
         DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = CURRENT_TIMESTAMP`,
        [key, JSON.stringify(value)],
      );
    }
    if (Array.isArray(normalizedPatch.completedSessions)) {
      await syncCompletedSessionRecords(normalizedPatch.completedSessions);
    }
    return getExperimentState();
  }

  const statement = appDb.sqlite.prepare(
    `INSERT INTO experiment_state (key, value_json, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key)
     DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`,
  );

  const writeMany = appDb.sqlite.transaction(
    (
      values: Array<
        [keyof ExperimentState, ExperimentState[keyof ExperimentState]]
      >,
    ) => {
      for (const [key, value] of values) {
        statement.run(key, JSON.stringify(value));
      }
    },
  );
  writeMany(entries);

  if (Array.isArray(normalizedPatch.completedSessions)) {
    await syncCompletedSessionRecords(normalizedPatch.completedSessions);
  }

  return getExperimentState();
}

export async function clearExperimentState() {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    await appDb.pool.query("DELETE FROM experiment_state");
    await appDb.pool.query("DELETE FROM experiment_sessions");
  } else {
    appDb.sqlite.prepare("DELETE FROM experiment_state").run();
    appDb.sqlite.prepare("DELETE FROM experiment_sessions").run();
  }

  return { ...defaultState };
}
