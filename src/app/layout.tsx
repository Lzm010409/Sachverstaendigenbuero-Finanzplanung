import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Liquiditätsplanung",
  description: "Self-hosted Liquiditäts- und Finanzplanung",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
