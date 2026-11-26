import { useEffect, useState } from "preact/hooks";
import { MIN_DB } from "../lib/liveAudio.ts";
import { liveVolume } from "../lib/liveVolume.ts";

export function useLiveVolume() {
  const [decibels, setDecibels] = useState(MIN_DB);
  useEffect(() => {
    const unsubscribe = liveVolume.subscribe(setDecibels);
    setDecibels(liveVolume.get());
    return unsubscribe;
  }, []);
  return decibels;
}
