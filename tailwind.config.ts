import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0f766e",
          fg: "#134e4a",
          muted: "#5eead4",
        },
      },
    },
  },
  plugins: [],
};

export default config;
