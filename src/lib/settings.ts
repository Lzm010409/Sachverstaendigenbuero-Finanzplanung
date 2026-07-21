import { prisma } from "./db";

/** Liest einen Einstellungswert (oder null). */
export async function getSetting(key: string): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value ?? null;
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function isIntegrationEnabled(name: string): Promise<boolean> {
  return (await getSetting(`${name}.enabled`)) === "true";
}

/** sevDesk-Token: bevorzugt aus den Einstellungen, sonst aus der Umgebung. */
export async function getSevdeskToken(): Promise<string | null> {
  return (await getSetting("sevdesk.token")) || process.env.SEVDESK_API_TOKEN || null;
}

export async function getPipedriveToken(): Promise<string | null> {
  return (await getSetting("pipedrive.token")) || process.env.PIPEDRIVE_API_TOKEN || null;
}

export const INTEGRATIONS = {
  sevdesk: "sevdesk",
  pipedrive: "pipedrive",
} as const;
