import { appDb, ensureAppTables } from "@/lib/db";
import {
  decryptBiometricTemplates,
  encryptBiometricTemplates,
} from "@/lib/biometric-crypto";

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

function parseStateValue(key: keyof ExperimentState, value: string) {
  try {
    return decryptBiometricTemplates(
      JSON.parse(value),
    ) as ExperimentState[typeof key];
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

export async function getExperimentState(): Promise<ExperimentState> {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<StateRow>(
      "SELECT key, value_json FROM experiment_state",
    );
    return result.rows.reduce<ExperimentState>(
      (state, row) => ({
        ...state,
        [row.key]: parseStateValue(row.key, row.value_json),
      }),
      { ...defaultState },
    );
  }

  const rows = appDb.sqlite
    .prepare("SELECT key, value_json FROM experiment_state")
    .all() as StateRow[];

  return rows.reduce<ExperimentState>(
    (state, row) => ({
      ...state,
      [row.key]: parseStateValue(row.key, row.value_json),
    }),
    { ...defaultState },
  );
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
        [key, JSON.stringify(encryptBiometricTemplates(value))],
      );
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
        statement.run(key, JSON.stringify(encryptBiometricTemplates(value)));
      }
    },
  );
  writeMany(entries);

  return getExperimentState();
}

export async function clearExperimentState() {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    await appDb.pool.query("DELETE FROM experiment_state");
  } else {
    appDb.sqlite.prepare("DELETE FROM experiment_state").run();
  }

  return { ...defaultState };
}
