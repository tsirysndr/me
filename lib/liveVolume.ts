import { createStore } from "jotai/vanilla";
import { atomWithStorage, createJSONStorage } from "jotai/vanilla/utils";
import { clampVolumeDb, MAX_DB, MIN_DB } from "./liveAudio.ts";

export const VOLUME_STORAGE_KEY = "rocksky-live-volume-db";

export interface VolumeStringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  subscribe?(key: string, callback: (value: string | null) => void): () => void;
}

const unavailableStorage: VolumeStringStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function browserStorage(): VolumeStringStorage {
  try {
    return "document" in globalThis
      ? globalThis.localStorage
      : unavailableStorage;
  } catch {
    return unavailableStorage;
  }
}

function restoredVolume(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) &&
      value >= MIN_DB && value <= MAX_DB
    ? clampVolumeDb(value)
    : MIN_DB;
}

export function createLiveVolume(getStorage = browserStorage) {
  const json = createJSONStorage<unknown>(getStorage);
  const storage = {
    getItem(key: string, initial: number) {
      try {
        return restoredVolume(json.getItem(key, initial));
      } catch {
        return initial;
      }
    },
    setItem(key: string, value: number) {
      try {
        json.setItem(key, value);
      } catch { /* Keep the in-memory setting. */ }
    },
    removeItem(key: string) {
      try {
        json.removeItem(key);
      } catch { /* Storage can be unavailable. */ }
    },
    subscribe(key: string, callback: (value: number) => void, initial: number) {
      try {
        return json.subscribe?.(
          key,
          (value) => callback(restoredVolume(value)),
          initial,
        ) ??
          (() => {});
      } catch {
        return () => {};
      }
    },
  };
  // Read storage on subscription, not during SSR, to keep hydration consistent.
  const volumeAtom = atomWithStorage(VOLUME_STORAGE_KEY, MIN_DB, storage);
  const store = createStore();
  return {
    get: () => store.get(volumeAtom),
    set(update: number | ((value: number) => number)) {
      store.set(
        volumeAtom,
        (current) =>
          clampVolumeDb(
            typeof update === "function" ? update(current) : update,
          ),
      );
      return store.get(volumeAtom);
    },
    subscribe(callback: (value: number) => void) {
      return store.sub(volumeAtom, () => callback(store.get(volumeAtom)));
    },
  };
}

export const liveVolume = createLiveVolume();
