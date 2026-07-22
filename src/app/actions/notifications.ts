"use server";

import { buildDigest, sendDigestEmail } from "@/lib/notifications";

export async function sendDigestNow(): Promise<{ ok: boolean; message: string }> {
  const digest = await buildDigest();
  const res = await sendDigestEmail(digest);
  if (res.sent) return { ok: true, message: "Digest wurde versendet." };
  return { ok: false, message: res.reason ?? "Versand nicht möglich." };
}
