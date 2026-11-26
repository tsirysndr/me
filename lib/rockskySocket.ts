interface RockskySocketOptions {
  loadToken: () => Promise<string | undefined>;
  onFrame: (frame: unknown) => void;
  onDisconnect: () => void;
  createSocket?: () => WebSocket;
  retryMs?: number;
  heartbeatMs?: number;
  handshakeMs?: number;
  idleMs?: number;
}

// Reconnect on every failure path, including credential reads and sockets that
// never finish closing. No playback commands or primary-device selection.
export function createRockskySocket(options: RockskySocketOptions) {
  const { loadToken, onFrame, onDisconnect } = options;
  let socket: WebSocket | undefined;
  let pending: Promise<void> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retire: (() => void) | undefined;
  let stopped = false;

  function scheduleRetry() {
    clearTimeout(retry);
    if (!stopped) {
      retry = setTimeout(() => void ensure(), options.retryMs ?? 5000);
    }
  }

  function ensure(): Promise<void> {
    if (stopped || socket) return Promise.resolve();
    if (pending) return pending;
    clearTimeout(retry);
    pending = (async () => {
      try {
        const token = await loadToken();
        if (stopped) return;
        if (!token) throw new Error("No usable Rocksky login");
        const ws = options.createSocket?.() ??
          new WebSocket("wss://api.rocksky.app/ws");
        socket = ws;
        let lastMessage = Date.now();
        const disconnect = () => {
          clearTimeout(handshake);
          clearInterval(heartbeat);
          if (socket !== ws) return;
          socket = undefined;
          retire = undefined;
          ws.onopen =
            ws.onmessage =
            ws.onerror =
            ws.onclose =
              null;
          try {
            ws.close();
          } catch { /* The dead transport is already detached. */ }
          onDisconnect();
          scheduleRetry();
        };
        retire = disconnect;
        const handshake = setTimeout(disconnect, options.handshakeMs ?? 8000);
        const heartbeat = setInterval(() => {
          if (
            Date.now() - lastMessage >= (options.idleMs ?? 30000) ||
            ws.readyState > 1
          ) {
            disconnect();
          } else if (ws.readyState === 1) {
            try {
              ws.send("ping");
            } catch {
              disconnect();
            }
          }
        }, options.heartbeatMs ?? 10000);
        ws.onopen = () => {
          try {
            ws.send(
              JSON.stringify({
                type: "register",
                clientName: "Personal website (read-only)",
                token,
              }),
            );
          } catch {
            disconnect();
          }
        };
        ws.onmessage = (event) => {
          if (socket !== ws || typeof event.data !== "string") return;
          lastMessage = Date.now();
          if (event.data === "pong") return;
          let frame;
          try {
            frame = JSON.parse(event.data);
          } catch {
            return;
          }
          if (frame?.type === "devices") clearTimeout(handshake);
          onFrame(frame);
        };
        ws.onerror = ws.onclose = disconnect;
      } catch {
        onDisconnect();
        scheduleRetry();
      }
    })().finally(() => pending = undefined);
    return pending;
  }

  return {
    ensure,
    stop() {
      stopped = true;
      clearTimeout(retry);
      retire?.();
    },
  };
}
