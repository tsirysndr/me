import { type PageProps } from "$fresh/server.ts";

declare global {
  interface Window {
    dataLayer: any[];
  }
}

export default function App({ Component }: PageProps) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Tsiry Sandratraina</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>

      <script
        async
        src="https://www.googletagmanager.com/gtag/js?id=G-2LP61SRX58"
      >
      </script>
      <script>
        window.dataLayer = window.dataLayer || []; function gtag(){window
          .dataLayer.push(arguments)}

        gtag('js', new Date());

        gtag('config', 'G-2LP61SRX58');
      </script>

      <body>
        <Component />
      </body>
    </html>
  );
}
