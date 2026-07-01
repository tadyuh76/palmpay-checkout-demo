import { palmSdkStreamResponse } from "@/lib/palm-sdk-stream";
import { palmOptionsResponse } from "@/lib/palm-api-cors";

export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return palmOptionsResponse(request);
}

export function GET(request: Request) {
  return palmSdkStreamResponse("enroll", request);
}
