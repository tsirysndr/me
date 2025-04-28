import dayjs from "dayjs";
import { Footer } from "../components/Footer.tsx";
import NowPlaying from "../islands/NowPlaying.tsx";

export default function Home() {
  return (
    <div className="bg-[#1b0642] min-h-screen w-full text-white font-outfit">
      <div class="md:w-[704px] mx-auto pt-[23px] px-5 md:px-0">
        <h2 class="font-medium mb-0 text-[28px]">
          Hello I'm
        </h2>
        <h1 class="mb-[21.44px] text-4xl font-semibold mt-0">
          Tsiry Sandratraina
          <b class="ml-[5px] animate-blinker text-[28px]">_</b>
        </h1>
        <p class="text-[19px] mb-[40px]">
          I'm a developer and{" "}
          <a
            href="https://github.com/tsirysndr"
            class="text-[#ff5dae]"
            target="_blank"
          >
            open source enthusiast
          </a>{" "}
          with over {dayjs().diff("2015-01-01", "year")}{" "}
          years of experience in software engineering, living in Antananarivo,
          Madagascar. I enjoy working with Rust, Deno, Bun, Gleam, TypeScript,
          ReScript and PureScript. I build{" "}
          <a
            href="https://rocksky.app"
            class="text-[#ff5dae]"
            target="_blank"
          >
            Rocksky
          </a>,{" "}
          <a
            href="https://github.com/fluentci-io/fluentci"
            class="text-[#ff5dae]"
            target="_blank"
          >
            Fluent CI
          </a>,{" "}
          <a
            href="https://github.com/pocketenv-io/pocketenv"
            class="text-[#ff5dae]"
            target="_blank"
          >
            Pocketenv
          </a>,{" "}
          <a
            href="https://github.com/tsirysndr/envhub"
            class="text-[#ff5dae]"
            target="_blank"
          >
            Envhub
          </a>,{" "}
          <a
            href="https://github.com/tsirysndr/tunein-cli"
            class="text-[#ff5dae]"
            target="_blank"
          >
            TuneIn CLI
          </a>,{" "}
          <a
            href="https://github.com/tsirysndr/rockbox-zig"
            class="text-[#ff5dae]"
            target="_blank"
          >
            Rockbox Zig
          </a>{" "}
          and a few other open source projects 🦀 🦕 🧑‍🔬 ❄️ 💻 🚀.
          <br />
          <br />
          Wanna talk about something? Send me a message on{" "}
          <a
            href="https://keybase.io/tsiry/chat"
            class="text-[#ff5dae]"
            target="_blank"
          >
            Keybase
          </a>{" "}
          or email me at{" "}
          <a href="mailto:tsiry.sndr@rocksky.app" class="text-[#ff5dae]">
            tsiry.sndr@rocksky.app
          </a>.
        </p>
        <NowPlaying />
        <Footer />
      </div>
    </div>
  );
}
