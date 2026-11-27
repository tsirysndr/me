import { request } from "node:http";
import { join } from "node:path";
export const icmpSocket = process.env.ICMP_SOCKET ||
  join(
    process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`,
    "terminal-icmp/echo.sock",
  );

export function probeViaHelper(probe, signal) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(probe);
    const req = request({
      socketPath: icmpSocket,
      path: "/echo",
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let text = "";
      res.on("data", (chunk) => {
        text += chunk;
        if (text.length > 4096) {
          req.destroy(new Error("Invalid helper response"));
        }
      });
      res.on("end", () => {
        try {
          if (res.statusCode !== 200) {
            throw new Error("ICMP helper busy or unavailable");
          }
          resolve(JSON.parse(text));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.setTimeout(3500, () => req.destroy(new Error("ICMP probe timed out")));
    req.on("error", reject);
    req.end(body);
  });
}
