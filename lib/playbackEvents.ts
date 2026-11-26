import type { NowPlayingSnapshot } from "./nowPlayingFeed.ts";

export interface PlaybackEventConnection {
  readonly readyState: number;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  close(): void;
}

// EventSource reconnects reported errors, but a half-open connection can stay
// OPEN forever. Check liveness independently and discard events from old streams.
export class PlaybackEvents {
  private connection: PlaybackEventConnection | undefined;
  private detach: (() => void) | undefined;
  private lastEventAt = 0;
  private stopped = true;

  constructor(
    private onSnapshot: (snapshot: NowPlayingSnapshot) => void,
    private create: () => PlaybackEventConnection = () =>
      new EventSource("/api/now-playing"),
    private now = Date.now,
    private staleMs = 35000,
  ) {}

  restart() {
    this.stop();
    this.stopped = false;
    this.lastEventAt = this.now();
    let connection;
    try {
      connection = this.create();
    } catch {
      return;
    }
    this.connection = connection;
    const current = () => !this.stopped && this.connection === connection;
    const alive = () => {
      if (current()) this.lastEventAt = this.now();
    };
    const update: EventListener = (event) => {
      if (!current()) return;
      let snapshot;
      try {
        snapshot = JSON.parse((event as MessageEvent<string>).data);
      } catch {
        return;
      }
      if (
        !snapshot ||
        !["orange-pi", "rocksky", "spotify", "last-played"].includes(
          snapshot.source,
        ) ||
        !(snapshot.track === null || typeof snapshot.track?.title === "string")
      ) return;
      alive();
      // Do not hide rendering failures inside the JSON parsing catch.
      this.onSnapshot(snapshot);
    };
    connection.addEventListener("open", alive);
    connection.addEventListener("heartbeat", alive);
    connection.addEventListener("now-playing", update);
    this.detach = () => {
      connection.removeEventListener("open", alive);
      connection.removeEventListener("heartbeat", alive);
      connection.removeEventListener("now-playing", update);
      connection.close();
    };
  }

  check() {
    if (this.stopped) return;
    if (
      this.connection?.readyState === 2 ||
      this.now() - this.lastEventAt >= this.staleMs
    ) {
      this.restart();
    }
  }

  stop() {
    this.stopped = true;
    this.connection = undefined;
    this.detach?.();
    this.detach = undefined;
  }
}
