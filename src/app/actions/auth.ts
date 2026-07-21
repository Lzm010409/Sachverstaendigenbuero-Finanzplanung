"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export async function passwordLogin(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    await signIn("password", {
      password: String(formData.get("password") ?? ""),
      redirectTo: "/",
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

export async function microsoftLogin(): Promise<void> {
  await signIn("microsoft-entra-id", { redirectTo: "/" });
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
