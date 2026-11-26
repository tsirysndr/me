import { PreferredPlayerState } from "./preferredPlayer.ts";
import type { PublicPlayerTrack } from "./preferredPlayer.ts";
import { canStreamFromDevice } from "./liveAudio.ts";
import { createRockskySocket } from "./rockskySocket.ts";

const OWNER_DID = "did:plc:7vdlgi2bflelz7mmuxoqjfcr";
const state = new PreferredPlayerState();
const listeners = new Set<(track: PublicPlayerTrack | null) => void>();
let expiry: ReturnType<typeof setTimeout> | undefined;

function publish() {
  clearTimeout(expiry);
  const track = state.playing();
  for (const listener of listeners) listener(track);
  if (track) expiry = setTimeout(publish, 12005);
}

async function loadOwnerToken(): Promise<string | undefined> {
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

  return token;
}

const connection = createRockskySocket({
  loadToken: loadOwnerToken,
  onFrame(frame) {
    state.ingest(frame);
    if (typeof frame !== "object" || frame === null) return;
    const data = frame as Record<string, unknown>;
    const message = data.data as Record<string, unknown> | undefined;
    if (
      data.type === "devices" || data.type === "device_unregistered" ||
      (data.type === "message" &&
        canStreamFromDevice(
          typeof data.device_name === "string" ? data.device_name : undefined,
        ) &&
        ["track", "status"].includes(String(message?.type)))
    ) publish();
  },
  onDisconnect() {
    state.clear();
    publish();
  },
});

export function subscribeOrangePiTrack(
  listener: (track: PublicPlayerTrack | null) => void,
) {
  listeners.add(listener);
  listener(state.playing());
  void connection.ensure();
  return () => listeners.delete(listener);
}
