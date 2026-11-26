import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { useTimeFormat } from "../hooks/useFormat.tsx";
import Progressbar from "./Progressbar.tsx";
import { AsciiFrame } from "../components/AsciiFrame.tsx";
import LiveAudio from "./LiveAudio.tsx";
import { canStreamFromDevice } from "../lib/liveAudio.ts";
import { AudioEqualizer } from "../components/AudioEqualizer.tsx";
import { formatAudioDetails } from "../lib/audioFormat.ts";
import type { NowPlayingSnapshot } from "../lib/nowPlayingFeed.ts";

function NowPlaying() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [liveAvailable, setLiveAvailable] = useState(false);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [progress, setProgress] = useState(0);
  const { formatTime } = useTimeFormat();
  const [label, setLabel] = useState("Now Playing");
  const [isPlaying, setIsPlaying] = useState(false);
  const [song, setSong] = useState<
    {
      title: string;
      artist: string;
      albumArt?: string | null;
      albumUri?: string | null;
      songUri?: string | null;
      artistUri?: string | null;
      duration?: number;
      progress?: number;
      isPlaying?: boolean;
      deviceName?: string | null;
      audioFormat?: string;
    } | null
  >(null);
  const songRef = useRef(song);
  const isPlayingRef = useRef(isPlaying);

  const applySnapshot = (snapshot: NowPlayingSnapshot) => {
    const data = snapshot.track;
    if (!data) {
      setSong(null);
      setIsPlaying(false);
      return;
    }
    const lastPlayed = snapshot.source === "last-played";
    setIsPlaying(!lastPlayed);
    setLabel(lastPlayed ? "Last Played" : "Now Playing");
    setSong({
      title: data.title,
      artist: data.album_artist || data.artist,
      albumArt: data.album_art,
      albumUri: data.album_uri
        ? `https://rocksky.app/${data.album_uri.split("at://")[1]}`
        : null,
      songUri: data.song_uri
        ? `https://rocksky.app/${data.song_uri.split("at://")[1]}`
        : null,
      artistUri: data.artist_uri
        ? `https://rocksky.app/${data.artist_uri.split("at://")[1]}`
        : null,
      isPlaying: data.is_playing,
      duration: data.length,
      progress: data.elapsed,
      deviceName: data.device_name.trim() || null,
      audioFormat: formatAudioDetails(data),
    });
  };

  const startProgressTracking = useCallback(() => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }

    progressInterval.current = setInterval(() => {
      if (!isPlayingRef.current) {
        setProgress(0);
        return;
      }

      if (
        songRef.current && songRef.current.progress && songRef.current.duration
      ) {
        setProgress(Math.floor(
          (songRef.current.progress / songRef.current.duration) * 100,
        ));
        setSong((prevSong) => {
          if (
            prevSong &&
            _.get(prevSong, "progress", 0) >= _.get(prevSong, "duration", 0)
          ) {
            return {
              ...prevSong,
              progress: 0,
            };
          }

          if (prevSong?.isPlaying) {
            return {
              ...prevSong!,
              progress: (songRef.current?.progress || 0) + 100,
            };
          }
          return prevSong;
        });
      }
    }, 100);

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    const events = new EventSource("/api/now-playing");
    const update = (event: MessageEvent<string>) => {
      try {
        const snapshot = JSON.parse(event.data);
        if (
          ["orange-pi", "rocksky", "spotify", "last-played"].includes(
            snapshot.source,
          ) &&
          (snapshot.track === null || typeof snapshot.track?.title === "string")
        ) applySnapshot(snapshot);
      } catch {
        // Keep the last valid state if an event is malformed. EventSource
        // reconnects automatically and receives a fresh snapshot after a drop.
      }
    };
    events.addEventListener("now-playing", update);
    return () => {
      events.removeEventListener("now-playing", update);
      events.close();
    };
  }, []);

  useEffect(() => {
    startProgressTracking();

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    songRef.current = song;
    isPlayingRef.current = isPlaying;
  }, [song, isPlaying]);

  return song && (
    <AsciiFrame class="music-player">
      <div class="music-player-tools">
        {song.deviceName && (
          <p class="music-device">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="12" cy="14" r="4" />
              <circle
                cx="12"
                cy="7"
                r="0.75"
                fill="currentColor"
                stroke="none"
              />
            </svg>
            <span class="sr-only">Playback device:</span>
            <span>{song.deviceName}</span>
            {canStreamFromDevice(song.deviceName) && liveAvailable && (
              <AudioEqualizer audioRef={audioRef} />
            )}
          </p>
        )}
        {canStreamFromDevice(song.deviceName) && (
          <LiveAudio
            audioRef={audioRef}
            available={liveAvailable}
            setAvailable={setLiveAvailable}
          />
        )}
      </div>
      <div class="music-row">
        {song.albumArt && (
          song.albumUri
            ? (
              <a
                class="music-artwork-link"
                href={song.albumUri.replace("app.rocksky.", "")}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  class="music-artwork"
                  src={song.albumArt}
                  alt={`${song.title} album artwork`}
                  width="64"
                  height="64"
                />
              </a>
            )
            : (
              <img
                class="music-artwork"
                src={song.albumArt}
                alt={`${song.title} album artwork`}
                width="64"
                height="64"
              />
            )
        )}
        <div class="music-details">
          <div class="music-label-row">
            <p class="music-label">
              {label} on{" "}
              <a
                href="https://rocksky.app/profile/tsiry-sandratraina.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Rocksky ↗
              </a>
            </p>
            {canStreamFromDevice(song.deviceName) && liveAvailable &&
              song.audioFormat && (
              <p
                class="music-format"
                title="Source audio format"
                aria-label={`Source audio format: ${song.audioFormat}`}
              >
                {song.audioFormat}
              </p>
            )}
          </div>
          {song.songUri
            ? (
              <a
                class="music-title"
                href={song.songUri.replace("app.rocksky.", "")}
                target="_blank"
                rel="noopener noreferrer"
              >
                {song.title}
              </a>
            )
            : <p class="music-title">{song.title}</p>}
          {song.artistUri
            ? (
              <a
                class="music-artist"
                href={song.artistUri.replace("app.rocksky.", "")}
                target="_blank"
                rel="noopener noreferrer"
              >
                {song.artist}
              </a>
            )
            : <p class="music-artist">{song.artist}</p>}
        </div>
      </div>
      {isPlaying && (
        <div class="music-progress">
          <span class="music-time">{formatTime(song.progress || 0)}</span>
          <Progressbar progress={progress} />
          <span class="music-time">{formatTime(song.duration || 0)}</span>
        </div>
      )}
    </AsciiFrame>
  );
}

export default NowPlaying;
