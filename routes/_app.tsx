import { type PageProps } from "$fresh/server.ts";
import { asset } from "$fresh/runtime.ts";

export default function App({ Component }: PageProps) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Tsiry Sandratraina</title>
        <link
          rel="icon"
          type="image/png"
          sizes="64x64"
          href={asset("/favicon.png")}
        />
        <link rel="shortcut icon" href={asset("/favicon.ico")} />
        <script src={asset("/theme.js")} />
        <link rel="stylesheet" href={asset("/styles.css")} />
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
}
