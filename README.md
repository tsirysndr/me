# Hi, I'm Tsiry Sandratraina

This is my personal website. I'm a software engineer and I'm passionate about
technology and innovation. I'm also a fan of entrepreneurship and I'm always
looking for new opportunities to learn and grow. I'm currently working on a few
projects and I'm always looking for new opportunities to collaborate with other
people.

See this website is live at
[tsiry-sandratraina.com](https://tsiry-sandratraina.com).

### Usage

Make sure to install Deno: https://deno.land/manual/getting_started/installation

Then start the project:

```
deno task start
```

This will watch the project directory and restart as necessary.

### Orange Pi live player

The now-playing component prefers **Orange Pi Zero 3W** whenever that device is
connected and playing, independently of Rocksky's selected player. Otherwise it
uses the normal Rocksky, Spotify, and last-played fallback. Live audio always
comes from the Orange Pi's `/live/stream.m3u8` endpoint.

The server maintains one read-only Rocksky WebSocket subscription using the
existing login at `~/.rocksky/token.json`. Set `ROCKSKY_TOKEN_FILE` to use
another path. The login must belong to this site's account. `/api/orange-pi`
returns only the Pi's public track details, with caching disabled; login
credentials, queues, source stream URLs, and other devices are never returned.
The subscription sends no playback commands and never changes the primary
device.

If the Pi pauses, stops, disconnects, or stops reporting fresh track data, the
website falls back automatically. Missing server credentials also use the normal
fallback; visitors never need a Rocksky login.
