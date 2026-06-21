import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { appDb } from "@/lib/db";

type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function getCookieValue(cookieHeader: string | null, names: string[]) {
  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (names.includes(rawName)) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return null;
}

function getSessionToken(cookieHeader: string | null) {
  const value = getCookieValue(cookieHeader, [
    "__Secure-better-auth.session_token",
    "better-auth.session_token",
  ]);

  return value?.split(".")[0] || null;
}

async function getSessionUserFromStore(cookieHeader: string | null) {
  const token = getSessionToken(cookieHeader);
  if (!token) {
    return null;
  }

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<SessionUser>(
      `SELECT u.id, u.name, u.email, u."emailVerified", u.image, u."createdAt", u."updatedAt"
       FROM "session" s
       INNER JOIN "user" u ON u.id = s."userId"
       WHERE s.token = $1 AND s."expiresAt" > CURRENT_TIMESTAMP
       LIMIT 1`,
      [token],
    );

    return result.rows[0] ?? null;
  }

  const row = appDb.sqlite
    .prepare(
      `SELECT u.id, u.name, u.email, u."emailVerified", u.image, u."createdAt", u."updatedAt"
       FROM "session" s
       INNER JOIN "user" u ON u.id = s."userId"
       WHERE s.token = ? AND s."expiresAt" > CURRENT_TIMESTAMP
       LIMIT 1`,
    )
    .get(token) as SessionUser | undefined;

  return row ?? null;
}

export async function getCurrentSession() {
  const requestHeaders = await headers();
  const directUser = await getSessionUserFromStore(requestHeaders.get("cookie"));
  if (directUser) {
    return {
      session: null,
      user: directUser,
    };
  }

  return auth.api.getSession({
    headers: requestHeaders,
  });
}

export async function requireUser() {
  const session = await getCurrentSession();

  if (!session?.user?.id) {
    return null;
  }

  return session.user;
}
