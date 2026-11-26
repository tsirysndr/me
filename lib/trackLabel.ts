import type { NowPlayingSnapshot } from "./nowPlayingFeed.ts";

export interface StreamClock {
  positionMs: number;
  latencyMs: number;
}

type Label = "Now Playing" | "Up Next" | "Last Played";

interface Observation {
  key: string;
  source: NowPlayingSnapshot["source"];
  duration: number;
  elapsed: number;
  clock: StreamClock | null;
}

// Metadata can advance during the crossfade while outgoing PCM is still in
// the player/HLS buffers. Keep the incoming track labelled as upcoming until
// the browser playhead reaches the outgoing track's estimated end boundary.
export class TrackLabelState {
  private previous: Observation | undefined;
  private pending: { from: number; boundary: number } | undefined;
  private label: Label = "Now Playing";

  observe(snapshot: NowPlayingSnapshot, clock: StreamClock | null): Label {
    const track = snapshot.track;
    if (!track || snapshot.source === "last-played") {
      this.previous = undefined;
      this.pending = undefined;
      this.label = "Last Played";
      return this.label;
    }
    const key = JSON.stringify([
      track.device_name,
      track.song_uri || [track.title, track.artist, track.album_artist],
    ]);
    const previous = this.previous;
    const changed = previous && previous.key !== key;
    if (changed || previous?.source !== snapshot.source) {
      this.pending = undefined;
      this.label = "Now Playing";
      if (
        changed && previous.source === "orange-pi" &&
        snapshot.source === "orange-pi" && track.is_playing &&
        previous.clock && clock && previous.duration > 0
      ) {
        const remaining = previous.duration - previous.elapsed;
        // Only a near-end transition qualifies; opening the page, changing
        // devices, or manually skipping mid-track must not imply "Up Next".
        if (
          remaining >= 0 && remaining <= 30000 &&
          clock.positionMs >= previous.clock.positionMs
        ) {
          const boundary = previous.clock.positionMs + remaining +
            previous.clock.latencyMs;
          if (boundary > clock.positionMs) {
            this.pending = { from: clock.positionMs, boundary };
            this.label = "Up Next";
          }
        }
      }
    }
    this.previous = {
      key,
      source: snapshot.source,
      duration: track.length,
      elapsed: track.elapsed,
      clock,
    };
    return this.tick(clock);
  }

  tick(clock: StreamClock | null): Label {
    if (
      this.pending && clock &&
      (clock.positionMs >= this.pending.boundary ||
        clock.positionMs < this.pending.from - 1000)
    ) {
      // Seeking/catching up or restarting the HLS timeline also ends the preview.
      this.pending = undefined;
      this.label = "Now Playing";
    }
    return this.label;
  }
}
