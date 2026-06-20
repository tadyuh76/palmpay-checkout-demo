import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function getCurrentSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireUser() {
  const session = await getCurrentSession();

  if (!session?.user?.id) {
    return null;
  }

  return session.user;
}
