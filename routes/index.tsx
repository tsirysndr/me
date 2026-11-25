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
          <div class="profile-copy">
            <p>
              I'm a software engineer and open-source builder based in
              Antananarivo, Madagascar, with over 11 years of experience.
            </p>
            <p>
              I build things for the internet, from decentralized music
              platforms to developer tools and infrastructure.
            </p>
            <p>
              Currently building{" "}
              <a
                class="profile-bio-link"
                href="https://rocksky.app"
                target="_blank"
                rel="noopener noreferrer"
              >
                Rocksky
              </a>,{" "}
              <a
                class="profile-bio-link"
                href="https://github.com/fluentci-io/fluentci"
                target="_blank"
                rel="noopener noreferrer"
              >
                FluentCI
              </a>,{" "}
              <a
                class="profile-bio-link"
                href="https://github.com/tsirysndr/dbsandbox"
                target="_blank"
                rel="noopener noreferrer"
              >
                dbsandbox
              </a>{" "}
              and a few other{" "}
              <a
                class="profile-bio-link"
                href="https://github.com/tsirysndr"
                target="_blank"
                rel="noopener noreferrer"
              >
                open-source projects
              </a>.
            </p>
            <p>
              I enjoy working with Rust, PureScript, Gleam and TypeScript.
            </p>
            <p>
              Wanna talk about something? Send me a message on{" "}
              <a
                href="https://keybase.io/tsiry/chat"
                target="_blank"
                rel="noopener noreferrer"
              >
                Keybase
              </a>{" "}
              or email me at{" "}
              <a href="mailto:tsiry.sndr@rocksky.app">
                tsiry.sndr@rocksky.app
              </a>.
            </p>
          </div>
        </AsciiFrame>
        <OpenSource />
        <NowPlaying />
        <Footer />
      </main>
    </div>
  );
}
