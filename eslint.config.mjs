import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

// Next.js-Regelwerk (Core Web Vitals) im Flat-Config-Format. Der generierte
// Standalone-Output und Abhängigkeiten bleiben außen vor.
const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    ignores: [".next/**", "node_modules/**", "prisma/migrations/**"],
  },
  {
    rules: {
      // Deutsche Typografie („…") nutzt bewusst Anführungszeichen im JSX-Text.
      // Sie rendern korrekt; ein Escapen brächte keinen Nutzen. Alle anderen
      // Regeln bleiben streng.
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
