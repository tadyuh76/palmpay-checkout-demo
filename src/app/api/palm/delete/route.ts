import { deletePalmTemplate } from "@/lib/palm-sdk";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    templateRef?: unknown;
  } | null;

  if (!body || typeof body.templateRef !== "string") {
    return Response.json({ error: "Invalid palm delete request" }, { status: 400 });
  }

  return Response.json({
    deleted: deletePalmTemplate(body.templateRef.slice(0, 120)),
  });
}
