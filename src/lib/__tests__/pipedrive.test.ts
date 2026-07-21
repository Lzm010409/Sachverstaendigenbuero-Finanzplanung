import { describe, expect, it } from "vitest";
import { mapOrganization, mapPerson } from "../pipedrive";

describe("pipedrive mapPerson", () => {
  it("mappt Person mit emails-Array und org_id-Objekt", () => {
    const m = mapPerson({
      id: 19,
      name: "Luke Gollenstede",
      emails: [{ label: "work", value: "luke@example.com", primary: true }],
      org_id: { name: "Muster GmbH", value: 5 },
    })!;
    expect(m.externalId).toBe("19");
    expect(m.type).toBe("PERSON");
    expect(m.email).toBe("luke@example.com");
    expect(m.orgName).toBe("Muster GmbH");
  });

  it("nimmt primäre E-Mail aus email-Array (v1)", () => {
    const m = mapPerson({
      id: 7,
      name: "Max",
      email: [
        { value: "a@x.de", primary: false },
        { value: "b@x.de", primary: true },
      ],
    })!;
    expect(m.email).toBe("b@x.de");
    expect(m.orgName).toBeNull();
  });

  it("liefert null ohne id/name", () => {
    expect(mapPerson({ name: "Ohne ID" })).toBeNull();
    expect(mapPerson({ id: 1, name: "" })).toBeNull();
  });
});

describe("pipedrive mapOrganization", () => {
  it("mappt Organisation", () => {
    const m = mapOrganization({ id: 42, name: "ACME AG" })!;
    expect(m).toEqual({ externalId: "42", type: "ORG", name: "ACME AG", email: null, orgName: null });
  });
});
