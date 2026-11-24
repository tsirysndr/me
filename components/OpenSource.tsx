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
        <ul class="open-source-projects">
          {projects.map((name) => (
            <li key={name}>
              <a
                href={`https://github.com/tsirysndr/${name}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {`[${name}](https://github.com/tsirysndr/${name})`}
              </a>
            </li>
          ))}
        </ul>
      </AsciiFrame>
    </section>
  );
}
