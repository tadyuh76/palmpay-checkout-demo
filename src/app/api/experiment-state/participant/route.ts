import { allocateParticipantId } from "@/lib/experiment-state-store";

export const runtime = "nodejs";

export async function POST() {
  const participantId = await allocateParticipantId();
  return Response.json({ participantId }, { status: 201 });
}
