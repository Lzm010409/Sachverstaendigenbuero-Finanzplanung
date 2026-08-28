"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { rateLimit, rateLimitReset, rateLimitStatus } from "@/lib/rate-limit";

// Nur eigene, relative Pfade als Rücksprungziel zulassen (kein Open-Redirect).
function safeCallback(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

// Brute-Force-Bremse für den Passwort-Login: höchstens 10 Fehlversuche je
// Client-IP in 15 Minuten, danach 15 Minuten Sperre (Security-Checklist:
// „Rate limiting on login endpoint"). Nur Fehlversuche zählen; ein Erfolg
// setzt den Zähler zurück.
const LOGIN_LIMIT = { max: 10, fensterMs: 15 * 60_000, sperreMs: 15 * 60_000 };

/** Ermittelt die Client-IP hinter dem Reverse-Proxy (Traefik/Cloudflare). */
async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unbekannt";
}

export async function passwordLogin(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const ip = await clientIp();

  // Vorabprüfung: schon gesperrt? Dann gar nicht erst versuchen.
  const status = rateLimitStatus(`login:${ip}`);
  if (status.gesperrt) {
    const min = Math.ceil((status.warteSek ?? 0) / 60);
    return { error: `Zu viele Fehlversuche. Bitte in ${min} Minute(n) erneut versuchen.` };
  }

  try {
    await signIn("password", {
      password: String(formData.get("password") ?? ""),
      redirectTo: safeCallback(formData.get("callbackUrl")),
    });
    // Erfolg wird über NEXT_REDIRECT geworfen (unten weitergereicht); dieser
    // Zweig wird bei Erfolg nicht erreicht.
    return {};
  } catch (error) {
    // Falsches Passwort: Fehlversuch zählen, ggf. sperren.
    if (error instanceof AuthError) {
      const r = rateLimit(`login:${ip}`, LOGIN_LIMIT);
      if (!r.erlaubt) {
        const min = Math.ceil((r.warteSek ?? 0) / 60);
        return { error: `Zu viele Fehlversuche. Bitte in ${min} Minute(n) erneut versuchen.` };
      }
      return { error: "Falsches Passwort." };
    }
    // Erfolgs-Redirect (NEXT_REDIRECT) durchreichen – vorher den Zähler leeren.
    rateLimitReset(`login:${ip}`);
    throw error;
  }
}

export async function microsoftLogin(callbackUrl?: string): Promise<void> {
  await signIn("microsoft-entra-id", { redirectTo: safeCallback(callbackUrl) });
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
