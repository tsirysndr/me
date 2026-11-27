# Browser Linux networking relay

This standalone Node.js service provides WISP networking for a browser Linux VM.
It does not run a shell on the Orange Pi. The terminal UI, Linux image, Fish and
OpenSSH client are separate browser components.

Public WebSocket URL: `wss://tsiry-sandratraina.com/terminal/relay/`

For unkernel, pass the relay as its network backend:

```js
net: {
  kind: "net",
  backend: { kind: "wisp", servers: ["wss://tsiry-sandratraina.com/terminal/relay/"] },
}
```

All public destinations on TCP ports 22, 80 and 443 are allowed for SSH, curl
and Git over HTTPS. UDP, other ports, loopback, private networks, link-local
addresses, and Tailscale/CGNAT addresses are blocked, including destinations
which resolve to those addresses. Each SSH target still requires its own
authentication. This endpoint does not grant access to the Orange Pi's SSH
server or supply SSH credentials.

The relay accepts the website's Origin (not an authentication mechanism), allows
up to eight WebSocket clients and four streams per client, and expires sessions
after one hour. WebSocket messages are capped at 64 KiB. Service limits cap
memory at 192 MiB and CPU at half of one core.

## Development

Requires Node.js 24 or newer:

```sh
npm ci --ignore-scripts
npm test
npm start
```

The service listens only on `127.0.0.1:8181`. `/healthz` is a local health
check. Set `RELAY_ORIGIN` to test with another frontend origin.

## Orange Pi deployment

From `/home/orangepi/github/me/services/terminal-relay`:

```sh
npm ci --ignore-scripts --omit=dev
cp terminal-relay.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now terminal-relay.service
```

Add this handler before the website's catch-all handler in Caddy's `:8081`
block. Keep the trailing slash and preserve the request path:

```caddyfile
handle /terminal/relay/ {
    reverse_proxy 127.0.0.1:8181
}
```

Validate the Caddy configuration before restarting its service. Cloudflare and
the existing tunnel carry the WebSocket connection to Caddy.

```sh
systemctl --user status terminal-relay.service
journalctl --user -u terminal-relay.service -f
curl http://127.0.0.1:8181/healthz
```

Uses [wisp-js](https://github.com/MercuryWorkshop/wisp-js), pinned through the
npm lockfile. The relay's WISP endpoint is compatible with
[unkernel's Wisp backend](https://github.com/pithings/unkernel#add-a-network).
