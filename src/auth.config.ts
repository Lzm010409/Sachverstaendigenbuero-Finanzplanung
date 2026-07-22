import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

// Edge-sichere Basiskonfiguration (ohne node:crypto), die von der Middleware
// genutzt wird. Der Credentials-Provider (Passwort-Fallback) wird erst in
// auth.ts ergänzt, da er node:crypto verwendet.

export const microsoftEnabled =
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;

const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: microsoftEnabled
    ? [
        MicrosoftEntraID({
          clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
          clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
          issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER!,
        }),
      ]
    : [],
  callbacks: {
    // Zugriffskontrolle für alle Routen. Öffentlich sind nur Login,
    // der Auth-Endpunkt und der Health-Check.
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const isPublic =
        path.startsWith("/login") ||
        path.startsWith("/api/auth") ||
        path === "/api/health" ||
        // Diagnose-Endpunkt erzwingt Token/Session selbst (Edge-Middleware kann
        // keine node:crypto-Prüfung ausführen).
        path === "/api/diagnostics";
      if (isPublic) return true;
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
