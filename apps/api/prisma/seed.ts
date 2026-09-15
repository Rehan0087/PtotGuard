/**
 * Seeds the local Postgres database. Ported from the frontend's mock dataset
 * (lib/mocks/data.ts in the web app) so the two look identical when someone
 * enables NEXT_PUBLIC_API_MOCKING and browses the fixture API — divergence
 * between the two becomes visible on sight instead of needing a diff.
 *
 * `npx prisma db seed`, or automatically after `prisma migrate reset`.
 */
import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ancestryOf, buildUlpin, type Jurisdiction } from "@plotguard/rules";
import { computeHash } from "../src/audit/audit-hash";
import { DEMO_PASSWORD_HASH } from "./demo-password";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});


function square(c: { lat: number; lng: number }, d = 0.0009) {
  const { lat, lng } = c;
  return {
    type: "Polygon" as const,
    coordinates: [
      [
        [lng - d, lat - d],
        [lng + d, lat - d],
        [lng + d, lat + d],
        [lng - d, lat + d],
        [lng - d, lat - d],
      ],
    ],
  };
}

async function main(): Promise<void> {
  // --- Jurisdictions — parents before children, so the self-FK is always
  // satisfied on insert rather than needing a second deferred pass. ---------
  await prisma.jurisdiction.createMany({
    data: ([
      { id: "j-chattogram", code: "CTG", name: "Chattogram Division", nameBn: "চট্টগ্রাম বিভাগ", level: "division", parentId: null },
      { id: "j-cumilla", code: "CTG-CUM", name: "Cumilla District", nameBn: "কুমিল্লা জেলা", level: "district", parentId: "j-chattogram" },
      { id: "j-debidwar", code: "CTG-CUM-DEB", name: "Debidwar Upazila", nameBn: "দেবিদ্বার উপজেলা", level: "upazila", parentId: "j-cumilla" },
      { id: "j-barura", code: "CTG-CUM-BAR", name: "Barura Upazila", nameBn: "বরুড়া উপজেলা", level: "upazila", parentId: "j-cumilla" },
      { id: "j-rajamehar", code: "CTG-CUM-DEB-RAJ", name: "Rajamehar Mouza", nameBn: "রাজামেহার মৌজা", level: "mouza", parentId: "j-debidwar" },
      { id: "j-payalgacha", code: "CTG-CUM-BAR-PAY", name: "Payalgacha Mouza", nameBn: "পয়ালগাছা মৌজা", level: "mouza", parentId: "j-barura" },
    ] satisfies Prisma.JurisdictionCreateManyInput[]),
  });

  // --- Users ------------------------------------------------------------
  await prisma.user.createMany({
    data: [
      { id: "usr-ayesha", name: "Ayesha Siddika", email: "ayesha.siddika@example.bd", phone: "+8801711-4xxxxx", role: "citizen", jurisdictionId: "j-rajamehar", nationalId: "•••• •••• 4821", status: "active", createdAt: new Date("2024-02-11T09:00:00Z"), profileDetails: { nameBn: "আয়েশা সিদ্দিকা", occupation: "Teacher", bloodGroup: "A+", gender: "Female", birthDate: "1985-11-20", currentAddress: "Village: Rajamehar, Upazila: Debidwar", fatherName: "Late Ali Akbar", motherName: "Rokeya Begum" } },
      { id: "usr-karim", name: "Md. Karim Uddin", email: "karim.uddin@example.bd", phone: "+8801811-2xxxxx", role: "citizen", jurisdictionId: "j-rajamehar", nationalId: "•••• •••• 7734", status: "active", createdAt: new Date("2023-11-03T09:00:00Z") },
      { id: "usr-iqbal", name: "Iqbal Enterprise", email: "iqbal.enterprise@example.bd", role: "citizen", jurisdictionId: "j-debidwar", status: "active", createdAt: new Date("2026-06-30T10:00:00Z") },
      { id: "usr-shanti", name: "Shanti Rani Das", email: "shanti.das@example.bd", phone: "+8801911-8xxxxx", role: "citizen", jurisdictionId: "j-payalgacha", nationalId: "•••• •••• 1290", status: "active", createdAt: new Date("2024-06-19T09:00:00Z") },
      { id: "usr-officer", name: "Nasrin Akter", email: "n.akter@minland.gov.bd", phone: "+8801712-345678", role: "land-office", jurisdictionId: "j-debidwar", title: "Sub-Registrar", profileDetails: { nameBn: "নাসরিন আক্তার", fatherName: "Abdul Hakim", motherName: "Rahima Begum", birthDate: "1987-08-19", bloodGroup: "B+", gender: "Female", occupation: "Government Officer", currentAddress: "Debidwar, Cumilla", permanentAddress: "Cumilla, Bangladesh", address: "Debidwar, Cumilla" }, status: "active", createdAt: new Date("2021-01-05T09:00:00Z") },
      { id: "usr-officer2", name: "Abdul Mannan", email: "a.mannan@minland.gov.bd", role: "land-office", jurisdictionId: "j-barura", title: "Registration Clerk", status: "active", createdAt: new Date("2022-08-22T09:00:00Z") },
      { id: "usr-agent", name: "Jahangir Alam", email: "j.alam@minland.gov.bd", phone: "+8801711-9xxxxx", role: "field-agent", jurisdictionId: "j-debidwar", title: "Survey Amin", status: "active", createdAt: new Date("2022-03-14T09:00:00Z") },
      { id: "usr-agent2", name: "Rezaul Karim", email: "r.karim@minland.gov.bd", role: "field-agent", jurisdictionId: "j-barura", title: "Survey Assistant", status: "active", createdAt: new Date("2023-05-30T09:00:00Z") },
      // District-level, so she covers every upazila and mouza beneath Cumilla.
      { id: "usr-agent3", name: "Farhana Yeasmin", email: "f.yeasmin@minland.gov.bd", phone: "+8801611-3xxxxx", role: "field-agent", jurisdictionId: "j-cumilla", title: "District Survey Officer", status: "active", createdAt: new Date("2021-07-11T09:00:00Z") },
      { id: "usr-agent4", name: "Mizanur Rahman", email: "m.rahman@minland.gov.bd", role: "field-agent", jurisdictionId: "j-debidwar", title: "Survey Amin", status: "suspended", createdAt: new Date("2023-02-08T09:00:00Z") },
      { id: "usr-mediator", name: "Shahida Khatun", email: "s.khatun@landtribunal.gov.bd", role: "mediator", jurisdictionId: "j-cumilla", title: "Land Tribunal Mediator (Retd. Judge)", status: "active", createdAt: new Date("2020-09-01T09:00:00Z") },
      { id: "usr-mediator2", name: "Anwara Begum", email: "a.begum@landtribunal.gov.bd", role: "mediator", jurisdictionId: "j-cumilla", title: "Land Tribunal Mediator", status: "active", createdAt: new Date("2021-03-15T09:00:00Z") },
      { id: "usr-admin", name: "Registry Administrator", email: "admin@plotguard.gov.bd", role: "admin", jurisdictionId: "j-cumilla", title: "Registry Administrator", status: "active", createdAt: new Date("2020-01-01T09:00:00Z") },
      // Legacy owners referenced only from ownership history — never sign in.
      { id: "usr-legacy-1", name: "Abdul Jalil Sarkar", email: "legacy-1@example.bd", role: "citizen", jurisdictionId: "j-rajamehar", status: "invited", createdAt: new Date("1998-03-01T00:00:00Z") },
      { id: "usr-legacy-2", name: "Late Fazlul Haque", email: "legacy-2@example.bd", role: "citizen", jurisdictionId: "j-rajamehar", status: "invited", createdAt: new Date("1990-04-02T00:00:00Z") },
    ].map((user) =>
      user.status === "active" ? { ...user, passwordHash: DEMO_PASSWORD_HASH } : user,
    ),
  });

  // --- Parcels ------------------------------------------------------------
  const parcels = [
    { id: "p-142", dagNo: "CS-142/3", khatianNo: "512", title: "Paddy field, Rajamehar", jurisdictionId: "j-rajamehar", landUse: "agricultural", area: { value: 82, unit: "decimal" }, ownerId: "usr-ayesha", ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.549, lng: 90.989 }, boundary: square({ lat: 23.549, lng: 90.989 }), marketValue: { amount: 4800000, currency: "BDT" }, registeredAt: new Date("2015-07-20T00:00:00Z"), lastMutationAt: new Date("2015-07-20T00:00:00Z") },
    { id: "p-088", dagNo: "RS-88", khatianNo: "217", title: "Homestead plot, Rajamehar", jurisdictionId: "j-rajamehar", landUse: "residential", area: { value: 8, unit: "katha" }, ownerId: "usr-legacy-2", ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.5502, lng: 90.9871 }, boundary: square({ lat: 23.5502, lng: 90.9871 }, 0.0005), marketValue: { amount: 3200000, currency: "BDT" }, registeredAt: new Date("1990-04-02T00:00:00Z"), lastMutationAt: null },
    { id: "p-092", dagNo: "RS-92/4", khatianNo: "640", title: "Roadside plot, Rajamehar", jurisdictionId: "j-rajamehar", landUse: "residential", area: { value: 5, unit: "katha" }, ownerId: "usr-ayesha", ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.5475, lng: 90.9905 }, boundary: square({ lat: 23.5475, lng: 90.9905 }, 0.0006), marketValue: { amount: 2600000, currency: "BDT" }, registeredAt: new Date("2026-07-10T00:00:00Z"), lastMutationAt: null },
    { id: "p-205", dagNo: "BS-205", khatianNo: "1104", title: "Betel-nut orchard, Payalgacha", jurisdictionId: "j-payalgacha", landUse: "agricultural", area: { value: 120, unit: "decimal" }, ownerId: "usr-shanti", ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.3625, lng: 91.033 }, boundary: square({ lat: 23.3625, lng: 91.033 }, 0.0015), marketValue: { amount: 6900000, currency: "BDT" }, registeredAt: new Date("2018-01-16T00:00:00Z"), lastMutationAt: new Date("2018-01-16T00:00:00Z") },
    { id: "p-311", dagNo: "RS-311/2", khatianNo: "355", title: "Bazar shop plot, Debidwar", jurisdictionId: "j-debidwar", landUse: "commercial", area: { value: 3, unit: "katha" }, ownerId: "usr-iqbal", ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.551, lng: 90.986 }, boundary: square({ lat: 23.551, lng: 90.986 }, 0.0004), marketValue: { amount: 9500000, currency: "BDT" }, registeredAt: new Date("2019-10-08T00:00:00Z"), lastMutationAt: new Date("2026-06-30T10:00:00Z") },
    { id: "p-176", dagNo: "CS-176", khatianNo: "489", title: "Hillfoot plot, Payalgacha", jurisdictionId: "j-payalgacha", landUse: "vacant", area: { value: 60, unit: "decimal" }, ownerId: "usr-karim", ownershipType: "joint", registryStatus: "flagged", centroid: { lat: 23.359, lng: 91.0365 }, boundary: square({ lat: 23.359, lng: 91.0365 }, 0.0012), marketValue: { amount: 3700000, currency: "BDT" }, registeredAt: new Date("2012-05-22T00:00:00Z"), lastMutationAt: null },
    { id: "p-401", dagNo: "RS-401", khatianNo: "701", title: "North paddy plot, Rajamehar", jurisdictionId: "j-rajamehar", landUse: "agricultural", area: { value: 46, unit: "decimal" }, ownerId: "usr-ayesha", ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.552, lng: 90.991 }, boundary: square({ lat: 23.552, lng: 90.991 }, 0.0007), marketValue: { amount: 2850000, currency: "BDT" }, registeredAt: new Date("2020-03-12T00:00:00Z"), lastMutationAt: null },
    { id: "p-402", dagNo: "RS-402", khatianNo: "702", title: "Canal-side homestead, Rajamehar", jurisdictionId: "j-rajamehar", landUse: "residential", area: { value: 6, unit: "katha" }, ownerId: "usr-karim", ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.553, lng: 90.992 }, boundary: square({ lat: 23.553, lng: 90.992 }, 0.0005), marketValue: { amount: 4100000, currency: "BDT" }, registeredAt: new Date("2017-09-18T00:00:00Z"), lastMutationAt: null },
    { id: "p-403", dagNo: "RS-403", khatianNo: "703", title: "South boundary plot, Rajamehar", jurisdictionId: "j-rajamehar", landUse: "vacant", area: { value: 31, unit: "decimal" }, ownerId: "usr-ayesha", ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.554, lng: 90.993 }, boundary: square({ lat: 23.554, lng: 90.993 }, 0.0006), marketValue: { amount: 2300000, currency: "BDT" }, registeredAt: new Date("2016-11-05T00:00:00Z"), lastMutationAt: null },
    { id: "p-404", dagNo: "RS-404", khatianNo: "704", title: "Market approach plot, Debidwar", jurisdictionId: "j-debidwar", landUse: "commercial", area: { value: 4, unit: "katha" }, ownerId: "usr-iqbal", ownershipType: "corporate", registryStatus: "verified", centroid: { lat: 23.555, lng: 90.994 }, boundary: square({ lat: 23.555, lng: 90.994 }, 0.0004), marketValue: { amount: 7800000, currency: "BDT" }, registeredAt: new Date("2022-02-14T00:00:00Z"), lastMutationAt: null },
    { id: "p-405", dagNo: "RS-405", khatianNo: "705", title: "West garden plot, Rajamehar", jurisdictionId: "j-rajamehar", landUse: "mixed", area: { value: 38, unit: "decimal" }, ownerId: "usr-karim", ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.556, lng: 90.995 }, boundary: square({ lat: 23.556, lng: 90.995 }, 0.0007), marketValue: { amount: 3350000, currency: "BDT" }, registeredAt: new Date("2014-06-21T00:00:00Z"), lastMutationAt: new Date("2026-08-28T10:00:00Z") },
    { id: "p-801", dagNo: "RS-801", khatianNo: "501", title: "Mango Orchard", jurisdictionId: "j-rajamehar", landUse: "agricultural", area: { value: 50, unit: "decimal" }, ownerId: "usr-ayesha", ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.540, lng: 90.990 }, boundary: square({ lat: 23.540, lng: 90.990 }), marketValue: { amount: 1500000, currency: "BDT" }, registeredAt: new Date("2018-05-22T00:00:00Z"), lastMutationAt: null },
    { id: "p-802", dagNo: "RS-802", khatianNo: "502", title: "Fish Pond", jurisdictionId: "j-rajamehar", landUse: "agricultural", area: { value: 30, unit: "decimal" }, ownerId: "usr-ayesha", ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.541, lng: 90.991 }, boundary: square({ lat: 23.541, lng: 90.991 }), marketValue: { amount: 1200000, currency: "BDT" }, registeredAt: new Date("2019-01-10T00:00:00Z"), lastMutationAt: null },
    { id: "p-803", dagNo: "RS-803", khatianNo: "503", title: "Village Home", jurisdictionId: "j-payalgacha", landUse: "residential", area: { value: 10, unit: "katha" }, ownerId: "usr-ayesha", ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.350, lng: 91.030 }, boundary: square({ lat: 23.350, lng: 91.030 }), marketValue: { amount: 2500000, currency: "BDT" }, registeredAt: new Date("2017-11-05T00:00:00Z"), lastMutationAt: null },
    { id: "p-804", dagNo: "RS-804", khatianNo: "504", title: "Corner Store", jurisdictionId: "j-payalgacha", landUse: "commercial", area: { value: 2, unit: "katha" }, ownerId: "usr-ayesha", ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.351, lng: 91.031 }, boundary: square({ lat: 23.351, lng: 91.031 }), marketValue: { amount: 4500000, currency: "BDT" }, registeredAt: new Date("2021-04-15T00:00:00Z"), lastMutationAt: null },
    { id: "p-888", dagNo: "RS-888", khatianNo: "305", title: "River-adjacent land, Payalgacha", jurisdictionId: "j-payalgacha", landUse: "vacant", area: { value: 150, unit: "decimal" }, ownerId: "usr-ayesha", ownershipType: "sole", registryStatus: "pending", centroid: { lat: 23.360, lng: 91.035 }, boundary: square({ lat: 23.360, lng: 91.035 }, 0.002), marketValue: { amount: 5000000, currency: "BDT" }, registeredAt: new Date("2010-06-15T00:00:00Z"), lastMutationAt: null },
    { id: "p-999", dagNo: "BS-999", khatianNo: "2205", title: "Commercial Plot, Rajamehar", jurisdictionId: "j-rajamehar", landUse: "commercial", area: { value: 20, unit: "decimal" }, ownerId: "usr-ayesha", ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.555, lng: 90.995 }, boundary: square({ lat: 23.555, lng: 90.995 }), marketValue: { amount: 15000000, currency: "BDT" }, registeredAt: new Date("2020-01-01T00:00:00Z"), lastMutationAt: null },
  ] satisfies Prisma.ParcelCreateManyInput[];

  // ULPINs are generated, never hand-written, so the seed proves the same
  // rule the API will use. Sequence runs per upazila — the upazila is already
  // in the string, so a global counter would waste the range and make two
  // adjacent plots look unrelated.
  const jurisdictionRows = await prisma.jurisdiction.findMany();
  const sequenceByUpazila = new Map<string, number>();
  const withUlpin = parcels.map((parcel) => {
    const upazila = ancestryOf(parcel.jurisdictionId, jurisdictionRows as Jurisdiction[]).find(
      (j) => j.level === "upazila",
    );
    const key = upazila?.id ?? "none";
    const next = (sequenceByUpazila.get(key) ?? 0) + 1;
    sequenceByUpazila.set(key, next);

    const result = buildUlpin(parcel.jurisdictionId, jurisdictionRows as Jurisdiction[], next);
    // A parcel whose chain has no upazila gets no ULPIN rather than a
    // placeholder — the column is nullable for exactly this case.
    return { ...parcel, ulpin: result.ok ? result.ulpin : null };
  });

  await prisma.parcel.createMany({ data: withUlpin });

  // Encumbrances. Chosen to exercise both effects the rule distinguishes: a
  // mortgage that permits transfer with the lender's release, and blockers on
  // the two plots already in dispute. One lifted mortgage so the "expired"
  // path is represented in real data, not only in tests.
  await prisma.parcelRestriction.createMany({
    data: [
      { id: "res-1", parcelId: "p-088", type: "mortgage", authority: "Sonali Bank, Debidwar Branch", referenceNo: "SB/MTG/2024/0412", note: "Charged against an agricultural loan.", fromDate: new Date("2024-03-11T00:00:00Z"), toDate: null },
      { id: "res-2", parcelId: "p-176", type: "injunction", authority: "Cumilla Joint District Judge Court", referenceNo: "Title Suit 214/2026", note: "Dealings restrained pending disposal of the forged-deed suit.", fromDate: new Date("2026-07-02T00:00:00Z"), toDate: null },
      { id: "res-3", parcelId: "p-205", type: "acquisition", authority: "Deputy Commissioner, Cumilla", referenceNo: "LA Case 39/2026", note: "Section 4 notice served for the Debidwar–Barura road widening.", fromDate: new Date("2026-06-20T00:00:00Z"), toDate: null },
      // Discharged — active-restriction filtering must leave this out.
      { id: "res-4", parcelId: "p-311", type: "mortgage", authority: "Janata Bank, Cumilla", referenceNo: "JB/MTG/2019/1188", note: "Discharged on repayment.", fromDate: new Date("2019-11-02T00:00:00Z"), toDate: new Date("2025-01-30T00:00:00Z") },
    ] as Prisma.ParcelRestrictionCreateManyInput[],
  });

  await prisma.ownershipRecord.createMany({
    data: [
      { id: "own-1", parcelId: "p-142", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "purchase", fromDate: new Date("2015-07-20T00:00:00Z"), toDate: null, documentId: "d-2" },
      { id: "own-2", parcelId: "p-142", ownerId: "usr-legacy-1", ownerName: "Abdul Jalil Sarkar", acquisitionType: "grant", fromDate: new Date("1998-03-01T00:00:00Z"), toDate: new Date("2015-07-20T00:00:00Z") },
      { id: "own-4", parcelId: "p-088", ownerId: "usr-legacy-2", ownerName: "Late Fazlul Haque", acquisitionType: "inheritance", fromDate: new Date("1990-04-02T00:00:00Z"), toDate: null },
      { id: "own-5", parcelId: "p-311", ownerId: "usr-karim", ownerName: "Md. Karim Uddin", acquisitionType: "purchase", fromDate: new Date("2019-10-08T00:00:00Z"), toDate: new Date("2026-06-30T10:00:00Z") },
      { id: "own-7", parcelId: "p-401", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "purchase", fromDate: new Date("2020-03-12T00:00:00Z"), toDate: null, documentId: "d-14" },
      { id: "own-8", parcelId: "p-402", ownerId: "usr-karim", ownerName: "Md. Karim Uddin", acquisitionType: "purchase", fromDate: new Date("2017-09-18T00:00:00Z"), toDate: null, documentId: "d-15" },
      { id: "own-9", parcelId: "p-403", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "inheritance", fromDate: new Date("2016-11-05T00:00:00Z"), toDate: null, documentId: "d-16" },
      { id: "own-10", parcelId: "p-404", ownerId: "usr-iqbal", ownerName: "Iqbal Enterprise", acquisitionType: "purchase", fromDate: new Date("2022-02-14T00:00:00Z"), toDate: null, documentId: "d-17" },
      { id: "own-11", parcelId: "p-405", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "purchase", fromDate: new Date("2014-06-21T00:00:00Z"), toDate: new Date("2026-08-28T10:00:00Z") },
      { id: "own-801", parcelId: "p-801", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "purchase", fromDate: new Date("2018-05-22T00:00:00Z"), toDate: null },
      { id: "own-802", parcelId: "p-802", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "purchase", fromDate: new Date("2019-01-10T00:00:00Z"), toDate: null },
      { id: "own-803", parcelId: "p-803", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "inheritance", fromDate: new Date("2017-11-05T00:00:00Z"), toDate: null },
      { id: "own-804", parcelId: "p-804", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "purchase", fromDate: new Date("2021-04-15T00:00:00Z"), toDate: null },
      { id: "own-888", parcelId: "p-888", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "inheritance", fromDate: new Date("2010-06-15T00:00:00Z"), toDate: null },
      { id: "own-999", parcelId: "p-999", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "purchase", fromDate: new Date("2020-01-01T00:00:00Z"), toDate: null },
    ],
  });

  // --- Documents ----------------------------------------------------------
  await prisma.landDocument.createMany({
    data: [
      { id: "d-1", parcelId: "p-142", ownerId: "usr-ayesha", type: "title-deed", fileName: "khatian-142-512.pdf", mimeType: "application/pdf", sizeBytes: 482103, pageCount: 4, uploadedAt: new Date("2026-07-18T11:20:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.02, extractedFields: { "Dag No": "CS-142/3", Khatian: "512", Owner: "Ayesha Siddika" } },
      { id: "d-2", parcelId: "p-142", ownerId: "usr-ayesha", type: "sale-deed", fileName: "dolil-2015.pdf", mimeType: "application/pdf", sizeBytes: 903221, pageCount: 8, uploadedAt: new Date("2026-07-12T09:05:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.05 },
      { id: "d-3", parcelId: "p-088", ownerId: "usr-ayesha", type: "inheritance-affidavit", fileName: "warish-affidavit-088.pdf", mimeType: "application/pdf", sizeBytes: 221900, pageCount: 3, uploadedAt: new Date("2026-07-21T14:40:00Z"), uploadedById: "usr-ayesha", ocrStatus: "processing", verificationStatus: "unverified" },
      { id: "d-4", ownerId: "usr-ayesha", type: "id-proof", fileName: "nid-masked.jpg", mimeType: "image/jpeg", sizeBytes: 154002, uploadedAt: new Date("2026-07-10T08:00:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.01 },
      { id: "d-5", parcelId: "p-205", ownerId: "usr-shanti", type: "survey-report", fileName: "survey-205.pdf", mimeType: "application/pdf", sizeBytes: 671220, pageCount: 6, uploadedAt: new Date("2026-07-05T10:15:00Z"), uploadedById: "usr-officer2", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.08 },
      { id: "d-6", parcelId: "p-176", ownerId: "usr-karim", type: "sale-deed", fileName: "dolil-176-scan.pdf", mimeType: "application/pdf", sizeBytes: 1120345, pageCount: 5, uploadedAt: new Date("2026-07-19T16:30:00Z"), uploadedById: "usr-karim", ocrStatus: "extracted", verificationStatus: "flagged", fraudScore: 0.82, extractedFields: { "Dag No": "CS-176", "Stamp Value": "mismatch" } },
      { id: "d-7", parcelId: "p-311", ownerId: "usr-karim", type: "tax-receipt", fileName: "khajna-receipt-2026.pdf", mimeType: "application/pdf", sizeBytes: 88210, pageCount: 1, uploadedAt: new Date("2026-07-01T12:00:00Z"), uploadedById: "usr-karim", ocrStatus: "extracted", verificationStatus: "verified" },
      { id: "d-8", parcelId: "p-092", ownerId: "usr-ayesha", type: "title-deed", fileName: "khatian-092-640.pdf", mimeType: "application/pdf", sizeBytes: 402100, pageCount: 4, uploadedAt: new Date("2026-07-22T09:30:00Z"), uploadedById: "usr-ayesha", ocrStatus: "pending", verificationStatus: "unverified" },
      { id: "d-9", parcelId: "p-088", type: "mutation-order", fileName: "namjari-order-088.pdf", mimeType: "application/pdf", sizeBytes: 210554, pageCount: 2, uploadedAt: new Date("2026-07-20T11:00:00Z"), uploadedById: "usr-officer", ocrStatus: "processing", verificationStatus: "unverified" },
      { id: "d-10", parcelId: "p-205", type: "court-order", fileName: "court-order-205.pdf", mimeType: "application/pdf", sizeBytes: 512000, pageCount: 7, uploadedAt: new Date("2026-06-28T15:20:00Z"), uploadedById: "usr-officer2", ocrStatus: "extracted", verificationStatus: "verified" },
      { id: "d-11", parcelId: "p-176", ownerId: "usr-karim", type: "sale-deed", fileName: "dolil-176-alt.pdf", mimeType: "application/pdf", sizeBytes: 980112, pageCount: 5, uploadedAt: new Date("2026-07-20T10:10:00Z"), uploadedById: "usr-officer2", ocrStatus: "extracted", verificationStatus: "flagged", fraudScore: 0.67, extractedFields: { "Dag No": "CS-176", Signature: "possible forgery" } },
      // Read cleanly, but the dag on the scan is not the dag it was filed
      // against — the OCR queue holds this and routes it to fraud review.
      { id: "d-12", parcelId: "p-311", ownerId: "usr-karim", type: "survey-report", fileName: "survey-311-amin.pdf", mimeType: "application/pdf", sizeBytes: 733410, pageCount: 4, uploadedAt: new Date("2026-07-23T08:45:00Z"), uploadedById: "usr-officer2", ocrStatus: "extracted", verificationStatus: "unverified", extractedFields: { "Dag No": "RS-311/7", Khatian: "355", Area: "3 katha" } },
      // A phone photo of a bound register page — the reader gave up on it.
      { id: "d-13", parcelId: "p-176", ownerId: "usr-karim", type: "title-deed", fileName: "khatian-176-photo.jpg", mimeType: "image/jpeg", sizeBytes: 3204118, uploadedAt: new Date("2026-07-24T17:05:00Z"), uploadedById: "usr-karim", ocrStatus: "failed", verificationStatus: "unverified" },
      { id: "d-14", parcelId: "p-401", ownerId: "usr-ayesha", type: "title-deed", fileName: "khatian-401-701.pdf", mimeType: "application/pdf", sizeBytes: 388120, pageCount: 3, uploadedAt: new Date("2026-08-10T09:00:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.01, extractedFields: { "Dag No": "RS-401", Khatian: "701", Owner: "Ayesha Siddika" } },
      { id: "d-15", parcelId: "p-402", ownerId: "usr-karim", type: "sale-deed", fileName: "sale-deed-402.pdf", mimeType: "application/pdf", sizeBytes: 612480, pageCount: 6, uploadedAt: new Date("2026-09-05T08:30:00Z"), uploadedById: "usr-karim", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.03, extractedFields: { "Dag No": "RS-402", Khatian: "702", Owner: "Md. Karim Uddin" } },
      { id: "d-16", parcelId: "p-403", ownerId: "usr-ayesha", type: "survey-report", fileName: "boundary-survey-403.pdf", mimeType: "application/pdf", sizeBytes: 544210, pageCount: 5, uploadedAt: new Date("2026-09-07T07:00:00Z"), uploadedById: "usr-agent", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.02 },
      { id: "d-17", parcelId: "p-404", ownerId: "usr-iqbal", type: "title-deed", fileName: "deed-404-scan.pdf", mimeType: "application/pdf", sizeBytes: 721330, pageCount: 7, uploadedAt: new Date("2026-09-08T10:15:00Z"), uploadedById: "usr-iqbal", ocrStatus: "extracted", verificationStatus: "flagged", fraudScore: 0.86, extractedFields: { "Dag No": "RS-440", Khatian: "704", Owner: "Iqbal Enterprise" } },
      { id: "d-18", parcelId: "p-405", ownerId: "usr-karim", type: "mutation-order", fileName: "mutation-order-405.pdf", mimeType: "application/pdf", sizeBytes: 264900, pageCount: 2, uploadedAt: new Date("2026-08-28T10:05:00Z"), uploadedById: "usr-officer", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.01 },
      { id: "d-801", parcelId: "p-801", ownerId: "usr-ayesha", type: "title-deed", fileName: "dolil-801.pdf", mimeType: "application/pdf", sizeBytes: 520411, pageCount: 4, uploadedAt: new Date("2026-08-01T10:00:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified" },
      { id: "d-802", parcelId: "p-802", ownerId: "usr-ayesha", type: "title-deed", fileName: "dolil-802.pdf", mimeType: "application/pdf", sizeBytes: 420411, pageCount: 3, uploadedAt: new Date("2026-08-02T10:00:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified" },
      { id: "d-803", parcelId: "p-803", ownerId: "usr-ayesha", type: "title-deed", fileName: "dolil-803.pdf", mimeType: "application/pdf", sizeBytes: 620411, pageCount: 5, uploadedAt: new Date("2026-08-03T10:00:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified" },
      { id: "d-804", parcelId: "p-804", ownerId: "usr-ayesha", type: "title-deed", fileName: "dolil-804.pdf", mimeType: "application/pdf", sizeBytes: 320411, pageCount: 2, uploadedAt: new Date("2026-08-04T10:00:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified" },
      { id: "d-888", parcelId: "p-888", ownerId: "usr-ayesha", type: "title-deed", fileName: "khatian-888.pdf", mimeType: "application/pdf", sizeBytes: 482103, pageCount: 4, uploadedAt: new Date("2026-08-18T11:20:00Z"), uploadedById: "usr-ayesha", ocrStatus: "failed", verificationStatus: "unverified" },
      { id: "d-999", parcelId: "p-999", ownerId: "usr-ayesha", type: "sale-deed", fileName: "dolil-999.pdf", mimeType: "application/pdf", sizeBytes: 903221, pageCount: 8, uploadedAt: new Date("2026-08-12T09:05:00Z"), uploadedById: "usr-ayesha", ocrStatus: "processing", verificationStatus: "unverified" },
    ] as Prisma.LandDocumentCreateManyInput[],
  });

  // --- Disputes + timeline -------------------------------------------------
  await prisma.dispute.createMany({
    data: [
      { id: "ds-417", caseNumber: "DSP-2026-00417", parcelId: "p-142", parcelDagNo: "CS-142/3", type: "boundary", status: "under-review", priority: "medium", filedById: "usr-ayesha", filedByName: "Ayesha Siddika", filedAt: new Date("2026-07-15T10:30:00Z"), description: "The adjoining landholder has cultivated roughly 3 metres past the eastern boundary of dag CS-142/3. Requesting a survey to confirm the recorded demarcation.", parties: [{ name: "Ayesha Siddika", role: "claimant", userId: "usr-ayesha" }, { name: "Md. Karim Uddin", role: "respondent", userId: "usr-karim" }], assignedOfficerId: "usr-officer", evidenceDocumentIds: ["d-1"] },
      { id: "ds-402", caseNumber: "DSP-2026-00402", parcelId: "p-205", parcelDagNo: "BS-205", type: "encroachment", status: "field-visit-scheduled", priority: "high", filedById: "usr-shanti", filedByName: "Shanti Rani Das", filedAt: new Date("2026-07-08T13:00:00Z"), description: "An unauthorised structure has been raised on the north-west corner of the orchard. Requesting encroachment verification and removal.", parties: [{ name: "Shanti Rani Das", role: "claimant", userId: "usr-shanti" }, { name: "Unknown occupant", role: "respondent" }], assignedOfficerId: "usr-officer2", assignedAgentId: "usr-agent", evidenceDocumentIds: ["d-5", "d-10"] },
      { id: "ds-388", caseNumber: "DSP-2026-00388", parcelId: "p-176", parcelDagNo: "CS-176", type: "fraud", status: "in-mediation", priority: "high", filedById: "usr-karim", filedByName: "Md. Karim Uddin", filedAt: new Date("2026-06-25T09:45:00Z"), description: "Two conflicting sale deeds (dolil) presented for the same dag. Suspected forged signature on the second deed. Referred for mediation.", parties: [{ name: "Md. Karim Uddin", role: "claimant", userId: "usr-karim" }, { name: "Sohel Rana", role: "respondent" }], assignedMediatorId: "usr-mediator", evidenceDocumentIds: ["d-6", "d-11"] },
      // Referred to mediation but not yet listed for hearing — fills the
      // mediator's "to convene" board.
      { id: "ds-381", caseNumber: "DSP-2026-00381", parcelId: "p-092", parcelDagNo: "RS-92/4", type: "easement", status: "resolved", priority: "medium", filedById: "usr-ayesha", filedByName: "Ayesha Siddika", filedAt: new Date("2026-06-18T07:20:00Z"), description: "Right of way across the northern strip of dag RS-92/4 blocked after the neighbouring owner raised a boundary wall. Referred for mediation.", parties: [{ name: "Ayesha Siddika", role: "claimant", userId: "usr-ayesha" }, { name: "Sohel Rana", role: "respondent" }], assignedMediatorId: "usr-mediator", evidenceDocumentIds: [], resolution: "The recorded access path was confirmed and reopened by agreement." },
      { id: "ds-370", caseNumber: "DSP-2026-00370", parcelId: "p-311", parcelDagNo: "RS-311/2", type: "ownership", status: "resolved", priority: "low", filedById: "usr-karim", filedByName: "Md. Karim Uddin", filedAt: new Date("2026-05-30T10:00:00Z"), description: "Clerical mismatch in the recorded owner name resolved after document verification.", parties: [{ name: "Md. Karim Uddin", role: "claimant", userId: "usr-karim" }], assignedOfficerId: "usr-officer", evidenceDocumentIds: ["d-7"], resolution: "Owner name corrected in the khatian after verification of khajna receipts and NID. No competing claim found." },
      { id: "ds-355", caseNumber: "DSP-2026-00355", parcelId: "p-088", parcelDagNo: "RS-88", type: "inheritance", status: "submitted", priority: "medium", filedById: "usr-ayesha", filedByName: "Ayesha Siddika", filedAt: new Date("2026-07-22T08:15:00Z"), description: "Requesting formal recognition of the Faraiz inheritance share for dag RS-88 following the passing of the recorded owner.", parties: [{ name: "Ayesha Siddika", role: "claimant", userId: "usr-ayesha" }], evidenceDocumentIds: ["d-3"] },
      { id: "ds-340", caseNumber: "DSP-2026-00340", parcelId: "p-205", parcelDagNo: "BS-205", type: "boundary", status: "hearing-scheduled", priority: "medium", filedById: "usr-shanti", filedByName: "Shanti Rani Das", filedAt: new Date("2026-06-12T09:00:00Z"), description: "Boundary overlap between dag BS-205 and the adjacent khas (government) land line pending tribunal hearing.", parties: [{ name: "Shanti Rani Das", role: "claimant", userId: "usr-shanti" }, { name: "Upazila Land Office", role: "respondent" }], assignedMediatorId: "usr-mediator", hearingDate: new Date("2026-07-30T05:30:00Z"), evidenceDocumentIds: ["d-5"] },
      { id: "ds-430", caseNumber: "DSP-2026-00430", parcelId: "p-403", parcelDagNo: "RS-403", type: "boundary", status: "field-visit-scheduled", priority: "high", filedById: "usr-ayesha", filedByName: "Ayesha Siddika", filedAt: new Date("2026-09-06T09:00:00Z"), description: "The field agent found a boundary occupation on the southern edge during measurement.", parties: [{ name: "Ayesha Siddika", role: "claimant", userId: "usr-ayesha" }, { name: "Adjacent occupier", role: "respondent" }], assignedOfficerId: "usr-officer", assignedAgentId: "usr-agent", evidenceDocumentIds: ["d-16"] },
      { id: "ds-888", caseNumber: "DSP-2026-00888", parcelId: "p-888", parcelDagNo: "RS-888", type: "easement", status: "submitted", priority: "low", filedById: "usr-ayesha", filedByName: "Ayesha Siddika", filedAt: new Date("2026-08-01T10:30:00Z"), description: "Dispute over fishing rights.", parties: [{ name: "Ayesha Siddika", role: "claimant", userId: "usr-ayesha" }, { name: "Local Fisherman", role: "respondent" }], assignedOfficerId: "usr-officer", evidenceDocumentIds: [] },
      { id: "ds-999", caseNumber: "DSP-2026-00999", parcelId: "p-999", parcelDagNo: "BS-999", type: "boundary", status: "in-mediation", priority: "high", filedById: "usr-ayesha", filedByName: "Ayesha Siddika", filedAt: new Date("2026-08-15T10:30:00Z"), description: "Neighbor encroaching on commercial plot.", parties: [{ name: "Ayesha Siddika", role: "claimant", userId: "usr-ayesha" }, { name: "Shop Owner", role: "respondent" }], assignedMediatorId: "usr-mediator", evidenceDocumentIds: [] },
    ] as Prisma.DisputeCreateManyInput[],
  });

  await prisma.disputeEvent.createMany({
    data: [
      { id: "de-1", disputeId: "ds-417", at: new Date("2026-07-15T10:30:00Z"), type: "filed", title: "Dispute filed", content: { code: "filed" }, description: "Boundary dispute submitted by Ayesha Siddika.", actorId: "usr-ayesha", actorName: "Ayesha Siddika" },
      { id: "de-2", disputeId: "ds-417", at: new Date("2026-07-16T09:10:00Z"), type: "assigned", title: "Assigned to Sub-Registrar", content: { code: "assigned", to: "Sub-Registrar" }, description: "Case routed to Nasrin Akter, Debidwar Upazila.", actorName: "System" },
      { id: "de-3", disputeId: "ds-417", at: new Date("2026-07-17T14:00:00Z"), type: "document-added", title: "Evidence added", content: { code: "evidence-added" }, description: "Khatian for dag CS-142/3 attached as evidence.", actorId: "usr-ayesha", actorName: "Ayesha Siddika" },
      { id: "de-4", disputeId: "ds-417", at: new Date("2026-07-21T09:00:00Z"), type: "status-change", title: "Moved to Under review", content: { code: "status-change", status: "under-review" }, description: "Officer began reviewing submitted records.", actorId: "usr-officer", actorName: "Nasrin Akter" },
      { id: "de-5", disputeId: "ds-388", at: new Date("2026-06-25T09:45:00Z"), type: "filed", title: "Dispute filed", content: { code: "filed" }, actorId: "usr-karim", actorName: "Md. Karim Uddin" },
      { id: "de-6", disputeId: "ds-388", at: new Date("2026-07-02T11:00:00Z"), type: "status-change", title: "Referred to mediation", content: { code: "status-change", status: "in-mediation" }, actorName: "System" },
      { id: "de-7", disputeId: "ds-388", at: new Date("2026-07-19T11:30:00Z"), type: "hearing", title: "First hearing held", content: { code: "hearing-held", ordinal: 1 }, description: "Both parties presented deeds. Handwriting examination ordered.", actorId: "usr-mediator", actorName: "Shahida Khatun" },
      { id: "de-8", disputeId: "ds-888", at: new Date("2026-08-01T10:30:00Z"), type: "filed", title: "Dispute filed", content: { code: "filed" }, actorId: "usr-ayesha", actorName: "Ayesha Siddika" },
      { id: "de-9", disputeId: "ds-999", at: new Date("2026-08-15T10:30:00Z"), type: "filed", title: "Dispute filed", content: { code: "filed" }, actorId: "usr-ayesha", actorName: "Ayesha Siddika" },
    ] as Prisma.DisputeEventCreateManyInput[],
  });

  // --- Mutations (namjari) --------------------------------------------------
  await prisma.mutation.createMany({
    data: [
      { id: "m-1192", mutationNumber: "MUT-2026-01192", parcelId: "p-088", parcelDagNo: "RS-88", type: "inheritance", status: "under-primary-verification", fromOwnerName: "Late Fazlul Haque", fromOwnerId: "usr-legacy-2", toOwnerId: "usr-ayesha", toOwnerName: "Ayesha Siddika", requestedById: "usr-ayesha", requestedAt: new Date("2026-07-14T10:00:00Z"), assignedOfficerId: "usr-officer", verificationStartedAt: new Date("2026-07-15T09:00:00Z"), verificationStartedById: "usr-officer", verificationNotes: "Warish affidavit and khatian are under officer review.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true, dagKhatianVerified: true, deedVerified: false, landRecordMatched: true, documentsPresent: true, khajnaReceiptVerified: true }, documentIds: ["d-3", "d-9"], objections: [], fee: { amount: 5400, currency: "BDT" }, createdAt: new Date("2026-07-14T10:00:00Z"), updatedAt: new Date("2026-07-15T09:00:00Z") },
      { id: "m-1180", mutationNumber: "MUT-2026-01180", parcelId: "p-311", parcelDagNo: "RS-311/2", type: "sale", status: "complete", mutationKhatianNumber: "MK-2026-00001180", dcrPaidAt: new Date("2026-06-30T10:00:00Z"), fromOwnerName: "Md. Karim Uddin", fromOwnerId: "usr-karim", toOwnerId: "usr-iqbal", toOwnerName: "Iqbal Enterprise", requestedById: "usr-karim", requestedAt: new Date("2026-06-10T10:00:00Z"), assignedOfficerId: "usr-officer", verificationStartedAt: new Date("2026-06-11T09:00:00Z"), verificationStartedById: "usr-officer", verifiedAt: new Date("2026-06-14T10:00:00Z"), verifiedById: "usr-officer", verificationNotes: "Legacy deed record verified before the statutory notice.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true, dagKhatianVerified: true, deedVerified: true, landRecordMatched: true, documentsPresent: true, khajnaReceiptVerified: true }, objectionStartDate: new Date("2026-06-15T00:00:00Z"), objectionWindowEndsAt: new Date("2026-06-29T00:00:00Z"), documentIds: ["d-7"], objections: [], fee: { amount: 42000, currency: "BDT" }, approvedAt: new Date("2026-06-30T10:00:00Z"), approvedById: "usr-officer", approvalNote: "No objections were received during the notice period.", decidedAt: new Date("2026-06-30T10:00:00Z"), createdAt: new Date("2026-06-10T10:00:00Z"), updatedAt: new Date("2026-06-30T10:00:00Z") },
      // The closed, clean notice period exercises the officer's decision queue.
      { id: "m-1200", mutationNumber: "MUT-2026-01200", parcelId: "p-142", parcelDagNo: "CS-142/3", type: "gift", status: "field-verification-complete", disputeId: "ds-417", fromOwnerName: "Ayesha Siddika", fromOwnerId: "usr-ayesha", toOwnerId: "usr-karim", toOwnerName: "Md. Karim Uddin", requestedById: "usr-ayesha", requestedAt: new Date("2026-07-09T10:00:00Z"), assignedOfficerId: "usr-officer", verificationStartedAt: new Date("2026-07-10T09:00:00Z"), verificationStartedById: "usr-officer", verifiedAt: new Date("2026-07-12T11:00:00Z"), verifiedById: "usr-officer", verificationNotes: "Deed, khatian, and parties verified.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true, dagKhatianVerified: true, deedVerified: true, landRecordMatched: true, documentsPresent: true, khajnaReceiptVerified: true }, objectionStartDate: new Date("2026-07-13T00:00:00Z"), objectionWindowEndsAt: new Date("2026-07-27T00:00:00Z"), documentIds: ["d-1", "d-2"], objections: [], createdAt: new Date("2026-07-09T10:00:00Z"), updatedAt: new Date("2026-07-27T00:00:00Z") },
      { id: "m-1205", mutationNumber: "MUT-2026-01205", parcelId: "p-176", parcelDagNo: "CS-176", type: "sale", status: "field-investigation", fromOwnerName: "Md. Karim Uddin", fromOwnerId: "usr-karim", toOwnerId: "usr-ayesha", toOwnerName: "Ayesha Siddika", requestedById: "usr-karim", requestedAt: new Date("2026-07-16T10:00:00Z"), assignedOfficerId: "usr-officer2", verificationStartedAt: new Date("2026-07-17T09:00:00Z"), verificationStartedById: "usr-officer2", verifiedAt: new Date("2026-07-18T10:00:00Z"), verifiedById: "usr-officer2", verificationNotes: "Documents cleared for public notice pending the fraud objection.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true, dagKhatianVerified: true, deedVerified: true, landRecordMatched: true, documentsPresent: true, khajnaReceiptVerified: true }, objectionStartDate: new Date("2026-07-18T12:00:00Z"), documentIds: ["d-6"], objections: [{ id: "obj-1", by: "Md. Karim Uddin", at: "2026-07-19T09:00:00Z", reason: "Deed signature disputed — see fraud case DSP-2026-00388.", status: "open" }], objectionWindowEndsAt: new Date("2026-07-31T00:00:00Z"), createdAt: new Date("2026-07-16T10:00:00Z"), updatedAt: new Date("2026-07-31T00:00:00Z") },
      // The live notice-period card keeps the window hold visible at the September demo clock.
      { id: "m-1220", mutationNumber: "MUT-2026-01220", parcelId: "p-311", parcelDagNo: "RS-311/2", type: "sale", status: "rejected", fromOwnerName: "Iqbal Enterprise", fromOwnerId: "usr-iqbal", toOwnerId: "usr-ayesha", toOwnerName: "Ayesha Siddika", requestedById: "usr-karim", requestedAt: new Date("2026-09-01T10:00:00Z"), assignedOfficerId: "usr-officer", verificationStartedAt: new Date("2026-09-02T09:00:00Z"), verificationStartedById: "usr-officer", verifiedAt: new Date("2026-09-03T10:00:00Z"), verifiedById: "usr-officer", verificationNotes: "Current deed, khatian, and recipient identity verified for notice.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true, dagKhatianVerified: true, deedVerified: true, landRecordMatched: true, documentsPresent: true, khajnaReceiptVerified: true }, objectionStartDate: new Date("2026-09-03T12:00:00Z"), objectionWindowEndsAt: new Date("2026-09-17T12:00:00Z"), documentIds: ["d-7"], objections: [], rejectedAt: new Date("2026-09-04T10:00:00Z"), rejectedById: "usr-officer", rejectionReason: "Applicant is not the recorded owner or an authorised representative.", decidedAt: new Date("2026-09-04T10:00:00Z"), createdAt: new Date("2026-09-01T10:00:00Z"), updatedAt: new Date("2026-09-04T10:00:00Z") },
      { id: "m-1210", mutationNumber: "MUT-2026-01210", parcelId: "p-092", parcelDagNo: "RS-92/4", type: "correction", status: "submitted", fromOwnerName: "Ayesha Siddika", fromOwnerId: "usr-ayesha", toOwnerId: "usr-ayesha", toOwnerName: "Ayesha Siddika", requestedById: "usr-ayesha", requestedAt: new Date("2026-07-22T11:00:00Z"), documentIds: ["d-8"], objections: [], createdAt: new Date("2026-07-22T11:00:00Z"), updatedAt: new Date("2026-07-22T11:00:00Z") },
      { id: "m-1150", mutationNumber: "MUT-2026-01150", parcelId: "p-205", parcelDagNo: "BS-205", type: "partition", status: "rejected", fromOwnerName: "Shanti Rani Das", fromOwnerId: "usr-shanti", toOwnerName: "Shanti Rani Das + heirs", requestedById: "usr-shanti", requestedAt: new Date("2026-05-02T10:00:00Z"), assignedOfficerId: "usr-officer2", verificationStartedAt: new Date("2026-05-05T09:00:00Z"), verificationStartedById: "usr-officer2", verificationNotes: "Supporting partition schedule was incomplete.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: false, dagKhatianVerified: true, deedVerified: false, landRecordMatched: false, documentsPresent: false, khajnaReceiptVerified: false }, documentIds: [], objections: [], rejectedAt: new Date("2026-05-20T10:00:00Z"), rejectedById: "usr-officer2", rejectionReason: "Required heir consent and partition schedule were not supplied.", decidedAt: new Date("2026-05-20T10:00:00Z"), createdAt: new Date("2026-05-02T10:00:00Z"), updatedAt: new Date("2026-05-20T10:00:00Z") },
      { id: "m-1230", mutationNumber: "MUT-2026-01230", parcelId: "p-402", parcelDagNo: "RS-402", type: "sale", status: "under-primary-verification", fromOwnerName: "Md. Karim Uddin", fromOwnerId: "usr-karim", toOwnerId: "usr-ayesha", toOwnerName: "Ayesha Siddika", requestedById: "usr-karim", requestedAt: new Date("2026-09-05T09:00:00Z"), assignedOfficerId: "usr-officer", verificationStartedAt: new Date("2026-09-06T09:00:00Z"), verificationStartedById: "usr-officer", verificationNotes: "Identity, deed, and khatian are being checked.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true, dagKhatianVerified: true, deedVerified: false, landRecordMatched: true, documentsPresent: true, khajnaReceiptVerified: false }, documentIds: ["d-15"], objections: [], fee: { amount: 9600, currency: "BDT" }, createdAt: new Date("2026-09-05T09:00:00Z"), updatedAt: new Date("2026-09-06T09:00:00Z") },
      { id: "m-1231", mutationNumber: "MUT-2026-01231", parcelId: "p-405", parcelDagNo: "RS-405", type: "gift", status: "complete", mutationKhatianNumber: "MK-2026-00001231", dcrPaidAt: new Date("2026-08-28T10:00:00Z"), fromOwnerName: "Ayesha Siddika", fromOwnerId: "usr-ayesha", toOwnerId: "usr-karim", toOwnerName: "Md. Karim Uddin", requestedById: "usr-ayesha", requestedAt: new Date("2026-08-01T09:00:00Z"), assignedOfficerId: "usr-officer", verificationStartedAt: new Date("2026-08-02T09:00:00Z"), verificationStartedById: "usr-officer", verifiedAt: new Date("2026-08-05T10:00:00Z"), verifiedById: "usr-officer", verificationNotes: "Gift deed and both parties verified.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true, dagKhatianVerified: true, deedVerified: true, landRecordMatched: true, documentsPresent: true, khajnaReceiptVerified: true }, documentIds: ["d-18"], objections: [], fee: { amount: 7200, currency: "BDT" }, approvedAt: new Date("2026-08-27T10:00:00Z"), approvedById: "usr-officer", approvalNote: "Verification complete and no objections received.", decidedAt: new Date("2026-08-27T10:00:00Z"), createdAt: new Date("2026-08-01T09:00:00Z"), updatedAt: new Date("2026-08-28T10:00:00Z") },
    ] as Prisma.MutationCreateManyInput[],
  });

  // The mutation-linked current title row is inserted after its mutation so
  // the optional foreign key is valid during a fresh seed.
  await prisma.ownershipRecord.create({
    data: { id: "own-6", parcelId: "p-311", ownerId: "usr-iqbal", ownerName: "Iqbal Enterprise", acquisitionType: "purchase", fromDate: new Date("2026-06-30T10:00:00Z"), toDate: null, documentId: "d-7", mutationId: "m-1180" },
  });
  await prisma.ownershipRecord.create({
    data: { id: "own-12", parcelId: "p-405", ownerId: "usr-karim", ownerName: "Md. Karim Uddin", acquisitionType: "gift", fromDate: new Date("2026-08-28T10:00:00Z"), toDate: null, documentId: "d-18", mutationId: "m-1231" },
  });

  // --- Field reports --------------------------------------------------------
  await prisma.fieldReport.createMany({
    data: [
      { id: "fr-1", parcelId: "p-205", parcelDagNo: "BS-205", disputeId: "ds-402", purpose: "encroachment-check", status: "assigned", assignedAgentId: "usr-agent", assignedAt: new Date("2026-07-22T08:00:00Z"), scheduledFor: new Date("2026-07-24T04:00:00Z"), addressHint: "NW corner, near canal road, Payalgacha", gpsCaptures: [], photos: [] },
      {
        id: "fr-2", parcelId: "p-142", parcelDagNo: "CS-142/3", disputeId: "ds-417", mutationId: "m-1200", purpose: "boundary-survey", status: "completed", assignedAgentId: "usr-agent", assignedAt: new Date("2026-07-17T09:00:00Z"), acceptedAt: new Date("2026-07-17T09:30:00Z"), scheduledFor: new Date("2026-07-19T04:30:00Z"), submittedAt: new Date("2026-07-19T07:10:00Z"), addressHint: "Eastern edge, paddy field, Rajamehar",
        gpsCaptures: [
          { id: "g-1", point: { lat: 23.5494, lng: 90.9895 }, accuracyMeters: 3.2, capturedAt: "2026-07-19T05:00:00Z", label: "NE corner pillar" },
          { id: "g-2", point: { lat: 23.5486, lng: 90.9896 }, accuracyMeters: 4.1, capturedAt: "2026-07-19T05:12:00Z", label: "SE corner pillar" },
        ],
        photos: [{ id: "ph-1", url: "", caption: "Cultivated strip past the boundary pillar", capturedAt: "2026-07-19T05:05:00Z" }],
        notes: "NE corner pillar intact. Cultivation observed ~2.8m inside the recorded line on the eastern edge. Recommend re-demarcation.",
      },
      { id: "fr-3", parcelId: "p-176", parcelDagNo: "CS-176", purpose: "possession-verify", status: "in-progress", assignedAgentId: "usr-agent2", assignedAt: new Date("2026-07-21T10:00:00Z"), acceptedAt: new Date("2026-07-21T10:15:00Z"), scheduledFor: new Date("2026-07-23T05:00:00Z"), addressHint: "Hillfoot plot, Payalgacha", gpsCaptures: [], photos: [] },
      { id: "fr-4", parcelId: "p-088", parcelDagNo: "RS-88", mutationId: "m-1192", purpose: "measurement", status: "cancelled", assignedAgentId: "usr-agent", assignedAt: new Date("2026-07-23T08:30:00Z"), scheduledFor: new Date("2026-07-25T04:30:00Z"), addressHint: "Homestead plot, Rajamehar", gpsCaptures: [], photos: [], notes: "Cancelled fixture: keeps MUT-2026-01192 in the reassignment queue." },
      { id: "fr-5", parcelId: "p-403", parcelDagNo: "RS-403", disputeId: "ds-430", purpose: "boundary-survey", status: "completed", assignedAgentId: "usr-agent", assignedAt: new Date("2026-09-06T10:00:00Z"), acceptedAt: new Date("2026-09-06T10:15:00Z"), scheduledFor: new Date("2026-09-07T05:00:00Z"), submittedAt: new Date("2026-09-07T08:30:00Z"), addressHint: "Southern boundary, Rajamehar", gpsCaptures: [{ id: "g-403-1", point: { lat: 23.5537, lng: 90.9932 }, accuracyMeters: 3.6, capturedAt: "2026-09-07T06:10:00Z", label: "Occupied boundary corner" }], photos: [{ id: "ph-403-1", url: "", caption: "Boundary occupation found during field inspection", capturedAt: "2026-09-07T06:15:00Z" }], notes: "Recorded southern boundary is occupied by the adjacent holder; dispute opened for officer review." },
    ] as Prisma.FieldReportCreateManyInput[],
  });

  await prisma.fieldSurveySession.createMany({
    data: [
      {
        id: "fs-2",
        fieldReportId: "fr-2",
        bhumiId: withUlpin.find((parcel) => parcel.id === "p-142")?.ulpin,
        assignedAgentId: "usr-agent",
        status: "completed",
        startedAt: new Date("2026-07-19T04:45:00Z"),
        completedAt: new Date("2026-07-19T07:10:00Z"),
      },
      {
        id: "fs-3",
        fieldReportId: "fr-3",
        bhumiId: withUlpin.find((parcel) => parcel.id === "p-176")?.ulpin,
        assignedAgentId: "usr-agent2",
        status: "in-progress",
        startedAt: new Date("2026-07-23T05:05:00Z"),
      },
    ] as Prisma.FieldSurveySessionCreateManyInput[],
  });

  // --- Hearings -------------------------------------------------------------
  await prisma.hearing.createMany({
    data: [
      { id: "h-1", caseNumber: "HRG-2026-0044", disputeId: "ds-388", parcelDagNo: "CS-176", mediatorId: "usr-mediator", status: "in-hearing", parties: ["Md. Karim Uddin", "Sohel Rana"], hearingDate: new Date("2026-07-26T05:30:00Z"), sessions: [{ id: "s-1", at: "2026-07-19T05:30:00Z", summary: "Both deeds presented. Handwriting examiner appointed; next session scheduled.", attendees: ["Md. Karim Uddin", "Sohel Rana", "Shahida Khatun"] }] },
      { id: "h-2", caseNumber: "HRG-2026-0039", disputeId: "ds-340", parcelDagNo: "BS-205", mediatorId: "usr-mediator", status: "scheduled", parties: ["Shanti Rani Das", "Upazila Land Office"], hearingDate: new Date("2026-07-30T05:30:00Z"), sessions: [] },
      { id: "h-3", caseNumber: "HRG-2026-0031", disputeId: "ds-370", parcelDagNo: "RS-311/2", mediatorId: "usr-mediator", status: "ruled", parties: ["Md. Karim Uddin"], sessions: [{ id: "s-2", at: "2026-06-15T05:30:00Z", summary: "Name correction upheld.", attendees: ["Md. Karim Uddin", "Shahida Khatun"] }], ruling: "Khatian to reflect the corrected owner name. Case closed.", ruledAt: new Date("2026-06-18T05:30:00Z") },
    ] as Prisma.HearingCreateManyInput[],
  });

  // --- Policy (singleton) ---------------------------------------------------
  await prisma.policy.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", mutationFeeBdt: 5400, objectionWindowDays: 15, fraudScoreThreshold: 0.5 },
  });

  // Paid tax applications are the receipt register and the canonical
  // paid-through evidence used by both the citizen and land-office screens.
  await prisma.serviceApplication.createMany({
    data: [
      {
        id: "sa-tax-1", applicationNo: "LDT-2026-001000", serviceType: "land-tax", status: "approved",
        parcelId: "p-092", applicantId: "usr-ayesha", assignedOfficerId: "usr-officer",
        details: { assessmentYear: 2026, decimals: 8.25, arrears: 0, currentYearDue: 83, years: [{ year: 2026, assessed: 83, surcharge: 0, due: 83, isArrear: false }] },
        documentIds: [], feeAmount: 83, paymentMethod: "bkash", transactionId: "TXN-LDT092A",
        paidAt: new Date("2026-09-10T06:30:00Z"), submittedAt: new Date("2026-09-10T06:30:00Z"), decidedAt: new Date("2026-09-10T06:30:00Z"), createdAt: new Date("2026-09-10T06:30:00Z"), updatedAt: new Date("2026-09-10T06:30:00Z"),
      },
      {
        id: "sa-tax-2", applicationNo: "LDT-2026-001001", serviceType: "land-tax", status: "approved",
        parcelId: "p-311", applicantId: "usr-iqbal", assignedOfficerId: "usr-officer",
        details: { assessmentYear: 2026, decimals: 4.95, arrears: 446, currentYearDue: 124, years: [{ year: 2023, assessed: 124, surcharge: 37, due: 161, isArrear: true }, { year: 2024, assessed: 124, surcharge: 25, due: 149, isArrear: true }, { year: 2025, assessed: 124, surcharge: 12, due: 136, isArrear: true }, { year: 2026, assessed: 124, surcharge: 0, due: 124, isArrear: false }] },
        documentIds: [], feeAmount: 570, paymentMethod: "nagad", transactionId: "TXN-LDT311B",
        paidAt: new Date("2026-09-12T08:15:00Z"), submittedAt: new Date("2026-09-12T08:15:00Z"), decidedAt: new Date("2026-09-12T08:15:00Z"), createdAt: new Date("2026-09-12T08:15:00Z"), updatedAt: new Date("2026-09-12T08:15:00Z"),
      },
    ] as Prisma.ServiceApplicationCreateManyInput[],
  });
  await prisma.serviceApplicationEvent.createMany({
    data: [
      { id: "sae-tax-1", applicationId: "sa-tax-1", at: new Date("2026-09-10T06:30:00Z"), type: "payment-recorded", title: "Land development tax paid", actorId: "usr-officer", actorName: "Nasrin Akter" },
      { id: "sae-tax-2", applicationId: "sa-tax-2", at: new Date("2026-09-12T08:15:00Z"), type: "payment-recorded", title: "Land development tax paid", actorId: "usr-officer", actorName: "Nasrin Akter" },
    ] as Prisma.ServiceApplicationEventCreateManyInput[],
  });

  // --- Notifications ---------------------------------------------------------
  await prisma.appNotification.createMany({
    data: [
      { id: "n-1", userId: "usr-ayesha", at: new Date("2026-07-21T09:05:00Z"), severity: "info", title: "Dispute moved to Under review", body: "Case DSP-2026-00417 is now being reviewed by the Sub-Registrar.", content: { code: "dispute-status", caseNumber: "DSP-2026-00417", status: "under-review" }, read: false, href: "/disputes/ds-417" },
      { id: "n-2", userId: "usr-ayesha", at: new Date("2026-07-18T11:25:00Z"), severity: "success", title: "Document verified", body: "Your khatian for dag CS-142/3 passed verification.", content: { code: "document-verified", dagNo: "CS-142/3" }, read: false, href: "/documents" },
      { id: "n-3", userId: "usr-ayesha", at: new Date("2026-07-22T08:20:00Z"), severity: "critical", title: "Action needed: affidavit unclear", body: "The warish (inheritance) affidavit for dag RS-88 needs a clearer re-scan to continue OCR.", content: { code: "document-unclear", dagNo: "RS-88" }, read: false, href: "/documents" },
      { id: "n-4", userId: "usr-ayesha", at: new Date("2026-07-20T16:10:00Z"), severity: "info", title: "Field survey scheduled", body: "A boundary survey for dag CS-142/3 has been scheduled.", content: { code: "survey-scheduled", dagNo: "CS-142/3" }, read: true, href: "/disputes/ds-417" },
      { id: "n-5", userId: "usr-ayesha", at: new Date("2026-07-14T10:05:00Z"), severity: "info", title: "Namjari in verification", body: "Inheritance mutation MUT-2026-01192 for dag RS-88 is being verified.", content: { code: "mutation-verification", mutationNumber: "MUT-2026-01192", dagNo: "RS-88" }, read: true, href: "/inheritance" },
      { id: "n-6", userId: "usr-ayesha", at: new Date("2026-07-10T08:05:00Z"), severity: "success", title: "Welcome to PlotGuard", body: "Your account is active. You can now search records and track disputes.", content: { code: "welcome" }, read: true },
      { id: "n-7", userId: "usr-officer", at: new Date("2026-07-21T09:02:00Z"), severity: "warning", title: "New dispute assigned", body: "DSP-2026-00417 requires review.", content: { code: "dispute-assigned", caseNumber: "DSP-2026-00417" }, read: false, href: "/disputes" },
      { id: "n-101", userId: "usr-ayesha", at: new Date("2026-08-21T09:05:00Z"), severity: "info", title: "Dispute submitted successfully", body: "Case DSP-2026-00888 has been received.", content: { code: "dispute-status", caseNumber: "DSP-2026-00888", status: "submitted" }, read: false, href: "/disputes/ds-888" },
      { id: "n-102", userId: "usr-ayesha", at: new Date("2026-08-18T11:25:00Z"), severity: "critical", title: "Document OCR failed", body: "Your khatian for dag RS-888 failed processing.", content: { code: "document-failed", dagNo: "RS-888" }, read: false, href: "/documents" },
      { id: "n-103", userId: "usr-ayesha", at: new Date("2026-08-22T08:20:00Z"), severity: "warning", title: "Mediation scheduled", body: "Mediation for DSP-2026-00999 is set.", content: { code: "dispute-status", caseNumber: "DSP-2026-00999", status: "in-mediation" }, read: false, href: "/disputes/ds-999" },
    ] as Prisma.AppNotificationCreateManyInput[],
  });

  // --- Audit ledger — chained for real, not seeded pre-hashed. Sorted by
  // createdAt first, exactly like the mock's getAuditChain(), so the order a
  // link was signed in matches the order it is displayed in. -----------------
  const auditSeed: Array<{
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    actorId: string;
    actorName?: string;
    payload: Prisma.InputJsonValue;
    createdAt: string;
  }> = [
    { id: "au-1", entityType: "parcel", entityId: "p-142", action: "create", actorId: "usr-officer", actorName: "Nasrin Akter", payload: { dagNo: "CS-142/3", khatianNo: "512" }, createdAt: "2015-07-20T00:00:00Z" },
    { id: "au-2", entityType: "document", entityId: "d-1", action: "upload", actorId: "usr-ayesha", actorName: "Ayesha Siddika", payload: { fileName: "khatian-142-512.pdf" }, createdAt: "2026-07-18T11:20:00Z" },
    { id: "au-3", entityType: "dispute", entityId: "ds-417", action: "create", actorId: "usr-ayesha", actorName: "Ayesha Siddika", payload: { type: "boundary", parcelDagNo: "CS-142/3" }, createdAt: "2026-07-15T10:30:00Z" },
    { id: "au-4", entityType: "dispute", entityId: "ds-417", action: "status-change", actorId: "usr-officer", actorName: "Nasrin Akter", payload: { from: "submitted", to: "under-review" }, createdAt: "2026-07-21T09:00:00Z" },
    { id: "au-5", entityType: "mutation", entityId: "m-1192", action: "create", actorId: "usr-ayesha", actorName: "Ayesha Siddika", payload: { type: "inheritance", parcelDagNo: "RS-88" }, createdAt: "2026-07-14T10:00:00Z" },
    { id: "au-6", entityType: "mutation", entityId: "m-1180", action: "approve", actorId: "usr-officer", actorName: "Nasrin Akter", payload: { toOwnerName: "Iqbal Enterprise" }, createdAt: "2026-06-30T10:00:00Z" },
    { id: "au-7", entityType: "hearing", entityId: "h-3", action: "ruling", actorId: "usr-mediator", actorName: "Shahida Khatun", payload: { ruling: "Name correction upheld." }, createdAt: "2026-06-18T05:30:00Z" },
    { id: "au-8", entityType: "mutation", entityId: "m-1192", action: "start-verification", actorId: "usr-officer", actorName: "Nasrin Akter", payload: { from: "submitted", to: "under-primary-verification" }, createdAt: "2026-07-15T09:00:00Z" },
    { id: "au-9", entityType: "mutation", entityId: "m-1180", action: "create", actorId: "usr-karim", actorName: "Md. Karim Uddin", payload: { type: "sale", parcelDagNo: "RS-311/2" }, createdAt: "2026-06-10T10:00:00Z" },
    { id: "au-10", entityType: "mutation", entityId: "m-1200", action: "create", actorId: "usr-ayesha", actorName: "Ayesha Siddika", payload: { type: "gift", parcelDagNo: "CS-142/3" }, createdAt: "2026-07-09T10:00:00Z" },
    { id: "au-11", entityType: "mutation", entityId: "m-1200", action: "start-verification", actorId: "usr-officer", actorName: "Nasrin Akter", payload: { from: "submitted", to: "under-primary-verification" }, createdAt: "2026-07-10T09:00:00Z" },
    { id: "au-12", entityType: "mutation", entityId: "m-1200", action: "verify", actorId: "usr-officer", actorName: "Nasrin Akter", payload: { checklistComplete: true }, createdAt: "2026-07-12T11:00:00Z" },
    { id: "au-13", entityType: "mutation", entityId: "m-1200", action: "start-objection-period", actorId: "usr-officer", actorName: "Nasrin Akter", payload: { from: "under-primary-verification", to: "field-investigation", endsAt: "2026-07-27T00:00:00Z" }, createdAt: "2026-07-13T00:00:00Z" },
    { id: "au-14", entityType: "mutation", entityId: "m-1205", action: "create", actorId: "usr-karim", actorName: "Md. Karim Uddin", payload: { type: "sale", parcelDagNo: "CS-176" }, createdAt: "2026-07-16T10:00:00Z" },
    { id: "au-15", entityType: "mutation", entityId: "m-1205", action: "start-verification", actorId: "usr-officer2", actorName: "Abdul Mannan", payload: { from: "submitted", to: "under-primary-verification" }, createdAt: "2026-07-17T09:00:00Z" },
    { id: "au-16", entityType: "mutation", entityId: "m-1205", action: "verify", actorId: "usr-officer2", actorName: "Abdul Mannan", payload: { checklistComplete: true }, createdAt: "2026-07-18T10:00:00Z" },
    { id: "au-17", entityType: "mutation", entityId: "m-1205", action: "start-objection-period", actorId: "usr-officer2", actorName: "Abdul Mannan", payload: { from: "under-primary-verification", to: "field-investigation", endsAt: "2026-07-31T00:00:00Z" }, createdAt: "2026-07-18T12:00:00Z" },
    { id: "au-18", entityType: "mutation", entityId: "m-1205", action: "file-objection", actorId: "usr-karim", actorName: "Md. Karim Uddin", payload: { objectionId: "obj-1" }, createdAt: "2026-07-19T09:00:00Z" },
    { id: "au-19", entityType: "mutation", entityId: "m-1210", action: "create", actorId: "usr-ayesha", actorName: "Ayesha Siddika", payload: { type: "correction", parcelDagNo: "RS-92/4" }, createdAt: "2026-07-22T11:00:00Z" },
    { id: "au-20", entityType: "mutation", entityId: "m-1150", action: "create", actorId: "usr-shanti", actorName: "Shanti Rani Das", payload: { type: "partition", parcelDagNo: "BS-205" }, createdAt: "2026-05-02T10:00:00Z" },
    { id: "au-21", entityType: "mutation", entityId: "m-1150", action: "reject", actorId: "usr-officer2", actorName: "Abdul Mannan", payload: { reason: "Required heir consent and partition schedule were not supplied." }, createdAt: "2026-05-20T10:00:00Z" },
    { id: "au-22", entityType: "mutation", entityId: "m-1180", action: "verify", actorId: "usr-officer", actorName: "Nasrin Akter", payload: { checklistComplete: true }, createdAt: "2026-06-14T10:00:00Z" },
    { id: "au-23", entityType: "mutation", entityId: "m-1150", action: "start-verification", actorId: "usr-officer2", actorName: "Abdul Mannan", payload: { from: "submitted", to: "under-primary-verification" }, createdAt: "2026-05-05T09:00:00Z" },
    { id: "au-24", entityType: "mutation", entityId: "m-1180", action: "start-objection-period", actorId: "usr-officer", actorName: "Nasrin Akter", payload: { from: "under-primary-verification", to: "field-investigation", endsAt: "2026-06-29T00:00:00Z" }, createdAt: "2026-06-15T00:00:00Z" },
    { id: "au-25", entityType: "mutation", entityId: "m-1180", action: "start-verification", actorId: "usr-officer", actorName: "Nasrin Akter", payload: { from: "submitted", to: "under-primary-verification" }, createdAt: "2026-06-11T09:00:00Z" },
    { id: "au-26", entityType: "mutation", entityId: "m-1220", action: "create", actorId: "usr-karim", actorName: "Md. Karim Uddin", payload: { type: "sale", parcelDagNo: "RS-311/2" }, createdAt: "2026-09-01T10:00:00Z" },
    { id: "au-27", entityType: "mutation", entityId: "m-1220", action: "start-verification", actorId: "usr-officer", actorName: "Nasrin Akter", payload: { from: "submitted", to: "under-primary-verification" }, createdAt: "2026-09-02T09:00:00Z" },
    { id: "au-28", entityType: "mutation", entityId: "m-1220", action: "verify", actorId: "usr-officer", actorName: "Nasrin Akter", payload: { checklistComplete: true }, createdAt: "2026-09-03T10:00:00Z" },
    { id: "au-29", entityType: "mutation", entityId: "m-1220", action: "start-objection-period", actorId: "usr-officer", actorName: "Nasrin Akter", payload: { from: "under-primary-verification", to: "field-investigation", endsAt: "2026-09-17T12:00:00Z" }, createdAt: "2026-09-03T12:00:00Z" },
    { id: "au-30", entityType: "mutation", entityId: "m-1220", action: "reject", actorId: "usr-officer", actorName: "Nasrin Akter", payload: { previousStatus: "field-investigation", newStatus: "rejected", reason: "Applicant is not the recorded owner or an authorised representative." }, createdAt: "2026-09-04T10:00:00Z" },
  ];

  const sorted = [...auditSeed].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let prevHash = "";
  for (const raw of sorted) {
    // Hash the round-tripped form, not the literal above: Postgres stores
    // `createdAt` as a timestamptz, and reading it back always produces
    // millisecond precision (`...T09:00:00.000Z`), even when the literal here
    // omitted it. Hashing the literal signs a string nothing will ever read
    // back — /audit/verify would then report every seeded row as broken on
    // its very first run, not because of tampering, but because the hash was
    // never reproducible to begin with.
    const createdAt = new Date(raw.createdAt).toISOString();
    const hash = computeHash(prevHash, { ...raw, createdAt });
    await prisma.auditEvent.create({ data: { ...raw, createdAt, prevHash, hash } });
    prevHash = hash;
  }

  console.log("Seed complete.");
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

