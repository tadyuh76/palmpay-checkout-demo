import { deletePalmTemplate } from "@/lib/palm-sdk";
import { palmCorsHeaders, palmOptionsResponse } from "@/lib/palm-api-cors";

export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return palmOptionsResponse(request);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    templateRef?: unknown;
  } | null;

  if (!body || typeof body.templateRef !== "string") {
    return Response.json(
      { error: "Invalid palm delete request" },
      { headers: palmCorsHeaders(request), status: 400 },
    );
  }

  return Response.json(
    {
      deleted: await deletePalmTemplate(body.templateRef.slice(0, 120)),
    },
    { headers: palmCorsHeaders(request) },
  );
}
