import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { useTimeFormat } from "../hooks/useFormat.tsx";
import Progressbar from "./Progressbar.tsx";

const did = "did:plc:7vdlgi2bflelz7mmuxoqjfcr";

function NowPlaying() {
  const progressInterval = useRef<number | null>(null);
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

  return (
    <div>
      {song && (
        <>
          <div class="flex flex-row">
            {song?.albumUri && (
              <a href={song.albumUri.replace("app.rocksky.", "")} target="_blank" class="mr-[20px]">
                <div class="max-w-[96px] max-h-[96px]">
                  <img
                    class="w-[96px] h-[96px] rounded-[10px]"
                    src={song?.albumArt!}
                  />
                </div>
              </a>
            )}
            {!song?.albumUri && (
              <div class="max-w-[96px] max-h-[96px] mr-[20px]">
                <img
                  class="w-[96px] h-[96px] rounded-[10px] mr-[20px]"
                  src={song?.albumArt!}
                />
              </div>
            )}
            <div>
              <p class="text-[16px] text-[rgb(109,109,156)]">
                {label}
                {" on "}
                <a
                  href={`https://rocksky.app/profile/tsiry-sandratraina.com`}
                  target="_blank"
                >
                  <b>Rocksky</b>
                </a>
              </p>
              <div>
                {song?.songUri && (
                  <a
                    href={song?.songUri?.replace("app.rocksky.", "")}
                    class="text-[20px] line-clamp-1 overflow-hidden text-ellipsis max-w-[240px] md:max-w-[630px]"
                    target="_blank"
                  >
                    {song?.title}
                  </a>
                )}
                {!song?.songUri && (
                  <p class="text-[20px] line-clamp-1 overflow-hidden text-ellipsis max-w-[240px] md:max-w-[630px]">
                    {song?.title}
                  </p>
                )}
              </div>
              <div>
                {song?.artistUri && (
                  <a
                    href={song?.artistUri?.replace("app.rocksky.", "")}
                    class="line-clamp-1 overflow-hidden text-ellipsis max-w-[240px] md:max-w-[630px]"
                    target="_blank"
                  >
                    {song?.artist}
                  </a>
                )}
                {!song?.artistUri && (
                  <p class="line-clamp-1 overflow-hidden text-ellipsis max-w-[240px] md:max-w-[630px]">
                    {song?.artist}
                  </p>
                )}
              </div>
            </div>
          </div>
          {isPlaying && (
            <div class="flex flex-row justify-between mt-[15px]">
              <span class="text-[rgb(109,109,156)] text-[16px]">
                {formatTime(song?.progress || 0)}
              </span>
              <Progressbar
                progress={progress}
                class="mt-[10px] ml-[10px] mr-[10px]"
              />
              <span class="text-[rgb(109,109,156)] text-[16px]">
                {formatTime(song?.duration || 0)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default NowPlaying;
