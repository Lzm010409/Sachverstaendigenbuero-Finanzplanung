import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./auth.config";
import { checkPassword } from "@/lib/password";

// Vollständige Auth.js-Konfiguration (Node-Runtime). Ergänzt die Edge-Basis
// um den Passwort-Fallback (Credentials-Provider mit node:crypto).

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      id: "password",
      name: "Passwort",
      credentials: { password: { label: "Passwort", type: "password" } },
      authorize(credentials) {
        const pw = typeof credentials?.password === "string" ? credentials.password : "";
        return checkPassword(pw) ? { id: "owner", name: "Inhaber" } : null;
      },
    }),
  ],
});
