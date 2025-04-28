import tailwind from "$fresh/plugins/tailwind.ts";
import { defineConfig } from "$fresh/server.ts";
import { gaPlugin } from "ga/mod.ts";

export default defineConfig({
  plugins: [tailwind(), gaPlugin({ enableServerGa: true })],
});
