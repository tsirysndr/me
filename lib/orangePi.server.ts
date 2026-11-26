import { PreferredPlayerState } from "./preferredPlayer.ts";

const OWNER_DID = "did:plc:7vdlgi2bflelz7mmuxoqjfcr";
const state = new PreferredPlayerState();
let socket: WebSocket | undefined;
let connecting: Promise<void> | undefined;
let initialSnapshot: Promise<void> | undefined;
let retryAt = 0;

async function connect() {
  if (socket || Date.now() < retryAt) return;
  retryAt = Date.now() + 5000;
  try {
    // Server-only: reuse the daemon owner's login. Never import this module in
    // an island or return credentials, queues or control capabilities to clients.
    const path = Deno.env.get("ROCKSKY_TOKEN_FILE") ??
      `${Deno.env.get("HOME")}/.rocksky/token.json`;
    const { token } = JSON.parse(await Deno.readTextFile(path));
    if (typeof token !== "string") return;
    // Refuse a login for another account. Rocksky verifies the JWT signature
    // when registering; decoding here only checks which account we intend to use.
    const payload = token.split(".")[1].replaceAll("-", "+").replaceAll(
      "_",
      "/",
    );
    if (JSON.parse(atob(payload)).did !== OWNER_DID) return;

    const ws = new WebSocket("wss://api.rocksky.app/ws");
    socket = ws;
    let lastMessage = Date.now();
    let resolveSnapshot: () => void;
    initialSnapshot = new Promise<void>((resolve) => resolveSnapshot = resolve);
    const handshake = setTimeout(() => ws.close(), 8000);
    const heartbeat = setInterval(() => {
      if (Date.now() - lastMessage > 30_000) ws.close();
      else if (ws.readyState === WebSocket.OPEN) ws.send("ping");
    }, 10_000);

    ws.onopen = () => {
      // Register only as a listener: never send commands, tracks or set_primary.
      ws.send(JSON.stringify({
        type: "register",
        clientName: "Personal website (read-only)",
        token,
      }));
    };
    ws.onmessage = (event) => {
      if (socket !== ws || typeof event.data !== "string") return;
      lastMessage = Date.now();
      if (event.data === "pong") return;
      try {
        const frame = JSON.parse(event.data);
        state.ingest(frame);
        if (frame.type === "devices") {
          clearTimeout(handshake);
          resolveSnapshot();
        }
      } catch {
        // Ignore malformed messages; never log account payloads.
      }
    };
    ws.onerror = () => ws.close();
    ws.onclose = () => {
      clearTimeout(handshake);
      clearInterval(heartbeat);
      resolveSnapshot();
      if (socket !== ws) return;
      socket = undefined;
      state.clear();
      retryAt = Date.now() + 5000;
      setTimeout(() => void ensureConnection(), 5000);
    };
  } catch {
    // Missing credentials or an unavailable relay fall back to public playback.
    state.clear();
  }
}

function ensureConnection() {
  if (!connecting) {
    connecting = connect().finally(() => connecting = undefined);
  }
  return connecting;
}

export async function getOrangePiTrack() {
  await ensureConnection();
  if (initialSnapshot) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      initialSnapshot,
      new Promise<void>((resolve) => timer = setTimeout(resolve, 1500)),
    ]);
    clearTimeout(timer);
  }
  return state.playing();
}
