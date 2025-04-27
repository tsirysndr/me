import { type Config } from "tailwindcss";

export default {
  content: [
    "{routes,islands,components}/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        outfit: ["Outfit", "sans-serif"],
      },
      keyframes: {
        blinker: {
          "50%": { opacity: "0" },
        },
      },
      animation: {
        blinker: "blinker 1s infinite",
      },
    },
  },
} satisfies Config;
