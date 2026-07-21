// Client für die Pipedrive-API v1 (Auth über api_token-Query-Parameter).
// Wir lesen Personen und Organisationen als Kontakte.

export interface MappedContact {
  externalId: string;
  type: "PERSON" | "ORG";
  name: string;
  email: string | null;
  orgName: string | null;
}

interface RawObj {
  [k: string]: unknown;
}

function baseUrl(domain: string): string {
  // Domain kann "kfz-..." oder eine volle URL sein.
  const d = domain.replace(/^https?:\/\//, "").replace(/\.pipedrive\.com.*/, "");
  return `https://${d}.pipedrive.com/api/v1`;
}

function primaryEmail(o: RawObj): string | null {
  const arr = (o.email ?? o.emails) as Array<{ value?: string; primary?: boolean }> | undefined;
  if (Array.isArray(arr) && arr.length) {
    const p = arr.find((e) => e.primary) ?? arr[0];
    return p?.value ?? null;
  }
  if (typeof o.email === "string") return o.email;
  return null;
}

export function mapPerson(o: RawObj): MappedContact | null {
  const id = o.id != null ? String(o.id) : "";
  const name = String(o.name ?? "").trim();
  if (!id || !name) return null;
  const org = o.org_id;
  const orgName =
    org && typeof org === "object" ? String((org as RawObj).name ?? "") || null : (o.org_name as string) || null;
  return { externalId: id, type: "PERSON", name, email: primaryEmail(o), orgName };
}

export function mapOrganization(o: RawObj): MappedContact | null {
  const id = o.id != null ? String(o.id) : "";
  const name = String(o.name ?? "").trim();
  if (!id || !name) return null;
  return { externalId: id, type: "ORG", name, email: null, orgName: null };
}

async function fetchPaged(
  token: string,
  domain: string,
  resource: "persons" | "organizations",
  map: (o: RawObj) => MappedContact | null,
): Promise<MappedContact[]> {
  const out: MappedContact[] = [];
  const limit = 500;
  for (let start = 0; start < 100_000; start += limit) {
    const url = `${baseUrl(domain)}/${resource}?api_token=${encodeURIComponent(token)}&limit=${limit}&start=${start}`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pipedrive ${res.status}: ${body.slice(0, 160)}`);
    }
    const data = (await res.json()) as {
      data?: RawObj[] | null;
      additional_data?: { pagination?: { more_items_in_collection?: boolean } };
    };
    for (const o of data.data ?? []) {
      const m = map(o);
      if (m) out.push(m);
    }
    if (!data.additional_data?.pagination?.more_items_in_collection) break;
  }
  return out;
}

export async function fetchPersons(token: string, domain: string): Promise<MappedContact[]> {
  return fetchPaged(token, domain, "persons", mapPerson);
}

export async function fetchOrganizations(token: string, domain: string): Promise<MappedContact[]> {
  return fetchPaged(token, domain, "organizations", mapOrganization);
}
