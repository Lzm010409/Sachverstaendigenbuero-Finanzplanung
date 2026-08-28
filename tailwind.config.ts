import type { Config } from "tailwindcss";

// Design-Tokens übernommen aus dem "Judia" Admin-Template (Bootstrap 5.3):
// primär #007FFF, Erfolg #11b07a, Gefahr #e6693a, Warnung #ffc107, Info #0dcaf0,
// Textfarbe #4a566c, Überschriften #424e66, Rahmen #e9ecef, Radius 0.375/0.5rem.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primär-Akzent der App = Judia-Blau (löst das bisherige Teal ab). Alle
        // vorhandenen `brand`-Klassen im Code übernehmen damit den neuen Ton.
        brand: {
          DEFAULT: "#007FFF",
          fg: "#0066cc",
          hover: "#006cd9",
          muted: "#cce5ff",
        },
        // Semantische Judia-Farben (für neue Komponenten direkt nutzbar).
        primary: {
          DEFAULT: "#007FFF",
          fg: "#0066cc",
          subtle: "#cce5ff",
        },
        success: "#11b07a",
        danger: "#e6693a",
        warning: "#ffc107",
        info: "#0dcaf0",
        // Neutrale Fläche/Text an Judia angeglichen.
        surface: "#ffffff",
        page: "#f5f6f8",
        // Bestehende semantische Skalen auf die Judia-Töne feinjustiert, damit
        // Einnahmen-Grün / Ausgaben-Rot / Warn-Gelb dem Template entsprechen.
        emerald: {
          50: "#e7f7f1",
          100: "#cfefe4",
          200: "#a0dfca",
          500: "#11b07a",
          600: "#0e9268",
          700: "#0a7553",
        },
        red: {
          50: "#fdf1ec",
          100: "#fae1d8",
          200: "#f5c3b0",
          500: "#e6693a",
          600: "#d1552a",
          700: "#b0451f",
        },
        amber: {
          50: "#fff8e6",
          100: "#fff3cd",
          500: "#ffc107",
          600: "#e0a800",
          700: "#a97e00",
        },
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Noto Sans",
          "Arial",
          "sans-serif",
          "Apple Color Emoji",
          "Segoe UI Emoji",
        ],
      },
      fontSize: {
        // Judia-Grundschriftgröße.
        base: ["0.925rem", { lineHeight: "1.5" }],
      },
      borderRadius: {
        // Judia: base 0.375rem, lg 0.5rem.
        lg: "0.5rem",
        xl: "0.5rem",
      },
      boxShadow: {
        sm: "0 0.125rem 0.25rem rgba(0, 0, 0, 0.06)",
        DEFAULT: "0 0.5rem 1rem rgba(0, 0, 0, 0.05)",
        card: "0 1px 2px rgba(56, 65, 74, 0.06), 0 2px 6px rgba(56, 65, 74, 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
