/** @jsx h */
import { dayjs, h } from "../deps.ts";

export function bio() {
  return (
    <div style="line-height: 1.6">
      I'm a developer and{" "}
      <a href="https://github.com/tsirysndr" target="_blank">
        open source enthusiast
      </a>{" "}
      with over <b>{dayjs().diff(dayjs("2015"), "year")} years of experience</b>{" "}
      in <b>software engineering</b> living in Antananarivo, Madagascar. I like
      Rust, Deno, Bun, Gleam, TypeScript, ReScript and PureScript. I build{" "}
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
      </a>
      ,{" "}
      <a href="https://github.com/tsirysndr/rockbox-zig" target="_blank">
        Rockbox Zig
      </a>{" "}
      and few other open source projects 🦀 🦕 🧑‍🔬 ❄️ 💻 🚀. <br />
      <br />
      Wanna talk about something? Send me a message on{" "}
      <a href="https://keybase.io/tsiry/chat">Keybase</a> or email me at{" "}
      <a href="mailto:tsiry.sndr@fluentci.io">tsiry.sndr@fluentci.io</a>.
    </div>
  );
}
