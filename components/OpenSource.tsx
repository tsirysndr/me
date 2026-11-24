import { AsciiFrame } from "./AsciiFrame.tsx";

const projects = [
  "music-player",
  "tunein-cli",
  "piratebay",
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
          <p>A selection of my most-starred projects on GitHub.</p>
        </div>
        <table class="open-source-projects">
          <caption class="sr-only">Open source project repositories</caption>
          <tbody>
            {projects.map((name) => (
              <tr key={name}>
                <td class="dashed-box">
                  <a
                    href={`https://github.com/tsirysndr/${name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {`[${name}](https://github.com/tsirysndr/${name})`}
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
