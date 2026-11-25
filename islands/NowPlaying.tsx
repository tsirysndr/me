import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { useTimeFormat } from "../hooks/useFormat.tsx";
import Progressbar from "./Progressbar.tsx";
import { AsciiFrame } from "../components/AsciiFrame.tsx";

const did = "did:plc:7vdlgi2bflelz7mmuxoqjfcr";

function NowPlaying() {
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
    } | null
  >(null);
  const songRef = useRef(song);
  const isPlayingRef = useRef(isPlaying);

  const fetchNowPlaying = async () => {
    const response = await fetch(
      `https://api.rocksky.app/now-playing?did=${did}`,
    );
    const data = await response.json();
    if (Object.keys(data).length === 0) {
      await fetchSpotifyNowPlaying();
      return;
    }

    setIsPlaying(true);
    setLabel("Now Playing");

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
      deviceName: typeof data.device_name === "string"
        ? data.device_name.trim() || null
        : null,
    });
  };

  const fetchSpotifyNowPlaying = async () => {
    const response = await fetch(
      `https://api.rocksky.app/spotify/currently-playing\?did=${did}`,
    );
    const data = await response.json();

    if (Object.keys(data).length === 0) {
      setIsPlaying(false);
      await fetchLastPlayedSong();
      return;
    }

    setIsPlaying(true);
    setLabel("Now Playing");

    setSong({
      title: data.item.name,
      artist: data.item.artists.map((artist: { name: string }) => artist.name)
        .join(", "),
      duration: data.item.duration_ms,
      progress: data.progress_ms,
      albumArt: _.get(data, "item.album.images.0.url"),
      albumUri: data.albumUri
        ? `https://rocksky.app/${data.albumUri.split("at://")[1]}`
        : null,
      songUri: data.songUri
        ? `https://rocksky.app/${data.songUri.split("at://")[1]}`
        : null,
      artistUri: data.artistUri
        ? `https://rocksky.app/${data.artistUri.split("at://")[1]}`
        : null,
      isPlaying: data.is_playing,
    });
  };

  const fetchLastPlayedSong = async () => {
    const response = await fetch(
      "https://api.rocksky.app/users/tsiry-sandratraina.com/scrobbles?size=1&offset=0",
    );
    const data = await response.json();

    setLabel("Last Played");

    setSong({
      title: data[0].title,
      artist: data[0].artist,
      albumArt: data[0].album_art,
      albumUri: data[0].album_uri
        ? `https://rocksky.app/${data[0].album_uri.split("at://")[1]}`
        : null,
      songUri: data[0].track_uri
        ? `https://rocksky.app/${data[0].track_uri.split("at://")[1]}`
        : null,
      artistUri: data[0].artist_uri
        ? `https://rocksky.app/${data[0].artist_uri.split("at://")[1]}`
        : null,
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
    fetchLastPlayedSong();
    const interval = setInterval(() => {
      fetchNowPlaying();
    }, 3000);
    fetchNowPlaying();
    return () => clearInterval(interval);
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
        </p>
      )}
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
