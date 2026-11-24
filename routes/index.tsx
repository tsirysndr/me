import dayjs from "dayjs";
import { Footer } from "../components/Footer.tsx";
import NowPlaying from "../islands/NowPlaying.tsx";
import AnimatedName from "../islands/AnimatedName.tsx";

export default function Home() {
  return (
    <div className="site-shell bg-[#090512] min-h-screen w-full text-white font-outfit">
      <header class="project-topbar">
        <nav aria-label="Projects" class="project-topbar-links">
          <a
            href="https://rocksky.app"
            target="_blank"
            rel="noopener noreferrer"
          >
            [Rocksky]
          </a>
          <a
            href="https://fluenci.io"
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
        </nav>
      </header>
      <div class="site-content">
        <h2 class="font-medium mb-0 text-[28px]">
          Hello I'm
        </h2>
        <h1 class="mb-[21.44px] text-4xl font-semibold mt-0">
          <AnimatedName />
          <b class="ml-[5px] animate-blinker text-[28px]">_</b>
        </h1>
        <p class="text-[19px] mb-[40px]">
          I'm a software engineer based in Antananarivo, Madagascar, with over
          {" "}
          {dayjs().diff("2015-01-01", "year")}{" "}
          years of experience. My work spans systems programming, developer
          infrastructure, and decentralized applications. My{" "}
          <a
            href="https://github.com/tsirysndr"
            class="text-[#ff2bd6]"
            target="_blank"
            rel="noopener noreferrer"
          >
            open-source work
          </a>{" "}
          includes{" "}
          <a
            href="https://github.com/tsirysndr/bsdkrun"
            class="text-[#ff2bd6]"
            target="_blank"
            rel="noopener noreferrer"
          >
            bsdkrun
          </a>, a microVM launcher;{" "}
          <a
            href="https://github.com/tsirysndr/dbsandbox"
            class="text-[#ff2bd6]"
            target="_blank"
            rel="noopener noreferrer"
          >
            dbsandbox
          </a>, database branching and sandboxing tools;{" "}
          <a
            href="https://github.com/fluentci-io/fluentci"
            class="text-[#ff2bd6]"
            target="_blank"
            rel="noopener noreferrer"
          >
            Fluent CI
          </a>, portable CI/CD tooling; and{" "}
          <a
            href="https://rocksky.app"
            class="text-[#ff2bd6]"
            target="_blank"
            rel="noopener noreferrer"
          >
            Rocksky
          </a>, a music platform built on the AT Protocol. I work with Rust,
          TypeScript, Gleam, and PureScript to build tools that make
          infrastructure and development workflows easier to run and understand.
          <br />
          <br />
          Wanna talk about something? Send me a message on{" "}
          <a
            href="https://keybase.io/tsiry/chat"
            class="text-[#ff2bd6]"
            target="_blank"
          >
            Keybase
          </a>{" "}
          or email me at{" "}
          <a href="mailto:tsiry.sndr@rocksky.app" class="text-[#ff2bd6]">
            tsiry.sndr@rocksky.app
          </a>.
        </p>
        <NowPlaying />
        <Footer />
      </div>
    </div>
  );
}
