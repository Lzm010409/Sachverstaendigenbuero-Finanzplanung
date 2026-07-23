"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

// Nur eigene, relative Pfade als Rücksprungziel zulassen (kein Open-Redirect).
function safeCallback(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function passwordLogin(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    await signIn("password", {
      password: String(formData.get("password") ?? ""),
      redirectTo: safeCallback(formData.get("callbackUrl")),
    });
    return {};
  } catch (error) {
    // Erfolgs-Redirect (NEXT_REDIRECT) muss durchgereicht werden.
    if (error instanceof AuthError) {
      return { error: "Falsches Passwort." };
    }
    throw error;
  }
}

export async function microsoftLogin(callbackUrl?: string): Promise<void> {
  await signIn("microsoft-entra-id", { redirectTo: safeCallback(callbackUrl) });
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
