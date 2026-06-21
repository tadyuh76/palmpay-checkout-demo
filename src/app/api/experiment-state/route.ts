import {
  getExperimentState,
  updateExperimentState,
} from "@/lib/experiment-state-store";

export const runtime = "nodejs";

export async function GET() {
  const state = await getExperimentState();
  return Response.json({ state });
}

export async function PUT(request: Request) {
  const patch = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return Response.json({ error: "Invalid experiment state" }, { status: 400 });
  }

  const state = await updateExperimentState(patch);
  return Response.json({ state });
}
