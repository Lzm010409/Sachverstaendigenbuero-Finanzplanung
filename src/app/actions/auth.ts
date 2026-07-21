"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkPassword,
  createSessionToken,
} from "@/lib/auth";

export async function login(_prev: unknown, formData: FormData): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) {
    return { error: "Falsches Passwort." };
  }
  // Secure-Flag nur setzen, wenn tatsächlich über HTTPS ausgeliefert wird
  // (hinter einem Reverse-Proxy erkennbar an x-forwarded-proto). So funktioniert
  // der Login auch bei einer reinen HTTP-Bereitstellung, ohne Endlosschleife.
  const hdrs = await headers();
  const isHttps = (hdrs.get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https";

  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect("/");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
