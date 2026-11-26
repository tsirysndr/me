import { canStreamFromDevice } from "./liveAudio.ts";

export interface PublicPlayerTrack {
  title: string;
  artist: string;
  album_artist: string;
  album_art?: string;
  album_uri?: string;
  song_uri?: string;
  artist_uri?: string;
  codec?: string;
  bitrate?: number;
  sample_rate?: number;
  length: number;
  elapsed: number;
  is_playing: boolean;
  device_name: string;
}

interface Entry {
  track: PublicPlayerTrack;
  trackAt: number;
  positionAt: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function elapsed(entry: Entry, now: number): number {
  const progress = entry.track.elapsed +
    (entry.track.is_playing ? Math.max(0, now - entry.positionAt) : 0);
  return entry.track.length > 0
    ? Math.min(progress, entry.track.length)
    : progress;
}

// A display-only view of one named device. Primary selection is deliberately
// ignored. Queue entries, stream URLs, credentials and other devices stay out.
export class PreferredPlayerState {
  private devices = new Map<string, Entry>();

  clear() {
    this.devices.clear();
  }

  private track(id: unknown, name: unknown, value: unknown, now: number) {
    if (typeof id !== "string" || !canStreamFromDevice(text(name))) return;
    if (!record(value) || !text(value.title)?.trim()) {
      this.devices.delete(id);
      return;
    }
    this.devices.set(id, {
      trackAt: now,
      positionAt: now,
      track: {
        title: text(value.title)!,
        artist: text(value.artist) ?? "",
        album_artist: text(value.album_artist) ?? "",
        album_art: text(value.album_art),
        album_uri: text(value.album_uri),
        song_uri: text(value.song_uri),
        artist_uri: text(value.artist_uri),
        codec: text(value.codec),
        bitrate: number(value.bitrate),
        sample_rate: number(value.sample_rate),
        length: number(value.length) ?? number(value.duration_ms) ?? 0,
        elapsed: number(value.elapsed) ?? 0,
        is_playing: value.is_playing === true,
        device_name: "Orange Pi Zero 3W",
      },
    });
  }

  ingest(frame: unknown, now = Date.now()) {
    if (!record(frame)) return;
    if (frame.type === "devices" && Array.isArray(frame.devices)) {
      this.clear();
      for (const device of frame.devices) {
        if (record(device)) {
          this.track(device.device_id, device.name, device.now_playing, now);
        }
      }
    } else if (
      frame.type === "device_unregistered" &&
      typeof frame.device_id === "string"
    ) {
      this.devices.delete(frame.device_id);
    } else if (
      frame.type === "message" && typeof frame.device_id === "string" &&
      record(frame.data)
    ) {
      if (!canStreamFromDevice(text(frame.device_name))) {
        this.devices.delete(frame.device_id);
        return;
      }
      if (frame.data.type === "track") {
        this.track(frame.device_id, frame.device_name, frame.data, now);
      } else if (
        frame.data.type === "status" && typeof frame.data.status === "number" &&
        [0, 1, 2].includes(frame.data.status)
      ) {
        const entry = this.devices.get(frame.device_id);
        if (entry) {
          entry.track.elapsed = elapsed(entry, now);
          entry.positionAt = now;
          entry.track.is_playing = frame.data.status === 1;
        }
      }
    }
  }

  playing(now = Date.now()): PublicPlayerTrack | null {
    const entry = [...this.devices.values()]
      .filter((e) => e.track.is_playing && now - e.trackAt < 12_000)
      .sort((a, b) => b.trackAt - a.trackAt)[0];
    return entry ? { ...entry.track, elapsed: elapsed(entry, now) } : null;
  }
}
