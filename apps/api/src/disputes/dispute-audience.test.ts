import { describe, expect, it } from "vitest";
import { disputeAudience } from "./dispute-audience";

describe("disputeAudience", () => {
  it("includes the filer and every party matched to a user", () => {
    const dispute = {
      filedById: "usr-ayesha",
      parties: [
        { name: "Ayesha Siddika", role: "claimant" as const, userId: "usr-ayesha" },
        { name: "Md. Karim Uddin", role: "respondent" as const, userId: "usr-karim" },
      ],
    };

    expect(disputeAudience(dispute, "someone-else").sort()).toEqual(["usr-ayesha", "usr-karim"]);
  });

  it("drops a party with no matching account", () => {
    const dispute = {
      filedById: "usr-shanti",
      parties: [{ name: "Unknown occupant", role: "respondent" as const }],
    };

    expect(disputeAudience(dispute, "someone-else")).toEqual(["usr-shanti"]);
  });

  it("excludes the actor — telling someone what they just did is noise", () => {
    const dispute = {
      filedById: "usr-ayesha",
      parties: [{ name: "Ayesha Siddika", role: "claimant" as const, userId: "usr-ayesha" }],
    };

    expect(disputeAudience(dispute, "usr-ayesha")).toEqual([]);
  });

  it("dedupes the filer against a party who is also them", () => {
    const dispute = {
      filedById: "usr-ayesha",
      parties: [{ name: "Ayesha Siddika", role: "claimant" as const, userId: "usr-ayesha" }],
    };

    expect(disputeAudience(dispute, "someone-else")).toEqual(["usr-ayesha"]);
  });
});
