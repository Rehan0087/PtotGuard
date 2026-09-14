import assert from "node:assert/strict";
import test from "node:test";
import {
  MockProfileUpdateError,
  PROFILE_PHOTO_MAX_BYTES,
  applyMockProfileUpdate,
  fieldProfilePayload,
  validateProfilePhotoFile,
  validateFieldProfile,
} from "./field-profile.ts";

const agent = {
  id: "usr-agent",
  name: "Jahangir Alam",
  email: "j.alam@minland.gov.bd",
  phone: "+8801711000000",
  role: "field-agent",
  jurisdictionId: "j-debidwar",
  avatarUrl: undefined,
  profileDetails: { employeeCode: "FA-1042" },
  status: "active",
  title: "Survey Amin",
  createdAt: "2022-03-14T09:00:00Z",
};

const other = { ...agent, id: "usr-other", email: "used@minland.gov.bd" };

test("builds a normalized payload containing only self-service fields", () => {
  assert.deepEqual(
    fieldProfilePayload({
      name: "  Jahangir Alam  ",
      email: "  J.ALAM@MINLAND.GOV.BD ",
      phone: " +8801711000000 ",
      avatarUrl: " https://example.bd/avatar.jpg ",
      currentAddress: " Debidwar, Cumilla ",
      emergencyContact: " +8801811000000 ",
    }),
    {
      name: "Jahangir Alam",
      email: "j.alam@minland.gov.bd",
      phone: "+8801711000000",
      avatarUrl: "https://example.bd/avatar.jpg",
      currentAddress: "Debidwar, Cumilla",
      emergencyContact: "+8801811000000",
    },
  );
});

test("mock self-service update preserves role and managed profile details", () => {
  const users = [structuredClone(agent), structuredClone(other)];
  const updated = applyMockProfileUpdate(users, agent.id, {
    name: "Md. Jahangir Alam",
    email: "new@minland.gov.bd",
    currentAddress: "Cumilla",
    emergencyContact: "+8801911000000",
  });

  assert.equal(updated.role, "field-agent");
  assert.equal(updated.title, "Survey Amin");
  assert.deepEqual(updated.profileDetails, {
    employeeCode: "FA-1042",
    currentAddress: "Cumilla",
    emergencyContact: "+8801911000000",
  });
});

test("mock update rejects managed fields and duplicate email", () => {
  const users = [structuredClone(agent), structuredClone(other)];
  assert.throws(
    () => applyMockProfileUpdate(users, agent.id, { role: "admin" }),
    (error) => error instanceof MockProfileUpdateError && error.status === 400,
  );
  assert.throws(
    () => applyMockProfileUpdate(users, agent.id, { email: other.email.toUpperCase() }),
    (error) => error instanceof MockProfileUpdateError && error.status === 409,
  );
});

test("client validation rejects malformed editable values before submission", () => {
  assert.deepEqual(
    validateFieldProfile({
      name: "J",
      email: "not-an-email",
      phone: "1".repeat(33),
      avatarUrl: "javascript:alert(1)",
      currentAddress: "",
      emergencyContact: "",
    }),
    ["name", "email", "phone", "avatarUrl"],
  );
});

test("profile validation accepts supported local image data without changing its content", () => {
  const avatarUrl = "data:image/png;base64,iVBORw0KGgo=";
  const values = {
    name: "Jahangir Alam",
    email: "j.alam@minland.gov.bd",
    phone: "",
    avatarUrl,
    currentAddress: "",
    emergencyContact: "",
  };

  assert.equal(fieldProfilePayload(values).avatarUrl, avatarUrl);
  assert.deepEqual(validateFieldProfile(values), []);
});

test("profile validation rejects unsupported or oversized local images", () => {
  assert.equal(validateProfilePhotoFile({ type: "image/svg+xml", size: 100 }), "type");
  assert.equal(
    validateProfilePhotoFile({ type: "image/jpeg", size: PROFILE_PHOTO_MAX_BYTES + 1 }),
    "size",
  );

  const invalidData = {
    name: "Jahangir Alam",
    email: "j.alam@minland.gov.bd",
    phone: "",
    avatarUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    currentAddress: "",
    emergencyContact: "",
  };
  assert.deepEqual(validateFieldProfile(invalidData), ["avatarUrl"]);
});
