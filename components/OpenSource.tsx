import { AsciiFrame } from "./AsciiFrame.tsx";

const projects = [
  {
    name: "snapcaster",
    url: "https://github.com/tsirysndr/snapcaster",
    description: "Stream macOS audio to Snapcast and Squeezebox players.",
  },
  {
    name: "hlsd",
    url: "https://github.com/tsirysndr/hlsd",
    description: "Serve raw audio as live HLS and MPEG-DASH streams.",
  },
  {
    name: "squeezed",
    url: "https://github.com/tsirysndr/squeezed",
    description: "Stream raw audio to Squeezelite and Squeezebox clients.",
  },
  {
    name: "macports-rs",
    url: "https://github.com/tsirysndr/macports-rs",
    description:
      "A standalone Rust implementation of the MacPorts command-line interface.",
  },
  {
    name: "bsdkrun",
    url: "https://github.com/tsirysndr/bsdkrun",
    description: "Run BSD, Linux, and unikernel microVMs on macOS and Linux.",
  },
  {
    name: "music-player",
    url: "https://github.com/tsirysndr/music-player",
    description: "An extensible music server written in Rust.",
  },
  {
    name: "tunein-cli",
    url: "https://github.com/tsirysndr/tunein-cli",
    description: "Browse and listen to internet radio from your terminal.",
  },
  {
    name: "piratebay",
    url: "https://github.com/tsirysndr/piratebay",
    description: "Search and download torrents from the command line.",
  },
  {
    name: "rocksky",
    url: "https://tangled.org/rocksky.app/rocksky",
    description:
      "A decentralized music tracking and discovery platform on AT Protocol.",
  },
  {
    name: "fluentci-engine",
    url: "https://github.com/fluentci-io/fluentci-engine",
    description:
      "A programmable CI/CD engine built with Rust, WebAssembly, and Nix.",
  },
  {
    name: "fluentci-io",
    url: "https://github.com/fluentci-io",
    description: "Open-source tooling for portable builds and CI/CD workflows.",
  },
  {
    name: "oh-my-droid",
    url: "https://github.com/tsirysndr/oh-my-droid",
    description:
      "An opinionated Linux terminal setup for Android 15 and later.",
  },
  {
    name: "vmlinux-builder",
    url: "https://github.com/tsirysndr/vmlinux-builder",
    description:
      "Build custom Linux kernels for Firecracker and other microVMs.",
  },
];

export function OpenSource() {
  return (
    <section
      id="open-source"
      class="open-source"
      aria-labelledby="open-source-title"
      tabIndex={-1}
    >
      <AsciiFrame class="open-source-box">
        <div class="open-source-heading">
          <h2 id="open-source-title">Open Source</h2>
          <p>Selected projects and open-source work.</p>
        </div>
        <table class="open-source-projects">
          <caption class="sr-only">Open source project repositories</caption>
          <tbody>
            {projects.map(({ name, url, description }) => (
              <tr key={name}>
                <td class="dashed-box">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {`[${name}](${url})`}
                  </a>
                  <p class="project-description">{description}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AsciiFrame>
    </section>
  );
}
