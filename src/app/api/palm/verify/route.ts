import { runPalmSdk } from "@/lib/palm-sdk";
import { palmCorsHeaders, palmOptionsResponse } from "@/lib/palm-api-cors";

export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return palmOptionsResponse(request);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    participantId?: unknown;
    templateRef?: unknown;
    transactionId?: unknown;
  } | null;

  if (!body || typeof body.templateRef !== "string") {
    return Response.json(
      { error: "Invalid palm verification request" },
      { headers: palmCorsHeaders(request), status: 400 },
    );
  }

  const result = await runPalmSdk("verify", {
    participantId:
      typeof body.participantId === "string" ? body.participantId.slice(0, 80) : undefined,
    templateRef: body.templateRef.slice(0, 120),
    transactionId:
      typeof body.transactionId === "string" ? body.transactionId.slice(0, 80) : undefined,
  });

  return Response.json(result, {
    headers: palmCorsHeaders(request),
    status: result.ok ? 200 : 502,
  });
}
