import NextAuth from "next-auth";
import authConfig from "./auth.config";

// Zentrale Zugangskontrolle über Auth.js. Die Entscheidung trifft der
// `authorized`-Callback aus auth.config (Edge-sicher, ohne node:crypto).
export default NextAuth(authConfig).auth;

export const config = {
  // Alles schützen außer Auth-Endpunkt, Next-Interna und statischen Dateien.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
