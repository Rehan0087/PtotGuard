import assert from "node:assert/strict";
import test from "node:test";
import { restoreProfileState, serializeProfileState } from "./profile-store.ts";

const seededOfficer = {
  id: "usr-officer",
  name: "Nasrin Akter",
  email: "n.akter@minland.gov.bd",
  phone: "+8801712-345678",
  role: "land-office",
  jurisdictionId: "j-debidwar",
  status: "active",
  title: "Sub-Registrar",
  profileDetails: { bloodGroup: "B+", occupation: "Government Officer" },
  createdAt: "2021-01-05T09:00:00Z",
};

test("restores every editable profile field after a fresh mock-data load", () => {
  const edited = structuredClone(seededOfficer);
  edited.name = "Nasrin Sultana";
  edited.email = "nasrin.sultana@minland.gov.bd";
  edited.phone = "+8801712000000";
  edited.avatarUrl = "https://example.bd/nasrin.webp";
  edited.profileDetails = {
    nameBn: "নাসরিন সুলতানা",
    fatherName: "Abdul Hakim",
    motherName: "Rahima Begum",
    birthDate: "1987-08-19",
    bloodGroup: "AB+",
    gender: "Female",
    occupation: "Government Officer",
    currentAddress: "Debidwar, Cumilla",
    permanentAddress: "Cumilla, Bangladesh",
  };

  const persisted = serializeProfileState([edited]);
  const afterRefresh = [structuredClone(seededOfficer)];
  restoreProfileState(afterRefresh, persisted);

  assert.deepEqual(afterRefresh[0], edited);
});

test("never restores role, jurisdiction, title, status, or other managed fields", () => {
  const afterRefresh = [structuredClone(seededOfficer)];
  restoreProfileState(afterRefresh, JSON.stringify({
    version: 1,
    profiles: [{
      id: "usr-officer",
      name: "Nasrin Akter",
      email: "n.akter@minland.gov.bd",
      role: "admin",
      jurisdictionId: "j-cumilla",
      title: "Administrator",
      status: "suspended",
      profileDetails: { bloodGroup: "AB+" },
    }],
  }));

  assert.equal(afterRefresh[0].role, "land-office");
  assert.equal(afterRefresh[0].jurisdictionId, "j-debidwar");
  assert.equal(afterRefresh[0].title, "Sub-Registrar");
  assert.equal(afterRefresh[0].status, "active");
  assert.equal(afterRefresh[0].profileDetails?.bloodGroup, "AB+");
});

test("ignores malformed stored records without corrupting seeded profiles", () => {
  const afterRefresh = [structuredClone(seededOfficer)];
  restoreProfileState(afterRefresh, JSON.stringify({
    version: 1,
    profiles: [{ id: "usr-officer", name: 42, email: null }],
  }));

  assert.deepEqual(afterRefresh[0], seededOfficer);
});
