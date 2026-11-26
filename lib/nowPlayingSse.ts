import type { NowPlayingSnapshot } from "./nowPlayingFeed.ts";

export function nowPlayingEventStream(
  subscribe: (listener: (snapshot: NowPlayingSnapshot) => void) => () => void,
  signal: AbortSignal,
  heartbeatMs = 15000,
) {
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let pending: Uint8Array | undefined;
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    clearInterval(heartbeat);
    signal.removeEventListener("abort", abort);
    pending = undefined;
  };
  const abort = () => {
    cleanup();
    try {
      controller.close();
    } catch { /* Already cancelled. */ }
  };

  return new ReadableStream<Uint8Array>({
    start(output) {
      controller = output;
      if (signal.aborted) {
        abort();
        return;
      }
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      unsubscribe = subscribe((snapshot) => {
        if (closed) return;
        const event = encoder.encode(
          `event: now-playing\ndata: ${JSON.stringify(snapshot)}\n\n`,
        );
        // Bound slow-client memory to one queued event and the newest snapshot.
        if ((controller.desiredSize ?? 0) > 0) controller.enqueue(event);
        else pending = event;
      });
      heartbeat = setInterval(() => {
        if (!closed && (controller.desiredSize ?? 0) > 0) {
          controller.enqueue(encoder.encode(
            `: keep-alive\nevent: heartbeat\ndata: ${
              JSON.stringify({ at: Date.now() })
            }\n\n`,
          ));
        }
      }, heartbeatMs);
      signal.addEventListener("abort", abort, { once: true });
    },
    pull() {
      if (pending && !closed) {
        const event = pending;
        pending = undefined;
        controller.enqueue(event);
      }
    },
    cancel() {
      cleanup();
    },
  });
}
