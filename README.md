# Hi, I'm Tsiry Sandratraina

This is my personal website. I'm a software engineer and I'm passionate about
technology and innovation. I'm also a fan of entrepreneurship and I'm always
looking for new opportunities to learn and grow. I'm currently working on a few
projects and I'm always looking for new opportunities to collaborate with other
people.

See this website is live at
[tsiry-sandratraina.com](https://tsiry-sandratraina.com).

The Orange Pi also hosts the browser Linux
[SSH networking relay](services/terminal-relay/README.md). Use **Ctrl +
backtick** or the floating keyboard button to open the
[browser Linux terminal](services/browser-terminal/README.md), with Bash,
OpenSSH, curl, Git, neofetch and passwordless sudo/root. **Ctrl + Shift +
backtick** toggles terminal fullscreen. **?** shows keyboard shortcuts. Linux
loads only when opened.

### Usage

Make sure to install Deno: https://deno.land/manual/getting_started/installation

Then start the project:

```
deno task start
```

This will watch the project directory and restart as necessary.

### Orange Pi live player

Browsers subscribe to `/api/now-playing` using Server-Sent Events (SSE), with
automatic reconnection and an immediate snapshot for new connections. WebSocket
playback updates are pushed straight through; the browser does not poll playback
APIs. While the Pi is unavailable, one shared server-side refresher checks the
fallback sources every three seconds for all connected visitors. SSE keep-alive
events are sent every 15 seconds, and disconnected visitors are unsubscribed.
The browser replaces stalled SSE connections after 35 seconds without an event,
and reconnects when returning to the tab or coming back online. The server
retries failed Rocksky connections, including failed login-file reads and
half-open sockets, without requiring a visitor to reload the page.

The now-playing component prefers **Orange Pi Zero 3W** whenever that device is
connected and playing, independently of Rocksky's selected player. Otherwise it
uses the normal Rocksky, Spotify, and last-played fallback. Live audio always
comes from the Orange Pi's `/live/stream.m3u8` endpoint.

Visitor volume is persisted in localStorage through a Jotai vanilla store and
restored after reloads. New visitors start muted at −24 dB. If the browser
blocks audible autoplay at a saved level, the player offers a Play button to
resume at that level. These controls affect only the visitor's stream volume.

The server maintains one read-only Rocksky WebSocket subscription using the
existing login at `~/.rocksky/token.json`. Set `ROCKSKY_TOKEN_FILE` to use
another path. The login must belong to this site's account. The SSE endpoint
returns only public track details, with caching disabled; login credentials,
queues, source stream URLs, and other devices are never returned. The
subscription sends no playback commands and never changes the primary device.

If the Pi pauses, stops, disconnects, or stops reporting fresh track data, the
website falls back automatically. Missing server credentials also use the normal
fallback; visitors never need a Rocksky login.
