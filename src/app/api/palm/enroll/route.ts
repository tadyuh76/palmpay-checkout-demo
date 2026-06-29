import { runPalmSdk } from "@/lib/palm-sdk";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    participantId?: unknown;
    templateRef?: unknown;
  } | null;

  if (!body || typeof body.templateRef !== "string") {
    return Response.json({ error: "Invalid palm enrollment request" }, { status: 400 });
  }

  const result = await runPalmSdk("enroll", {
    participantId:
      typeof body.participantId === "string" ? body.participantId.slice(0, 80) : undefined,
    templateRef: body.templateRef.slice(0, 120),
  });

  return Response.json(result, { status: result.ok ? 200 : 502 });
}
