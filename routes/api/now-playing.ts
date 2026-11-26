import { subscribeOrangePiTrack } from "../../lib/orangePi.server.ts";
import { createNowPlayingFeed } from "../../lib/nowPlayingFeed.ts";
import { loadNowPlayingFallback } from "../../lib/nowPlayingFallback.server.ts";
import { nowPlayingEventStream } from "../../lib/nowPlayingSse.ts";

const feed = createNowPlayingFeed(
  subscribeOrangePiTrack,
  loadNowPlayingFallback,
);

export const handler = (request: Request): Response => {
  return new Response(nowPlayingEventStream(feed.subscribe, request.signal), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
};
