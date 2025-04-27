import { useEffect, useState } from "preact/hooks";

const did = "did:plc:7vdlgi2bflelz7mmuxoqjfcr";

function NowPlaying() {
  const [label, setLabel] = useState("Now Playing");
  const [song, setSong] = useState<
    {
      title: string;
      artist: string;
      albumArt?: string | null;
      albumUri?: string | null;
      songUri?: string | null;
      artistUri?: string | null;
    } | null
  >(null);

  const fetchNowPlaying = async () => {
    const response = await fetch(
      `https://api.rocksky.app/now-playing?did=${did}`,
    );
    const data = await response.json();
    if (Object.keys(data).length === 0) {
      await fetchSpotifyNowPlaying();
      return;
    }
  };

  const fetchSpotifyNowPlaying = async () => {
    const response = await fetch(
      `https://api.rocksky.app/spotify/currently-playing\?did=${did}`,
    );
    const data = await response.json();

    if (Object.keys(data).length === 0) {
      await fetchLastPlayedSong();
      return;
    }

    setSong({
      title: data.item.name,
      artist: data.item.artists.map((artist: { name: string }) => artist.name)
        .join(", "),
      albumArt: data.item.album.images[0].url,
      albumUri: data.albumUri
        ? `https://rocksky.app/${data.albumUri.split("at://")[1]}`
        : null,
      songUri: data.songUri
        ? `https://rocksky.app/${data.songUri.split("at://")[1]}`
        : null,
      artistUri: data.artistUri
        ? `https://rocksky.app/${data.artistUri.split("at://")[1]}`
        : null,
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

  useEffect(() => {
    const interval = setInterval(() => {
      fetchNowPlaying();
    }, 15000);
    fetchNowPlaying();
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      {song && (
        <div class="flex flex-row">
          {song?.albumUri && (
            <a href={song.albumUri} target="_blank" class="mr-[20px]">
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
                  href={song?.songUri}
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
                  href={song?.artistUri}
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
      )}
    </div>
  );
}

export default NowPlaying;
