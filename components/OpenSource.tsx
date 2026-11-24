import { AsciiFrame } from "./AsciiFrame.tsx";

const projects = [
  { name: "music-player", url: "https://github.com/tsirysndr/music-player" },
  { name: "tunein-cli", url: "https://github.com/tsirysndr/tunein-cli" },
  { name: "piratebay", url: "https://github.com/tsirysndr/piratebay" },
  { name: "rocksky", url: "https://tangled.org/rocksky.app/rocksky" },
  {
    name: "fluentci-engine",
    url: "https://github.com/fluentci-io/fluentci-engine",
  },
  { name: "fluentci-io", url: "https://github.com/fluentci-io" },
  { name: "oh-my-droid", url: "https://github.com/tsirysndr/oh-my-droid" },
  {
    name: "vmlinux-builder",
    url: "https://github.com/tsirysndr/vmlinux-builder",
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
            {projects.map(({ name, url }) => (
              <tr key={name}>
                <td class="dashed-box">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {`[${name}](${url})`}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AsciiFrame>
    </section>
  );
}
