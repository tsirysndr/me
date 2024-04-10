/** @jsx h */
import { html, h, cyan } from "./deps.ts";
import { styles } from "./src/styles.ts";
import { links } from "./src/links.ts";
import { footer } from "./src/footer.tsx";
import { bio } from "./src/bio.tsx";
import { header } from "./src/header.tsx";
import { dashboard } from "./src/stats/dashboard.tsx";
import { recentWork } from "./src/stats/recent_work.tsx";
import { contributions } from "./src/stats/contributions.tsx";

const handler = (_req: Request) =>
  html({
    title: "Tsiry Sandratraina",
    links,
    styles,
    body: (
      <body>
        <div class="wrapper">
          {header()}
          {bio()}
          <br />
          <br />
          {dashboard()}
          <div class="dashboard">
            <div style="flex: 1; margin-right: 20px;">{recentWork()}</div>
            <div style="flex: 1">{contributions()}</div>
          </div>
          <div>
            <img
              class="stats"
              src="https://stats.quine.sh/tsirysndr/topics-over-time?theme=dark"
              style="margin-bottom: 15px"
            />
            <img
              class="stats"
              src="https://stats.quine.sh/tsirysndr/languages-over-time?theme=dark"
              style="margin-bottom: 15px"
            />
          </div>
          {footer()}
        </div>
      </body>
    ),
  });

const port = Deno.env.get("PORT") ? Number(Deno.env.get("PORT")) : 8000;

Deno.serve(
  {
    port,
    onListen: () =>
      console.log(`Server started on ${cyan(`http://localhost:${port}`)} 🚀`),
  },
  handler
);
