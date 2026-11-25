import dayjs from "dayjs";
import { AsciiFrame } from "../components/AsciiFrame.tsx";
import { Footer } from "../components/Footer.tsx";
import NowPlaying from "../islands/NowPlaying.tsx";
import AnimatedName from "../islands/AnimatedName.tsx";
import ThemeChooser from "../islands/ThemeChooser.tsx";
import type { Handlers, PageProps } from "$fresh/server.ts";
import { GitHubStars } from "../components/GitHubStars.tsx";
import { getGitHubStars } from "../lib/github.ts";
import { OpenSource } from "../components/OpenSource.tsx";

interface HomeData {
  stars: number | null;
}

export const handler: Handlers<HomeData> = {
  async GET(_request, context) {
    return context.render({ stars: await getGitHubStars() });
  },
};

export default function Home({ data }: PageProps<HomeData>) {
  return (
    <div class="site-shell">
      <header class="project-topbar">
        <div class="topbar-inner">
          <nav aria-label="Projects" class="project-topbar-links">
            <a
              href="https://rocksky.app"
              target="_blank"
              rel="noopener noreferrer"
            >
              [Rocksky]
            </a>
            <a
              href="https://fluentci.io"
              target="_blank"
              rel="noopener noreferrer"
            >
              [Fluent CI]
            </a>
            <a
              href="https://github.com/tsirysndr/bsdkrun"
              target="_blank"
              rel="noopener noreferrer"
            >
              [bsdkrun]
            </a>
            <a
              href="https://github.com/tsirysndr/dbsandbox"
              target="_blank"
              rel="noopener noreferrer"
            >
              [dbsandbox]
            </a>
            <a
              href="https://github.com/tsirysndr/rockboxd"
              target="_blank"
              rel="noopener noreferrer"
            >
              [rockboxd]
            </a>
          </nav>
          <div class="topbar-actions">
            <a class="projects-button" href="#open-source">
              View More Projects
            </a>
            <GitHubStars stars={data.stars} />
            <ThemeChooser />
          </div>
        </div>
      </header>
      <main class="site-content">
        <AsciiFrame class="profile-panel">
          <p class="profile-greeting">
            Hello I'm
          </p>
          <h1 class="profile-title">
            <AnimatedName />
            <b class="name-cursor animate-blinker" aria-hidden="true">_</b>
          </h1>
          <p class="profile-copy">
            I'm a software engineer based in Antananarivo, Madagascar, with over
            {" "}
            {dayjs().diff("2015-01-01", "year")}{" "}
            years of experience. My work spans systems programming, developer
            infrastructure, and decentralized applications. My{" "}
            <a
              class="profile-bio-link"
              href="https://github.com/tsirysndr"
              target="_blank"
              rel="noopener noreferrer"
            >
              open-source work
            </a>{" "}
            includes{" "}
            <a
              class="profile-bio-link"
              href="https://github.com/tsirysndr/bsdkrun"
              target="_blank"
              rel="noopener noreferrer"
            >
              bsdkrun
            </a>, a microVM launcher;{" "}
            <a
              class="profile-bio-link"
              href="https://github.com/tsirysndr/dbsandbox"
              target="_blank"
              rel="noopener noreferrer"
            >
              dbsandbox
            </a>, database branching and sandboxing tools;{" "}
            <a
              class="profile-bio-link"
              href="https://github.com/fluentci-io/fluentci"
              target="_blank"
              rel="noopener noreferrer"
            >
              Fluent CI
            </a>, portable CI/CD tooling; and{" "}
            <a
              class="profile-bio-link"
              href="https://rocksky.app"
              target="_blank"
              rel="noopener noreferrer"
            >
              Rocksky
            </a>, a music platform built on the{" "}
            <a
              class="profile-bio-link"
              href="https://atproto.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              AT Protocol
            </a>. I work with Rust, TypeScript, Gleam, and PureScript to build
            tools that make infrastructure and development workflows easier to
            run and understand.
            <br />
            <br />
            Wanna talk about something? Send me a message on{" "}
            <a
              href="https://keybase.io/tsiry/chat"
              target="_blank"
            >
              Keybase
            </a>{" "}
            or email me at{" "}
            <a href="mailto:tsiry.sndr@rocksky.app">
              tsiry.sndr@rocksky.app
            </a>.
          </p>
        </AsciiFrame>
        <OpenSource />
        <NowPlaying />
        <Footer />
      </main>
    </div>
  );
}
