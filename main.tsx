/** @jsx h */
import { serve, html, h, dayjs, cyan } from "./deps.ts";
import { github } from "./src/github.tsx";
import { linkedin } from "./src/linkedin.tsx";
import { twitter } from "./src/twitter.tsx";

const handler = (req: Request) =>
  html({
    title: "Tsiry Sandratraina",
    links: [
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&display=swap",
      },
    ],
    styles: [
      "html, body { margin: 0; height: 100%; }",
      `body { 
        font-family: "Outfit", sans-serif;
        background: #040435; 
        color: #fff;
        display: flex; 
        flex-direction: column;
        font-size: 19px;  
    }`,
      `a {
      color: #12ff7d;
      text-decoration: none;
    }`,
      `
      .social {
        color: rgb(109, 109, 156);
      }

      .social:hover {
        color: #ffffffec;
      }
      `,
      `
      .wrapper {
        width: 704px; margin: 0 auto;
      }
      @media (max-width: 768px) {
        .wrapper {
          width: 100%;
          padding: 0 20px;
        }
      }
      `,
    ],
    body: (
      <body>
        <div class="wrapper">
          <h2 style="font-weight: 500;margin-bottom: 0">Hello, I'm</h2>
          <h1 style="font-size: 2rem; font-weight: 600; margin-top: 0">
            Tsiry Sandratraina
          </h1>
          <div style="line-height: 1.6">
            I'm a developer and{" "}
            <a href="https://github.com/tsirysndr" target="_blank">
              open source enthusiast
            </a>{" "}
            with over{" "}
            <b>{dayjs().diff(dayjs("2015"), "year")} years of experience</b> in{" "}
            <b>software engineering</b> living in Antananarivo, Madagascar. I
            like Rust, Deno, Bun, Gleam, TypeScript, ReScript and PureScript. I
            build{" "}
            <a href="https://github.com/fluentci-io/fluentci" target="_blank">
              Fluent CI
            </a>
            ,{" "}
            <a href="https://github.com/pocketenv-io/pocketenv" target="_blank">
              Pocketenv
            </a>
            ,{" "}
            <a href="https://github.com/tsirysndr/envhub" target="_blank">
              Envhub
            </a>
            ,{" "}
            <a href="https://github.com/tsirysndr/tunein-cli" target="_blank">
              TuneIn CLI
            </a>{" "}
            and few other open source projects. <br />
            <br />
            Wanna to talk about something? Send me a message on{" "}
            <a href="https://keybase.io/tsiry/chat">Keybase</a> or email me at{" "}
            <a href="mailto:tsiry.sndr@fluentci.io">tsiry.sndr@fluentci.io</a>.
          </div>
          <br />
          <br />
          <div style="display: flex; flex-direction: row; justify-content: space-between;">
            <div style="color: rgb(109, 109, 156); font-size: 17px;">
              © {dayjs().format("YYYY")} Tsiry Sandratraina.
            </div>
            <div style="display: flex; flex-direction: row; justify-content: space-around; width: 100px;">
              {github()}
              {twitter()}
              {linkedin()}
            </div>
          </div>
        </div>
      </body>
    ),
  });

serve(handler, {
  onListen: () =>
    console.log(`Server started on ${cyan("http://localhost:8000")} 🚀`),
});
