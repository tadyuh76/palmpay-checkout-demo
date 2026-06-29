import { palmSdkStreamResponse } from "@/lib/palm-sdk-stream";

export const runtime = "nodejs";

export function GET(request: Request) {
  return palmSdkStreamResponse("enroll", request);
}
