import { spawnPalmSdkWorker, type PalmSdkAction, type PalmSdkResult } from "@/lib/palm-sdk";

function sseMessage(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function palmSdkStreamResponse(action: PalmSdkAction, request: Request) {
  const url = new URL(request.url);
  const templateRef = url.searchParams.get("templateRef")?.slice(0, 120) ?? "";
  const participantId = url.searchParams.get("participantId")?.slice(0, 80) ?? undefined;
  const transactionId = url.searchParams.get("transactionId")?.slice(0, 80) ?? undefined;

  const encoder = new TextEncoder();
  const worker = spawnPalmSdkWorker(
    action,
    { participantId, templateRef, transactionId },
    ["--stream-events"],
  );

  const stream = new ReadableStream({
    start(controller) {
      let settled = false;
      let stdoutBuffer = "";
      let timer: ReturnType<typeof setTimeout> | null = null;

      const send = (event: string, data: unknown) => {
        if (settled) return;
        controller.enqueue(encoder.encode(sseMessage(event, data)));
      };

      const finish = (data?: unknown) => {
        if (settled) return;
        if (data) send("done", data);
        settled = true;
        if (timer) clearTimeout(timer);
        setTimeout(() => {
          try {
            controller.close();
          } catch {
            // The browser may have already closed the EventSource.
          }
        }, 150);
      };

      timer = setTimeout(() => {
        if (worker.child) worker.child.kill();
        finish({
          ok: false,
          action,
          error: "sdk_timeout",
          message: "Palm SDK scan timed out",
          templateRef: worker.templateRef,
        } satisfies PalmSdkResult);
      }, worker.timeoutMs + 2000);

      controller.enqueue(encoder.encode("retry: 500\n\n"));

      if (worker.error) {
        finish(worker.error);
        return;
      }

      request.signal.addEventListener("abort", () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        worker.child.kill();
      });

      worker.child.stdout.on("data", (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("{")) continue;

          try {
            const parsed = JSON.parse(trimmed) as { streamType?: string };
            const event = parsed.streamType || "message";
            if (event === "done") {
              finish(parsed);
              return;
            }
            send(event, parsed);
          } catch {
            // Ignore noisy SDK stdout that is not JSON.
          }
        }
      });

      worker.child.on("error", (error) => {
        finish({
          ok: false,
          action,
          error: "sdk_process_error",
          message: `${error.message}. Set PALMPAY_PALM_PYTHON if Python is not on PATH.`,
          templateRef: worker.templateRef,
        } satisfies PalmSdkResult);
      });

      worker.child.on("close", () => {
        finish({
          ok: false,
          action,
          error: "sdk_no_json",
          message: "Palm SDK worker ended before returning a scan result",
          templateRef: worker.templateRef,
        } satisfies PalmSdkResult);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}
