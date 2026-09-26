/**
 * Seed dataset for the mock API. Realistic and interconnected so every portal
 * looks populated in demos. Setting: **Cumilla District, Bangladesh** — dag/khatian
 * numbers, upazila/mouza hierarchy, BDT values, Faraiz/Hindu inheritance context.
 *
 * These arrays are mutable: the MSW handlers push/patch them so writes persist
 * for the lifetime of the browser session.
 */
import type {
  Jurisdiction,
  User,
  Role,
  ID,
  Parcel,
  OwnershipRecord,
  ParcelRestriction,
  LandDocument,
  Dispute,
  DisputeEvent,
  Mutation,
  ServiceApplication,
  ServiceApplicationEvent,
  FieldReport,
  FieldSurveySession,
  Hearing,
  AppNotification,
  AuditEvent,
  GeoPoint,
  GeoPolygon,
  Grievance,
  GrievanceEvent,
} from "@/lib/types";
import type { FieldSurveyGpsPoint } from "@/lib/types";
import type { MockSyncReceipt } from "./field-survey-sync-contract";

/** ~100m square boundary around a centroid, as GeoJSON [lng, lat] ring. */
function square(c: GeoPoint, d = 0.0009): GeoPolygon {
  const { lat, lng } = c;
  return {
    type: "Polygon",
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

// ---------------------------------------------------------------------------
// Jurisdictions — Division › District › Upazila › Mouza
// ---------------------------------------------------------------------------
// `nameBn` is how the name reads on the record itself. Records in Cumilla are
// kept in Bangla, so every level carries one.
export const jurisdictions: Jurisdiction[] = [
  { id: "j-chattogram", code: "CTG", name: "Chattogram Division", nameBn: "চট্টগ্রাম বিভাগ", level: "division", parentId: null },
  { id: "j-cumilla", code: "CTG-CUM", name: "Cumilla District", nameBn: "কুমিল্লা জেলা", level: "district", parentId: "j-chattogram" },
  { id: "j-debidwar", code: "CTG-CUM-DEB", name: "Debidwar Upazila", nameBn: "দেবিদ্বার উপজেলা", level: "upazila", parentId: "j-cumilla" },
  { id: "j-barura", code: "CTG-CUM-BAR", name: "Barura Upazila", nameBn: "বরুড়া উপজেলা", level: "upazila", parentId: "j-cumilla" },
  { id: "j-rajamehar", code: "CTG-CUM-DEB-RAJ", name: "Rajamehar Mouza", nameBn: "রাজামেহার মৌজা", level: "mouza", parentId: "j-debidwar" },
  { id: "j-payalgacha", code: "CTG-CUM-BAR-PAY", name: "Payalgacha Mouza", nameBn: "পয়ালগাছা মৌজা", level: "mouza", parentId: "j-barura" },
];
// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export const users: User[] = [
  {
    id: "usr-ayesha", name: "Ayesha Siddika", email: "ayesha.siddika@example.bd", phone: "+8801711-4xxxxx",
    role: "citizen", jurisdictionId: "j-rajamehar", nationalId: "•••• •••• 4821", status: "active",
    profileDetails: { fatherName: "Mohammad Ali", motherName: "Fatema Begum", birthDate: "1990-05-12", bloodGroup: "O+", gender: "Female", occupation: "Teacher" },
    createdAt: "2024-02-11T09:00:00Z",
  },
  {
    id: "usr-karim", name: "Md. Karim Uddin", email: "karim.uddin@example.bd", phone: "+8801811-2xxxxx",
    role: "citizen", jurisdictionId: "j-rajamehar", nationalId: "•••• •••• 7734", status: "active",
    createdAt: "2023-11-03T09:00:00Z",
  },
  {
    id: "usr-iqbal", name: "Iqbal Enterprise", email: "iqbal.enterprise@example.bd",
    role: "citizen", jurisdictionId: "j-debidwar", status: "active",
    createdAt: "2026-06-30T10:00:00Z",
  },
  {
    id: "usr-shanti", name: "Shanti Rani Das", email: "shanti.das@example.bd", phone: "+8801911-8xxxxx",
    role: "citizen", jurisdictionId: "j-payalgacha", nationalId: "•••• •••• 1290", status: "active",
    createdAt: "2024-06-19T09:00:00Z",
  },
  {
    id: "usr-fatema", name: "Fatema Begum", email: "demo2@example.bd", phone: "+8801922-111111",
    role: "citizen", jurisdictionId: "j-rajamehar", nationalId: "•••• •••• 3312", status: "active",
    profileDetails: { nameBn: "ফাতেমা বেগম", occupation: "Homemaker", bloodGroup: "AB+", gender: "Female", birthDate: "1990-03-08", currentAddress: "Village: Rajamehar, Upazila: Debidwar, Cumilla", permanentAddress: "Rajamehar, Debidwar, Cumilla", fatherName: "Hafizur Rahman", motherName: "Kulsum Begum" },
    createdAt: "2025-01-15T09:00:00Z",
  },
  {
    id: "usr-rashed", name: "Rashed Khan", email: "demo3@example.bd", phone: "+8801933-222222",
    role: "citizen", jurisdictionId: "j-debidwar", nationalId: "•••• •••• 5589", status: "active",
    profileDetails: { nameBn: "রাশেদ খান", occupation: "Engineer", bloodGroup: "A-", gender: "Male", birthDate: "1988-07-22", currentAddress: "Debidwar Upazila, Cumilla", permanentAddress: "Debidwar, Cumilla", fatherName: "Lutfor Khan", motherName: "Rahela Begum" },
    createdAt: "2025-03-20T09:00:00Z",
  },
  {
    id: "usr-noor", name: "Noor Jahan", email: "demo4@example.bd", phone: "+8801944-333333",
    role: "citizen", jurisdictionId: "j-payalgacha", nationalId: "•••• •••• 7741", status: "active",
    profileDetails: { nameBn: "নূর জাহান", occupation: "Teacher", bloodGroup: "O-", gender: "Female", birthDate: "1992-12-14", currentAddress: "Payalgacha, Barura, Cumilla", permanentAddress: "Payalgacha, Barura, Cumilla", fatherName: "Abul Kashem", motherName: "Amena Khatun" },
    createdAt: "2025-06-10T09:00:00Z",
  },
  {
    id: "usr-habib", name: "Habib Molla", email: "demo5@example.bd", phone: "+8801955-444444",
    role: "citizen", jurisdictionId: "j-barura", nationalId: "•••• •••• 9923", status: "active",
    profileDetails: { nameBn: "হাবিব মোল্লা", occupation: "Businessman", bloodGroup: "B-", gender: "Male", birthDate: "1975-04-30", currentAddress: "Barura Upazila, Cumilla", permanentAddress: "Barura, Cumilla", fatherName: "Wahab Molla", motherName: "Fatema Molla" },
    createdAt: "2025-08-05T09:00:00Z",
  },

  {
    id: "usr-officer", name: "Nasrin Akter", email: "n.akter@minland.gov.bd", phone: "+8801712-345678",
    role: "land-office", jurisdictionId: "j-debidwar", title: "Sub-Registrar", status: "active",
    profileDetails: { nameBn: "নাসরিন আক্তার", fatherName: "Abdul Hakim", motherName: "Rahima Begum", birthDate: "1987-08-19", bloodGroup: "B+", gender: "Female", occupation: "Government Officer", currentAddress: "Debidwar, Cumilla", permanentAddress: "Cumilla, Bangladesh" },
    createdAt: "2021-01-05T09:00:00Z",
  },
  {
    id: "usr-officer2", name: "Abdul Mannan", email: "a.mannan@minland.gov.bd",
    role: "land-office", jurisdictionId: "j-barura", title: "Registration Clerk", status: "active",
    createdAt: "2022-08-22T09:00:00Z",
  },
  {
    id: "usr-agent", name: "Jahangir Alam", email: "j.alam@minland.gov.bd", phone: "+8801711-9xxxxx",
    role: "field-agent", jurisdictionId: "j-debidwar", title: "Survey Amin", status: "active",
    createdAt: "2022-03-14T09:00:00Z",
  },
  {
    id: "usr-agent2", name: "Rezaul Karim", email: "r.karim@minland.gov.bd",
    role: "field-agent", jurisdictionId: "j-barura", title: "Survey Assistant", status: "active",
    createdAt: "2023-05-30T09:00:00Z",
  },
  {
    // District-level, so she covers every upazila and mouza beneath Cumilla.
    id: "usr-agent3", name: "Farhana Yeasmin", email: "f.yeasmin@minland.gov.bd", phone: "+8801611-3xxxxx",
    role: "field-agent", jurisdictionId: "j-cumilla", title: "District Survey Officer", status: "active",
    createdAt: "2021-07-11T09:00:00Z",
  },
  {
    id: "usr-agent4", name: "Mizanur Rahman", email: "m.rahman@minland.gov.bd",
    role: "field-agent", jurisdictionId: "j-debidwar", title: "Survey Amin", status: "suspended",
    createdAt: "2023-02-08T09:00:00Z",
  },
  {
    id: "usr-mediator", name: "Shahida Khatun", email: "s.khatun@landtribunal.gov.bd",
    role: "mediator", jurisdictionId: "j-cumilla", title: "Settlement Officer (Retd. Judge)", status: "active",
    createdAt: "2020-09-01T09:00:00Z",
  },
  {
    id: "usr-mediator2", name: "Anwara Begum", email: "a.begum@landtribunal.gov.bd",
    role: "mediator", jurisdictionId: "j-cumilla", title: "Settlement Officer", status: "active",
    createdAt: "2021-03-15T09:00:00Z",
  },
  {
    id: "usr-admin", name: "Registry Administrator", email: "admin@plotguard.gov.bd",
    role: "admin", jurisdictionId: "j-cumilla", title: "Registry Administrator", status: "active",
    createdAt: "2020-01-01T09:00:00Z",
  },
  {
    id: "usr-legacy-1", name: "Abdul Jalil Sarkar", email: "legacy-1@example.bd",
    role: "citizen", jurisdictionId: "j-rajamehar", status: "invited", createdAt: "1998-03-01T00:00:00Z",
  },
  {
    id: "usr-legacy-2", name: "Late Fazlul Haque", email: "legacy-2@example.bd",
    role: "citizen", jurisdictionId: "j-rajamehar", status: "invited", createdAt: "1990-04-02T00:00:00Z",
  },
];

/** The canonical signed-in user for each role (used by the dev role switcher). */
export const CURRENT_USER_BY_ROLE: Record<Role, ID> = {
  citizen: "usr-ayesha",
  "land-office": "usr-officer",
  "field-agent": "usr-agent",
  mediator: "usr-mediator",
  admin: "usr-admin",
};

// ---------------------------------------------------------------------------
// Parcels
// ---------------------------------------------------------------------------
export const parcels: Parcel[] = [
  {
    id: "p-142", ulpin: "ILR-CUM-DEB-000001", dagNo: "CS-142/3", khatianNo: "512", title: "Paddy field, Rajamehar", jurisdictionId: "j-rajamehar",
    landUse: "agricultural", area: { value: 82, unit: "decimal" }, ownerId: "usr-ayesha", ownerName: "Ayesha Siddika",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.549, lng: 90.989 },
    boundary: square({ lat: 23.549, lng: 90.989 }), marketValue: { amount: 4800000, currency: "BDT" },
    registeredAt: "2015-07-20T00:00:00Z", lastMutationAt: "2015-07-20T00:00:00Z", openDisputeCount: 1,
  },
  {
    id: "p-088", ulpin: "ILR-CUM-DEB-000002", dagNo: "RS-88", khatianNo: "217", title: "Homestead plot, Rajamehar", jurisdictionId: "j-rajamehar",
    landUse: "residential", area: { value: 8, unit: "katha" }, ownerId: "usr-legacy-2", ownerName: "Late Fazlul Haque",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.5502, lng: 90.9871 },
    boundary: square({ lat: 23.5502, lng: 90.9871 }, 0.0005), marketValue: { amount: 3200000, currency: "BDT" },
    registeredAt: "1990-04-02T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-092", ulpin: "ILR-CUM-DEB-000003", dagNo: "RS-92/4", khatianNo: "640", title: "Roadside plot, Rajamehar", jurisdictionId: "j-rajamehar",
    landUse: "residential", area: { value: 5, unit: "katha" }, ownerId: "usr-ayesha", ownerName: "Ayesha Siddika",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.5475, lng: 90.9905 },
    boundary: square({ lat: 23.5475, lng: 90.9905 }, 0.0006), marketValue: { amount: 2600000, currency: "BDT" },
    registeredAt: "2026-07-10T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-205", ulpin: "ILR-CUM-BAR-000001", dagNo: "BS-205", khatianNo: "1104", title: "Betel-nut orchard, Payalgacha", jurisdictionId: "j-payalgacha",
    landUse: "agricultural", area: { value: 120, unit: "decimal" }, ownerId: "usr-shanti", ownerName: "Shanti Rani Das",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.3625, lng: 91.033 },
    boundary: square({ lat: 23.3625, lng: 91.033 }, 0.0015), marketValue: { amount: 6900000, currency: "BDT" },
    registeredAt: "2018-01-16T00:00:00Z", lastMutationAt: "2018-01-16T00:00:00Z", openDisputeCount: 2,
  },
  {
    id: "p-311", ulpin: "ILR-CUM-DEB-000004", dagNo: "RS-311/2", khatianNo: "355", title: "Bazar shop plot, Debidwar", jurisdictionId: "j-debidwar",
    landUse: "commercial", area: { value: 3, unit: "katha" }, ownerId: "usr-iqbal", ownerName: "Iqbal Enterprise",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.551, lng: 90.986 },
    boundary: square({ lat: 23.551, lng: 90.986 }, 0.0004), marketValue: { amount: 9500000, currency: "BDT" },
    registeredAt: "2019-10-08T00:00:00Z", lastMutationAt: "2026-06-30T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-176", ulpin: "ILR-CUM-BAR-000002", dagNo: "CS-176", khatianNo: "489", title: "Hillfoot plot, Payalgacha", jurisdictionId: "j-payalgacha",
    landUse: "vacant", area: { value: 60, unit: "decimal" }, ownerId: "usr-karim", ownerName: "Md. Karim Uddin",
    ownershipType: "joint", registryStatus: "verified", centroid: { lat: 23.359, lng: 91.0365 },
    boundary: square({ lat: 23.359, lng: 91.0365 }, 0.0012), marketValue: { amount: 3700000, currency: "BDT" },
    registeredAt: "2012-05-22T00:00:00Z", openDisputeCount: 1,
  },
  {
    id: "p-401", ulpin: "ILR-CUM-DEB-000005", dagNo: "RS-401", khatianNo: "701", title: "North paddy plot, Rajamehar", jurisdictionId: "j-rajamehar",
    landUse: "agricultural", area: { value: 46, unit: "decimal" }, ownerId: "usr-ayesha", ownerName: "Ayesha Siddika",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.552, lng: 90.991 }, boundary: square({ lat: 23.552, lng: 90.991 }, 0.0007),
    marketValue: { amount: 2850000, currency: "BDT" }, registeredAt: "2020-03-12T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-402", ulpin: "ILR-CUM-DEB-000006", dagNo: "RS-402", khatianNo: "702", title: "Canal-side homestead, Rajamehar", jurisdictionId: "j-rajamehar",
    landUse: "residential", area: { value: 6, unit: "katha" }, ownerId: "usr-karim", ownerName: "Md. Karim Uddin",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.553, lng: 90.992 }, boundary: square({ lat: 23.553, lng: 90.992 }, 0.0005),
    marketValue: { amount: 4100000, currency: "BDT" }, registeredAt: "2017-09-18T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-403", ulpin: "ILR-CUM-DEB-000007", dagNo: "RS-403", khatianNo: "703", title: "South boundary plot, Rajamehar", jurisdictionId: "j-rajamehar",
    landUse: "vacant", area: { value: 31, unit: "decimal" }, ownerId: "usr-ayesha", ownerName: "Ayesha Siddika",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.554, lng: 90.993 }, boundary: square({ lat: 23.554, lng: 90.993 }, 0.0006),
    marketValue: { amount: 2300000, currency: "BDT" }, registeredAt: "2016-11-05T00:00:00Z", openDisputeCount: 1,
  },
  {
    id: "p-404", ulpin: "ILR-CUM-DEB-000008", dagNo: "RS-404", khatianNo: "704", title: "Market approach plot, Debidwar", jurisdictionId: "j-debidwar",
    landUse: "commercial", area: { value: 4, unit: "katha" }, ownerId: "usr-iqbal", ownerName: "Iqbal Enterprise",
    ownershipType: "corporate", registryStatus: "verified", centroid: { lat: 23.555, lng: 90.994 }, boundary: square({ lat: 23.555, lng: 90.994 }, 0.0004),
    marketValue: { amount: 7800000, currency: "BDT" }, registeredAt: "2022-02-14T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-405", ulpin: "ILR-CUM-DEB-000009", dagNo: "RS-405", khatianNo: "705", title: "West garden plot, Rajamehar", jurisdictionId: "j-rajamehar",
    landUse: "mixed", area: { value: 38, unit: "decimal" }, ownerId: "usr-karim", ownerName: "Md. Karim Uddin",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.556, lng: 90.995 }, boundary: square({ lat: 23.556, lng: 90.995 }, 0.0007),
    marketValue: { amount: 3350000, currency: "BDT" }, registeredAt: "2014-06-21T00:00:00Z", lastMutationAt: "2026-08-28T10:00:00Z", openDisputeCount: 0,
  },

  // --- Extra plots: Ayesha Siddika (usr-ayesha) ---
  {
    id: "p-501", ulpin: "ILR-CUM-DEB-000010", dagNo: "RS-501", khatianNo: "811", title: "Fishpond plot, Rajamehar", jurisdictionId: "j-rajamehar",
    landUse: "agricultural", area: { value: 65, unit: "decimal" }, ownerId: "usr-ayesha", ownerName: "Ayesha Siddika",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.5505, lng: 90.9915 }, boundary: square({ lat: 23.5505, lng: 90.9915 }, 0.001),
    marketValue: { amount: 3900000, currency: "BDT" }, registeredAt: "2013-04-18T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-502", ulpin: "ILR-CUM-DEB-000011", dagNo: "RS-502", khatianNo: "812", title: "Corner shop plot, Debidwar", jurisdictionId: "j-debidwar",
    landUse: "commercial", area: { value: 2, unit: "katha" }, ownerId: "usr-ayesha", ownerName: "Ayesha Siddika",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.5465, lng: 90.9885 }, boundary: square({ lat: 23.5465, lng: 90.9885 }, 0.0003),
    marketValue: { amount: 5200000, currency: "BDT" }, registeredAt: "2021-11-09T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-503", ulpin: "ILR-CUM-DEB-000012", dagNo: "RS-503", khatianNo: "813", title: "Bamboo grove, Rajamehar", jurisdictionId: "j-rajamehar",
    landUse: "mixed", area: { value: 25, unit: "decimal" }, ownerId: "usr-ayesha", ownerName: "Ayesha Siddika",
    ownershipType: "joint", registryStatus: "verified", centroid: { lat: 23.5488, lng: 90.9901 }, boundary: square({ lat: 23.5488, lng: 90.9901 }, 0.0005),
    marketValue: { amount: 1750000, currency: "BDT" }, registeredAt: "2019-06-01T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-504", ulpin: "ILR-CUM-DEB-000013", dagNo: "CS-504", khatianNo: "814", title: "Inherited orchard, Rajamehar", jurisdictionId: "j-rajamehar",
    landUse: "agricultural", area: { value: 98, unit: "decimal" }, ownerId: "usr-ayesha", ownerName: "Ayesha Siddika",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.5535, lng: 90.9878 }, boundary: square({ lat: 23.5535, lng: 90.9878 }, 0.0013),
    marketValue: { amount: 5900000, currency: "BDT" }, registeredAt: "2011-02-14T00:00:00Z", openDisputeCount: 0,
  },

  // --- Extra plots: Md. Karim Uddin (usr-karim) ---
  {
    id: "p-511", ulpin: "ILR-CUM-BAR-000003", dagNo: "BS-511", khatianNo: "901", title: "Paddy lowland, Payalgacha", jurisdictionId: "j-payalgacha",
    landUse: "agricultural", area: { value: 75, unit: "decimal" }, ownerId: "usr-karim", ownerName: "Md. Karim Uddin",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.3605, lng: 91.0345 }, boundary: square({ lat: 23.3605, lng: 91.0345 }, 0.0011),
    marketValue: { amount: 4200000, currency: "BDT" }, registeredAt: "2010-08-30T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-512", ulpin: "ILR-CUM-DEB-000014", dagNo: "RS-512", khatianNo: "902", title: "Residential plot, Debidwar Town", jurisdictionId: "j-debidwar",
    landUse: "residential", area: { value: 4, unit: "katha" }, ownerId: "usr-karim", ownerName: "Md. Karim Uddin",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.548, lng: 90.987 }, boundary: square({ lat: 23.548, lng: 90.987 }, 0.0004),
    marketValue: { amount: 3800000, currency: "BDT" }, registeredAt: "2023-03-22T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-513", ulpin: "ILR-CUM-BAR-000004", dagNo: "BS-513", khatianNo: "903", title: "Roadside vacant plot, Barura", jurisdictionId: "j-barura",
    landUse: "vacant", area: { value: 18, unit: "decimal" }, ownerId: "usr-karim", ownerName: "Md. Karim Uddin",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.365, lng: 91.029 }, boundary: square({ lat: 23.365, lng: 91.029 }, 0.0005),
    marketValue: { amount: 1100000, currency: "BDT" }, registeredAt: "2025-01-15T00:00:00Z", openDisputeCount: 0,
  },

  // --- Extra plots: Shanti Rani Das (usr-shanti) ---
  {
    id: "p-521", ulpin: "ILR-CUM-BAR-000005", dagNo: "BS-521", khatianNo: "1201", title: "Vegetable farm, Payalgacha", jurisdictionId: "j-payalgacha",
    landUse: "agricultural", area: { value: 55, unit: "decimal" }, ownerId: "usr-shanti", ownerName: "Shanti Rani Das",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.3615, lng: 91.0285 }, boundary: square({ lat: 23.3615, lng: 91.0285 }, 0.0009),
    marketValue: { amount: 3100000, currency: "BDT" }, registeredAt: "2015-09-10T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-522", ulpin: "ILR-CUM-BAR-000006", dagNo: "BS-522", khatianNo: "1202", title: "Homestead, Payalgacha", jurisdictionId: "j-payalgacha",
    landUse: "residential", area: { value: 7, unit: "katha" }, ownerId: "usr-shanti", ownerName: "Shanti Rani Das",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.363, lng: 91.032 }, boundary: square({ lat: 23.363, lng: 91.032 }, 0.0005),
    marketValue: { amount: 4500000, currency: "BDT" }, registeredAt: "2009-12-01T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-523", ulpin: "ILR-CUM-BAR-000007", dagNo: "BS-523", khatianNo: "1203", title: "Pond-side mixed plot, Barura", jurisdictionId: "j-barura",
    landUse: "mixed", area: { value: 42, unit: "decimal" }, ownerId: "usr-shanti", ownerName: "Shanti Rani Das",
    ownershipType: "joint", registryStatus: "verified", centroid: { lat: 23.364, lng: 91.031 }, boundary: square({ lat: 23.364, lng: 91.031 }, 0.0008),
    marketValue: { amount: 2550000, currency: "BDT" }, registeredAt: "2020-07-25T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-524", ulpin: "ILR-CUM-BAR-000008", dagNo: "BS-524", khatianNo: "1204", title: "Commercial shed, Barura Bazar", jurisdictionId: "j-barura",
    landUse: "commercial", area: { value: 3, unit: "katha" }, ownerId: "usr-shanti", ownerName: "Shanti Rani Das",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.362, lng: 91.0275 }, boundary: square({ lat: 23.362, lng: 91.0275 }, 0.0003),
    marketValue: { amount: 8200000, currency: "BDT" }, registeredAt: "2024-05-30T00:00:00Z", openDisputeCount: 0,
  },

  // --- Extra plots: Iqbal Enterprise (usr-iqbal) ---
  {
    id: "p-531", ulpin: "ILR-CUM-DEB-000015", dagNo: "RS-531", khatianNo: "1301", title: "Warehouse plot, Debidwar", jurisdictionId: "j-debidwar",
    landUse: "commercial", area: { value: 6, unit: "katha" }, ownerId: "usr-iqbal", ownerName: "Iqbal Enterprise",
    ownershipType: "corporate", registryStatus: "verified", centroid: { lat: 23.5525, lng: 90.9845 }, boundary: square({ lat: 23.5525, lng: 90.9845 }, 0.0006),
    marketValue: { amount: 12500000, currency: "BDT" }, registeredAt: "2023-08-11T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-532", ulpin: "ILR-CUM-DEB-000016", dagNo: "RS-532", khatianNo: "1302", title: "Industrial shed, Debidwar", jurisdictionId: "j-debidwar",
    landUse: "industrial", area: { value: 9, unit: "katha" }, ownerId: "usr-iqbal", ownerName: "Iqbal Enterprise",
    ownershipType: "corporate", registryStatus: "verified", centroid: { lat: 23.5498, lng: 90.9832 }, boundary: square({ lat: 23.5498, lng: 90.9832 }, 0.0007),
    marketValue: { amount: 18000000, currency: "BDT" }, registeredAt: "2024-10-03T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-533", ulpin: "ILR-CUM-DEB-000017", dagNo: "RS-533", khatianNo: "1303", title: "Roadfront plot, Cumilla Road", jurisdictionId: "j-debidwar",
    landUse: "commercial", area: { value: 5, unit: "katha" }, ownerId: "usr-iqbal", ownerName: "Iqbal Enterprise",
    ownershipType: "corporate", registryStatus: "flagged", centroid: { lat: 23.553, lng: 90.98 }, boundary: square({ lat: 23.553, lng: 90.98 }, 0.0005),
    marketValue: { amount: 14000000, currency: "BDT" }, registeredAt: "2026-05-21T00:00:00Z", openDisputeCount: 0,
  },

  // --- Extra plots: Late Fazlul Haque (usr-legacy-2) estate ---
  {
    id: "p-541", ulpin: "ILR-CUM-DEB-000018", dagNo: "RS-541", khatianNo: "218", title: "Adjoining homestead, Rajamehar", jurisdictionId: "j-rajamehar",
    landUse: "residential", area: { value: 5, unit: "katha" }, ownerId: "usr-legacy-2", ownerName: "Late Fazlul Haque",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.5508, lng: 90.9868 }, boundary: square({ lat: 23.5508, lng: 90.9868 }, 0.0004),
    marketValue: { amount: 2700000, currency: "BDT" }, registeredAt: "1985-06-10T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-542", ulpin: "ILR-CUM-DEB-000019", dagNo: "CS-542", khatianNo: "219", title: "Paddy estate, Rajamehar", jurisdictionId: "j-rajamehar",
    landUse: "agricultural", area: { value: 110, unit: "decimal" }, ownerId: "usr-legacy-2", ownerName: "Late Fazlul Haque",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.551, lng: 90.9858 }, boundary: square({ lat: 23.551, lng: 90.9858 }, 0.0014),
    marketValue: { amount: 6600000, currency: "BDT" }, registeredAt: "1978-11-20T00:00:00Z", openDisputeCount: 0,
  },
  // --- Demo Citizen Parcels (Fatema, Rashed, Noor, Habib) ---
  {
    id: "p-d2-1", ulpin: "ILR-CUM-DEB-000020", dagNo: "RS-601", khatianNo: "811", title: "Paddy plot, Rajamehar (Fatema)", jurisdictionId: "j-rajamehar",
    landUse: "agricultural", area: { value: 55, unit: "decimal" }, ownerId: "usr-fatema", ownerName: "Fatema Begum",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.548, lng: 90.988 }, boundary: square({ lat: 23.548, lng: 90.988 }),
    marketValue: { amount: 3300000, currency: "BDT" }, registeredAt: "2022-05-10T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-d2-2", ulpin: "ILR-CUM-DEB-000021", dagNo: "RS-602", khatianNo: "812", title: "Homestead plot, Rajamehar (Fatema)", jurisdictionId: "j-rajamehar",
    landUse: "residential", area: { value: 4, unit: "katha" }, ownerId: "usr-fatema", ownerName: "Fatema Begum",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.547, lng: 90.987 }, boundary: square({ lat: 23.547, lng: 90.987 }, 0.0005),
    marketValue: { amount: 2100000, currency: "BDT" }, registeredAt: "2023-11-18T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-d2-3", ulpin: "ILR-CUM-DEB-000022", dagNo: "RS-603", khatianNo: "813", title: "Fish Pond & Agricultural Plot, Rajamehar", jurisdictionId: "j-rajamehar",
    landUse: "agricultural", area: { value: 45, unit: "decimal" }, ownerId: "usr-fatema", ownerName: "Fatema Begum",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.546, lng: 90.989 }, boundary: square({ lat: 23.546, lng: 90.989 }, 0.0007),
    marketValue: { amount: 2800000, currency: "BDT" }, registeredAt: "2020-07-14T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-d2-4", ulpin: "ILR-CUM-DEB-000023", dagNo: "RS-604", khatianNo: "814", title: "Village Market Commercial Shed, Rajamehar", jurisdictionId: "j-rajamehar",
    landUse: "commercial", area: { value: 3.5, unit: "katha" }, ownerId: "usr-fatema", ownerName: "Fatema Begum",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.545, lng: 90.990 }, boundary: square({ lat: 23.545, lng: 90.990 }, 0.0004),
    marketValue: { amount: 4600000, currency: "BDT" }, registeredAt: "2022-03-25T00:00:00Z", openDisputeCount: 0,
  },

  {
    id: "p-d3-1", ulpin: "ILR-CUM-DEB-000024", dagNo: "RS-701", khatianNo: "901", title: "Commercial plot, Debidwar (Rashed)", jurisdictionId: "j-debidwar",
    landUse: "commercial", area: { value: 6, unit: "katha" }, ownerId: "usr-rashed", ownerName: "Rashed Khan",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.552, lng: 90.984 }, boundary: square({ lat: 23.552, lng: 90.984 }, 0.0005),
    marketValue: { amount: 8500000, currency: "BDT" }, registeredAt: "2021-08-22T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-d3-2", ulpin: "ILR-CUM-DEB-000025", dagNo: "RS-702", khatianNo: "902", title: "Agricultural Paddy Plot, Debidwar", jurisdictionId: "j-debidwar",
    landUse: "agricultural", area: { value: 65, unit: "decimal" }, ownerId: "usr-rashed", ownerName: "Rashed Khan",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.553, lng: 90.985 }, boundary: square({ lat: 23.553, lng: 90.985 }, 0.0008),
    marketValue: { amount: 3800000, currency: "BDT" }, registeredAt: "2019-04-12T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-d3-3", ulpin: "ILR-CUM-DEB-000026", dagNo: "RS-703", khatianNo: "903", title: "Residential Homestead, Debidwar", jurisdictionId: "j-debidwar",
    landUse: "residential", area: { value: 8, unit: "katha" }, ownerId: "usr-rashed", ownerName: "Rashed Khan",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.554, lng: 90.986 }, boundary: square({ lat: 23.554, lng: 90.986 }, 0.0006),
    marketValue: { amount: 6200000, currency: "BDT" }, registeredAt: "2022-01-15T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-d3-4", ulpin: "ILR-CUM-DEB-000027", dagNo: "RS-704", khatianNo: "904", title: "Mango & Litchi Orchard, Debidwar", jurisdictionId: "j-debidwar",
    landUse: "agricultural", area: { value: 85, unit: "decimal" }, ownerId: "usr-rashed", ownerName: "Rashed Khan",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.556, lng: 90.988 }, boundary: square({ lat: 23.556, lng: 90.988 }, 0.0012),
    marketValue: { amount: 4900000, currency: "BDT" }, registeredAt: "2018-09-10T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-d3-5", ulpin: "ILR-CUM-DEB-000028", dagNo: "RS-705", khatianNo: "905", title: "Debidwar Bazar Commercial Shop", jurisdictionId: "j-debidwar",
    landUse: "commercial", area: { value: 4, unit: "katha" }, ownerId: "usr-rashed", ownerName: "Rashed Khan",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.550, lng: 90.983 }, boundary: square({ lat: 23.550, lng: 90.983 }, 0.0005),
    marketValue: { amount: 8900000, currency: "BDT" }, registeredAt: "2023-06-20T00:00:00Z", openDisputeCount: 0,
  },

  {
    id: "p-d4-1", ulpin: "ILR-CUM-BAR-000020", dagNo: "BS-301", khatianNo: "1201", title: "Agricultural plot, Payalgacha (Noor)", jurisdictionId: "j-payalgacha",
    landUse: "agricultural", area: { value: 80, unit: "decimal" }, ownerId: "usr-noor", ownerName: "Noor Jahan",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.361, lng: 91.034 }, boundary: square({ lat: 23.361, lng: 91.034 }, 0.001),
    marketValue: { amount: 4800000, currency: "BDT" }, registeredAt: "2023-03-05T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-d4-2", ulpin: "ILR-CUM-BAR-000021", dagNo: "BS-302", khatianNo: "1202", title: "Residential Compound, Payalgacha", jurisdictionId: "j-payalgacha",
    landUse: "residential", area: { value: 7, unit: "katha" }, ownerId: "usr-noor", ownerName: "Noor Jahan",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.362, lng: 91.035 }, boundary: square({ lat: 23.362, lng: 91.035 }, 0.0006),
    marketValue: { amount: 4200000, currency: "BDT" }, registeredAt: "2021-08-19T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-d4-3", ulpin: "ILR-CUM-BAR-000022", dagNo: "BS-303", khatianNo: "1203", title: "Paddy & Crop Field, Payalgacha", jurisdictionId: "j-payalgacha",
    landUse: "agricultural", area: { value: 70, unit: "decimal" }, ownerId: "usr-noor", ownerName: "Noor Jahan",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.363, lng: 91.036 }, boundary: square({ lat: 23.363, lng: 91.036 }, 0.001),
    marketValue: { amount: 3500000, currency: "BDT" }, registeredAt: "2019-11-25T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-d4-4", ulpin: "ILR-CUM-BAR-000023", dagNo: "BS-304", khatianNo: "1204", title: "Commercial Roadfront Plot, Payalgacha", jurisdictionId: "j-payalgacha",
    landUse: "commercial", area: { value: 4, unit: "katha" }, ownerId: "usr-noor", ownerName: "Noor Jahan",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.360, lng: 91.033 }, boundary: square({ lat: 23.360, lng: 91.033 }, 0.0005),
    marketValue: { amount: 6800000, currency: "BDT" }, registeredAt: "2024-02-10T00:00:00Z", openDisputeCount: 0,
  },

  {
    id: "p-d5-1", ulpin: "ILR-CUM-BAR-000024", dagNo: "BS-401", khatianNo: "1401", title: "Riverside land, Barura (Habib)", jurisdictionId: "j-barura",
    landUse: "mixed", area: { value: 95, unit: "decimal" }, ownerId: "usr-habib", ownerName: "Habib Molla",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.420, lng: 91.010 }, boundary: square({ lat: 23.420, lng: 91.010 }, 0.0012),
    marketValue: { amount: 5700000, currency: "BDT" }, registeredAt: "2020-12-01T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-d5-2", ulpin: "ILR-CUM-BAR-000025", dagNo: "BS-402", khatianNo: "1402", title: "Orchard, Barura (Habib)", jurisdictionId: "j-barura",
    landUse: "agricultural", area: { value: 45, unit: "decimal" }, ownerId: "usr-habib", ownerName: "Habib Molla",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.421, lng: 91.011 }, boundary: square({ lat: 23.421, lng: 91.011 }),
    marketValue: { amount: 2800000, currency: "BDT" }, registeredAt: "2022-07-15T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-d5-3", ulpin: "ILR-CUM-BAR-000026", dagNo: "BS-403", khatianNo: "1403", title: "Wholesale Warehouse & Store, Barura", jurisdictionId: "j-barura",
    landUse: "commercial", area: { value: 9, unit: "katha" }, ownerId: "usr-habib", ownerName: "Habib Molla",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.422, lng: 91.012 }, boundary: square({ lat: 23.422, lng: 91.012 }, 0.0007),
    marketValue: { amount: 11000000, currency: "BDT" }, registeredAt: "2021-05-18T00:00:00Z", openDisputeCount: 0,
  },
  {
    id: "p-d5-4", ulpin: "ILR-CUM-BAR-000027", dagNo: "BS-404", khatianNo: "1404", title: "Residential Compound, Barura", jurisdictionId: "j-barura",
    landUse: "residential", area: { value: 11, unit: "katha" }, ownerId: "usr-habib", ownerName: "Habib Molla",
    ownershipType: "sole", registryStatus: "verified", centroid: { lat: 23.423, lng: 91.013 }, boundary: square({ lat: 23.423, lng: 91.013 }, 0.0008),
    marketValue: { amount: 7800000, currency: "BDT" }, registeredAt: "2018-03-22T00:00:00Z", openDisputeCount: 0,
  },

];

// Encumbrances. Mirrors apps/api/prisma/seed.ts exactly — both effects the
// rule distinguishes (a releasable mortgage, outright blockers) plus one
// discharged mortgage so the "expired" path exists in real data too.
export const parcelRestrictions: ParcelRestriction[] = [
  { id: "res-1", parcelId: "p-088", type: "mortgage", authority: "Sonali Bank, Debidwar Branch", referenceNo: "SB/MTG/2024/0412", note: "Charged against an agricultural loan.", fromDate: "2024-03-11T00:00:00Z", toDate: null },
  { id: "res-2", parcelId: "p-176", type: "injunction", authority: "Cumilla Joint District Judge Court", referenceNo: "Title Suit 214/2026", note: "Dealings restrained pending disposal of the forged-deed suit.", fromDate: "2026-07-02T00:00:00Z", toDate: null },
  { id: "res-3", parcelId: "p-205", type: "acquisition", authority: "Deputy Commissioner, Cumilla", referenceNo: "LA Case 39/2026", note: "Section 4 notice served for the Debidwar–Barura road widening.", fromDate: "2026-06-20T00:00:00Z", toDate: null },
  { id: "res-4", parcelId: "p-311", type: "mortgage", authority: "Janata Bank, Cumilla", referenceNo: "JB/MTG/2019/1188", note: "Discharged on repayment.", fromDate: "2019-11-02T00:00:00Z", toDate: "2025-01-30T00:00:00Z" },
];

export const khasLandPlots: any[] = [
  { id: "klp-1", mouza: "Rajamehar", upazila: "Debidwar", district: "Cumilla", dagNo: "110", landUse: "agricultural", areaDecimals: 50, centroidLat: 23.550, centroidLng: 90.990, boundaryGeoJson: square({ lat: 23.550, lng: 90.990 }), status: "available" },
  { id: "klp-2", mouza: "Rajamehar", upazila: "Debidwar", district: "Cumilla", dagNo: "115", landUse: "non-agricultural", areaDecimals: 12, centroidLat: 23.552, centroidLng: 90.992, boundaryGeoJson: square({ lat: 23.552, lng: 90.992 }), status: "available" },
  { id: "klp-3", mouza: "Payalgacha", upazila: "Barura", district: "Cumilla", dagNo: "220", landUse: "agricultural", areaDecimals: 120, centroidLat: 23.360, centroidLng: 91.030, boundaryGeoJson: square({ lat: 23.360, lng: 91.030 }), status: "available" },
  { id: "klp-4", mouza: "Payalgacha", upazila: "Barura", district: "Cumilla", dagNo: "225", landUse: "non-agricultural", areaDecimals: 8, centroidLat: 23.362, centroidLng: 91.032, boundaryGeoJson: square({ lat: 23.362, lng: 91.032 }), status: "reserved" },
  { id: "klp-5", mouza: "Debidwar", upazila: "Debidwar", district: "Cumilla", dagNo: "45", landUse: "non-agricultural", areaDecimals: 5, centroidLat: 23.555, centroidLng: 90.985, boundaryGeoJson: square({ lat: 23.555, lng: 90.985 }), status: "leased" },
];

export const ownershipRecords: OwnershipRecord[] = [
  { id: "own-1", parcelId: "p-142", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "purchase", fromDate: "2015-07-20T00:00:00Z", toDate: null, documentId: "d-2" },
  { id: "own-2", parcelId: "p-142", ownerId: "usr-legacy-1", ownerName: "Abdul Jalil Sarkar", acquisitionType: "grant", fromDate: "1998-03-01T00:00:00Z", toDate: "2015-07-20T00:00:00Z" },
  { id: "own-4", parcelId: "p-088", ownerId: "usr-legacy-2", ownerName: "Late Fazlul Haque", acquisitionType: "inheritance", fromDate: "1990-04-02T00:00:00Z", toDate: null },
  { id: "own-5", parcelId: "p-311", ownerId: "usr-karim", ownerName: "Md. Karim Uddin", acquisitionType: "purchase", fromDate: "2019-10-08T00:00:00Z", toDate: "2026-06-30T10:00:00Z" },
  { id: "own-6", parcelId: "p-311", ownerId: "usr-iqbal", ownerName: "Iqbal Enterprise", acquisitionType: "purchase", fromDate: "2026-06-30T10:00:00Z", toDate: null, documentId: "d-7", mutationId: "m-1180" },
  { id: "own-7", parcelId: "p-401", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "purchase", fromDate: "2020-03-12T00:00:00Z", toDate: null, documentId: "d-14" },
  { id: "own-8", parcelId: "p-402", ownerId: "usr-karim", ownerName: "Md. Karim Uddin", acquisitionType: "purchase", fromDate: "2017-09-18T00:00:00Z", toDate: null, documentId: "d-15" },
  { id: "own-9", parcelId: "p-403", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "inheritance", fromDate: "2016-11-05T00:00:00Z", toDate: null, documentId: "d-16" },
  { id: "own-10", parcelId: "p-404", ownerId: "usr-iqbal", ownerName: "Iqbal Enterprise", acquisitionType: "purchase", fromDate: "2022-02-14T00:00:00Z", toDate: null, documentId: "d-17" },
  { id: "own-11", parcelId: "p-405", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "purchase", fromDate: "2014-06-21T00:00:00Z", toDate: "2026-08-28T10:00:00Z" },
  { id: "own-12", parcelId: "p-405", ownerId: "usr-karim", ownerName: "Md. Karim Uddin", acquisitionType: "gift", fromDate: "2026-08-28T10:00:00Z", toDate: null, documentId: "d-18", mutationId: "m-1231" },
  // Extra: Ayesha
  { id: "own-20", parcelId: "p-501", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "purchase", fromDate: "2013-04-18T00:00:00Z", toDate: null, documentId: "d-p501" },
  { id: "own-21", parcelId: "p-502", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "purchase", fromDate: "2021-11-09T00:00:00Z", toDate: null, documentId: "d-p502" },
  { id: "own-22", parcelId: "p-503", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "inheritance", fromDate: "2019-06-01T00:00:00Z", toDate: null, documentId: "d-p503" },
  { id: "own-23", parcelId: "p-504", ownerId: "usr-ayesha", ownerName: "Ayesha Siddika", acquisitionType: "inheritance", fromDate: "2011-02-14T00:00:00Z", toDate: null, documentId: "d-p504" },
  // Extra: Karim
  { id: "own-30", parcelId: "p-511", ownerId: "usr-karim", ownerName: "Md. Karim Uddin", acquisitionType: "purchase", fromDate: "2010-08-30T00:00:00Z", toDate: null, documentId: "d-p511" },
  { id: "own-31", parcelId: "p-512", ownerId: "usr-karim", ownerName: "Md. Karim Uddin", acquisitionType: "purchase", fromDate: "2023-03-22T00:00:00Z", toDate: null, documentId: "d-p512" },
  { id: "own-32", parcelId: "p-513", ownerId: "usr-karim", ownerName: "Md. Karim Uddin", acquisitionType: "purchase", fromDate: "2025-01-15T00:00:00Z", toDate: null, documentId: "d-p513" },
  // Extra: Shanti
  { id: "own-40", parcelId: "p-521", ownerId: "usr-shanti", ownerName: "Shanti Rani Das", acquisitionType: "purchase", fromDate: "2015-09-10T00:00:00Z", toDate: null, documentId: "d-p521" },
  { id: "own-41", parcelId: "p-522", ownerId: "usr-shanti", ownerName: "Shanti Rani Das", acquisitionType: "inheritance", fromDate: "2009-12-01T00:00:00Z", toDate: null, documentId: "d-p522" },
  { id: "own-42", parcelId: "p-523", ownerId: "usr-shanti", ownerName: "Shanti Rani Das", acquisitionType: "purchase", fromDate: "2020-07-25T00:00:00Z", toDate: null, documentId: "d-p523" },
  { id: "own-43", parcelId: "p-524", ownerId: "usr-shanti", ownerName: "Shanti Rani Das", acquisitionType: "purchase", fromDate: "2024-05-30T00:00:00Z", toDate: null, documentId: "d-p524" },
  // Extra: Iqbal
  { id: "own-50", parcelId: "p-531", ownerId: "usr-iqbal", ownerName: "Iqbal Enterprise", acquisitionType: "purchase", fromDate: "2023-08-11T00:00:00Z", toDate: null, documentId: "d-p531" },
  { id: "own-51", parcelId: "p-532", ownerId: "usr-iqbal", ownerName: "Iqbal Enterprise", acquisitionType: "purchase", fromDate: "2024-10-03T00:00:00Z", toDate: null, documentId: "d-p532" },
  { id: "own-52", parcelId: "p-533", ownerId: "usr-iqbal", ownerName: "Iqbal Enterprise", acquisitionType: "purchase", fromDate: "2026-05-21T00:00:00Z", toDate: null, documentId: "d-p533" },
  // Extra: Legacy estate
  { id: "own-60", parcelId: "p-541", ownerId: "usr-legacy-2", ownerName: "Late Fazlul Haque", acquisitionType: "grant", fromDate: "1985-06-10T00:00:00Z", toDate: null, documentId: "d-p541" },
  { id: "own-61", parcelId: "p-542", ownerId: "usr-legacy-2", ownerName: "Late Fazlul Haque", acquisitionType: "grant", fromDate: "1978-11-20T00:00:00Z", toDate: null, documentId: "d-p542" },
  // Demo Citizens Ownership Records
  { id: "own-d2-1", parcelId: "p-d2-1", ownerId: "usr-fatema", ownerName: "Fatema Begum", acquisitionType: "inheritance", fromDate: "2022-05-10T00:00:00Z", toDate: null, documentId: "d-d2-1" },
  { id: "own-d2-2", parcelId: "p-d2-2", ownerId: "usr-fatema", ownerName: "Fatema Begum", acquisitionType: "purchase", fromDate: "2023-11-18T00:00:00Z", toDate: null, documentId: "d-d2-2" },
  { id: "own-d2-3", parcelId: "p-d2-3", ownerId: "usr-fatema", ownerName: "Fatema Begum", acquisitionType: "purchase", fromDate: "2020-07-14T00:00:00Z", toDate: null, documentId: "d-d2-3" },
  { id: "own-d2-4", parcelId: "p-d2-4", ownerId: "usr-fatema", ownerName: "Fatema Begum", acquisitionType: "purchase", fromDate: "2022-03-25T00:00:00Z", toDate: null, documentId: "d-d2-4" },

  { id: "own-d3-1", parcelId: "p-d3-1", ownerId: "usr-rashed", ownerName: "Rashed Khan", acquisitionType: "purchase", fromDate: "2021-08-22T00:00:00Z", toDate: null, documentId: "d-d3-1" },
  { id: "own-d3-2", parcelId: "p-d3-2", ownerId: "usr-rashed", ownerName: "Rashed Khan", acquisitionType: "purchase", fromDate: "2019-04-12T00:00:00Z", toDate: null, documentId: "d-d3-2" },
  { id: "own-d3-3", parcelId: "p-d3-3", ownerId: "usr-rashed", ownerName: "Rashed Khan", acquisitionType: "purchase", fromDate: "2022-01-15T00:00:00Z", toDate: null, documentId: "d-d3-3" },
  { id: "own-d3-4", parcelId: "p-d3-4", ownerId: "usr-rashed", ownerName: "Rashed Khan", acquisitionType: "inheritance", fromDate: "2018-09-10T00:00:00Z", toDate: null, documentId: "d-d3-4" },
  { id: "own-d3-5", parcelId: "p-d3-5", ownerId: "usr-rashed", ownerName: "Rashed Khan", acquisitionType: "purchase", fromDate: "2023-06-20T00:00:00Z", toDate: null, documentId: "d-d3-5" },

  { id: "own-d4-1", parcelId: "p-d4-1", ownerId: "usr-noor", ownerName: "Noor Jahan", acquisitionType: "inheritance", fromDate: "2023-03-05T00:00:00Z", toDate: null, documentId: "d-d4-1" },
  { id: "own-d4-2", parcelId: "p-d4-2", ownerId: "usr-noor", ownerName: "Noor Jahan", acquisitionType: "purchase", fromDate: "2021-08-19T00:00:00Z", toDate: null, documentId: "d-d4-2" },
  { id: "own-d4-3", parcelId: "p-d4-3", ownerId: "usr-noor", ownerName: "Noor Jahan", acquisitionType: "inheritance", fromDate: "2019-11-25T00:00:00Z", toDate: null, documentId: "d-d4-3" },
  { id: "own-d4-4", parcelId: "p-d4-4", ownerId: "usr-noor", ownerName: "Noor Jahan", acquisitionType: "purchase", fromDate: "2024-02-10T00:00:00Z", toDate: null, documentId: "d-d4-4" },

  { id: "own-d5-1", parcelId: "p-d5-1", ownerId: "usr-habib", ownerName: "Habib Molla", acquisitionType: "purchase", fromDate: "2020-12-01T00:00:00Z", toDate: null, documentId: "d-d5-1" },
  { id: "own-d5-2", parcelId: "p-d5-2", ownerId: "usr-habib", ownerName: "Habib Molla", acquisitionType: "purchase", fromDate: "2022-07-15T00:00:00Z", toDate: null, documentId: "d-d5-2" },
  { id: "own-d5-3", parcelId: "p-d5-3", ownerId: "usr-habib", ownerName: "Habib Molla", acquisitionType: "purchase", fromDate: "2021-05-18T00:00:00Z", toDate: null, documentId: "d-d5-3" },
  { id: "own-d5-4", parcelId: "p-d5-4", ownerId: "usr-habib", ownerName: "Habib Molla", acquisitionType: "purchase", fromDate: "2018-03-22T00:00:00Z", toDate: null, documentId: "d-d5-4" },

];

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export const documents: LandDocument[] = [
  { id: "d-1", parcelId: "p-142", ownerId: "usr-ayesha", type: "title-deed", fileName: "khatian-142-512.pdf", mimeType: "application/pdf", sizeBytes: 482103, pageCount: 4, uploadedAt: "2026-07-18T11:20:00Z", uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.02, extractedFields: { "Dag No": "CS-142/3", "Khatian": "512", "Owner": "Ayesha Siddika" } },
  { id: "d-2", parcelId: "p-142", ownerId: "usr-ayesha", type: "sale-deed", fileName: "dolil-2015.pdf", mimeType: "application/pdf", sizeBytes: 903221, pageCount: 8, uploadedAt: "2026-07-12T09:05:00Z", uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.05 },
  { id: "d-3", parcelId: "p-088", ownerId: "usr-ayesha", type: "inheritance-affidavit", fileName: "warish-affidavit-088.pdf", mimeType: "application/pdf", sizeBytes: 221900, pageCount: 3, uploadedAt: "2026-07-21T14:40:00Z", uploadedById: "usr-ayesha", ocrStatus: "processing", verificationStatus: "unverified" },
  { id: "d-4", ownerId: "usr-ayesha", type: "id-proof", fileName: "nid-masked.jpg", mimeType: "image/jpeg", sizeBytes: 154002, uploadedAt: "2026-07-10T08:00:00Z", uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.01 },
  { id: "d-5", parcelId: "p-205", ownerId: "usr-shanti", type: "survey-report", fileName: "survey-205.pdf", mimeType: "application/pdf", sizeBytes: 671220, pageCount: 6, uploadedAt: "2026-07-05T10:15:00Z", uploadedById: "usr-officer2", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.08 },
  { id: "d-6", parcelId: "p-176", ownerId: "usr-karim", type: "sale-deed", fileName: "dolil-176-scan.pdf", mimeType: "application/pdf", sizeBytes: 1120345, pageCount: 5, uploadedAt: "2026-07-19T16:30:00Z", uploadedById: "usr-karim", ocrStatus: "extracted", verificationStatus: "flagged", fraudScore: 0.82, extractedFields: { "Dag No": "CS-176", "Stamp Value": "mismatch" } },
  { id: "d-7", parcelId: "p-311", ownerId: "usr-karim", type: "tax-receipt", fileName: "khajna-receipt-2026.pdf", mimeType: "application/pdf", sizeBytes: 88210, pageCount: 1, uploadedAt: "2026-07-01T12:00:00Z", uploadedById: "usr-karim", ocrStatus: "extracted", verificationStatus: "verified" },
  { id: "d-8", parcelId: "p-092", ownerId: "usr-ayesha", type: "title-deed", fileName: "khatian-092-640.pdf", mimeType: "application/pdf", sizeBytes: 402100, pageCount: 4, uploadedAt: "2026-07-22T09:30:00Z", uploadedById: "usr-ayesha", ocrStatus: "pending", verificationStatus: "unverified" },
  { id: "d-9", parcelId: "p-088", type: "mutation-order", fileName: "namjari-order-088.pdf", mimeType: "application/pdf", sizeBytes: 210554, pageCount: 2, uploadedAt: "2026-07-20T11:00:00Z", uploadedById: "usr-officer", ocrStatus: "processing", verificationStatus: "unverified" },
  { id: "d-10", parcelId: "p-205", type: "court-order", fileName: "court-order-205.pdf", mimeType: "application/pdf", sizeBytes: 512000, pageCount: 7, uploadedAt: "2026-06-28T15:20:00Z", uploadedById: "usr-officer2", ocrStatus: "extracted", verificationStatus: "verified" },
  { id: "d-11", parcelId: "p-176", ownerId: "usr-karim", type: "sale-deed", fileName: "dolil-176-alt.pdf", mimeType: "application/pdf", sizeBytes: 980112, pageCount: 5, uploadedAt: "2026-07-20T10:10:00Z", uploadedById: "usr-officer2", ocrStatus: "extracted", verificationStatus: "flagged", fraudScore: 0.67, extractedFields: { "Dag No": "CS-176", "Signature": "possible forgery" } },
  // Read cleanly, but the dag on the scan is not the dag it was filed against —
  // the OCR queue holds this and routes it to fraud review.
  { id: "d-12", parcelId: "p-311", ownerId: "usr-karim", type: "survey-report", fileName: "survey-311-amin.pdf", mimeType: "application/pdf", sizeBytes: 733410, pageCount: 4, uploadedAt: "2026-07-23T08:45:00Z", uploadedById: "usr-officer2", ocrStatus: "extracted", verificationStatus: "unverified", extractedFields: { "Dag No": "RS-311/7", Khatian: "355", Area: "3 katha" } },
  // A phone photo of a bound register page — the reader gave up on it.
  { id: "d-13", parcelId: "p-176", ownerId: "usr-karim", type: "title-deed", fileName: "khatian-176-photo.jpg", mimeType: "image/jpeg", sizeBytes: 3204118, uploadedAt: "2026-07-24T17:05:00Z", uploadedById: "usr-karim", ocrStatus: "failed", verificationStatus: "unverified" },
  { id: "d-14", parcelId: "p-401", ownerId: "usr-ayesha", type: "title-deed", fileName: "khatian-401-701.pdf", mimeType: "application/pdf", sizeBytes: 388120, pageCount: 3, uploadedAt: "2026-08-10T09:00:00Z", uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.01, extractedFields: { "Dag No": "RS-401", Khatian: "701", Owner: "Ayesha Siddika" } },
  { id: "d-15", parcelId: "p-402", ownerId: "usr-karim", type: "sale-deed", fileName: "sale-deed-402.pdf", mimeType: "application/pdf", sizeBytes: 612480, pageCount: 6, uploadedAt: "2026-09-05T08:30:00Z", uploadedById: "usr-karim", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.03, extractedFields: { "Dag No": "RS-402", Khatian: "702", Owner: "Md. Karim Uddin" } },
  { id: "d-16", parcelId: "p-403", ownerId: "usr-ayesha", type: "survey-report", fileName: "boundary-survey-403.pdf", mimeType: "application/pdf", sizeBytes: 544210, pageCount: 5, uploadedAt: "2026-09-07T07:00:00Z", uploadedById: "usr-agent", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.02 },
  { id: "d-17", parcelId: "p-404", ownerId: "usr-iqbal", type: "title-deed", fileName: "deed-404-scan.pdf", mimeType: "application/pdf", sizeBytes: 721330, pageCount: 7, uploadedAt: "2026-09-08T10:15:00Z", uploadedById: "usr-iqbal", ocrStatus: "extracted", verificationStatus: "flagged", fraudScore: 0.86, extractedFields: { "Dag No": "RS-440", Khatian: "704", Owner: "Iqbal Enterprise" } },
  { id: "d-18", parcelId: "p-405", ownerId: "usr-karim", type: "mutation-order", fileName: "mutation-order-405.pdf", mimeType: "application/pdf", sizeBytes: 264900, pageCount: 2, uploadedAt: "2026-08-28T10:05:00Z", uploadedById: "usr-officer", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.01 },
  // Extra dolils: Ayesha
  { id: "d-p501", parcelId: "p-501", ownerId: "usr-ayesha", type: "sale-deed", fileName: "dolil-501-fishpond.pdf", mimeType: "application/pdf", sizeBytes: 712400, pageCount: 6, uploadedAt: "2026-09-01T09:00:00Z", uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.03, extractedFields: { "Dag No": "RS-501", Khatian: "811", Owner: "Ayesha Siddika", Area: "65 decimal" } },
  { id: "d-p502", parcelId: "p-502", ownerId: "usr-ayesha", type: "sale-deed", fileName: "dolil-502-shop.pdf", mimeType: "application/pdf", sizeBytes: 889200, pageCount: 8, uploadedAt: "2026-09-02T08:30:00Z", uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.04, extractedFields: { "Dag No": "RS-502", Khatian: "812", Owner: "Ayesha Siddika", "Land Use": "commercial" } },
  { id: "d-p503", parcelId: "p-503", ownerId: "usr-ayesha", type: "inheritance-affidavit", fileName: "warish-503-bamboo.pdf", mimeType: "application/pdf", sizeBytes: 310000, pageCount: 3, uploadedAt: "2026-09-03T10:15:00Z", uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.02, extractedFields: { "Dag No": "RS-503", Khatian: "813", Owner: "Ayesha Siddika" } },
  { id: "d-p504", parcelId: "p-504", ownerId: "usr-ayesha", type: "title-deed", fileName: "khatian-504-orchard.pdf", mimeType: "application/pdf", sizeBytes: 540000, pageCount: 5, uploadedAt: "2026-09-04T07:45:00Z", uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.01, extractedFields: { "Dag No": "CS-504", Khatian: "814", Owner: "Ayesha Siddika", Area: "98 decimal" } },
  // Extra dolils: Karim
  { id: "d-p511", parcelId: "p-511", ownerId: "usr-karim", type: "sale-deed", fileName: "dolil-511-paddy.pdf", mimeType: "application/pdf", sizeBytes: 655000, pageCount: 6, uploadedAt: "2026-09-05T09:00:00Z", uploadedById: "usr-karim", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.03, extractedFields: { "Dag No": "BS-511", Khatian: "901", Owner: "Md. Karim Uddin" } },
  { id: "d-p512", parcelId: "p-512", ownerId: "usr-karim", type: "sale-deed", fileName: "dolil-512-residential.pdf", mimeType: "application/pdf", sizeBytes: 780000, pageCount: 7, uploadedAt: "2026-09-06T08:00:00Z", uploadedById: "usr-karim", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.02, extractedFields: { "Dag No": "RS-512", Khatian: "902", Owner: "Md. Karim Uddin", Area: "4 katha" } },
  { id: "d-p513", parcelId: "p-513", ownerId: "usr-karim", type: "sale-deed", fileName: "dolil-513-vacant.pdf", mimeType: "application/pdf", sizeBytes: 422000, pageCount: 4, uploadedAt: "2026-09-07T10:30:00Z", uploadedById: "usr-karim", ocrStatus: "pending", verificationStatus: "unverified" },
  // Extra dolils: Shanti
  { id: "d-p521", parcelId: "p-521", ownerId: "usr-shanti", type: "sale-deed", fileName: "dolil-521-vegetable.pdf", mimeType: "application/pdf", sizeBytes: 600000, pageCount: 5, uploadedAt: "2026-09-01T11:00:00Z", uploadedById: "usr-shanti", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.04, extractedFields: { "Dag No": "BS-521", Khatian: "1201", Owner: "Shanti Rani Das" } },
  { id: "d-p522", parcelId: "p-522", ownerId: "usr-shanti", type: "title-deed", fileName: "khatian-522-homestead.pdf", mimeType: "application/pdf", sizeBytes: 382000, pageCount: 4, uploadedAt: "2026-09-02T10:00:00Z", uploadedById: "usr-shanti", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.02, extractedFields: { "Dag No": "BS-522", Khatian: "1202", Owner: "Shanti Rani Das", Area: "7 katha" } },
  { id: "d-p523", parcelId: "p-523", ownerId: "usr-shanti", type: "sale-deed", fileName: "dolil-523-pond.pdf", mimeType: "application/pdf", sizeBytes: 519000, pageCount: 5, uploadedAt: "2026-09-03T09:20:00Z", uploadedById: "usr-shanti", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.05, extractedFields: { "Dag No": "BS-523", Khatian: "1203", Owner: "Shanti Rani Das" } },
  { id: "d-p524", parcelId: "p-524", ownerId: "usr-shanti", type: "sale-deed", fileName: "dolil-524-commercial.pdf", mimeType: "application/pdf", sizeBytes: 950000, pageCount: 9, uploadedAt: "2026-09-04T08:45:00Z", uploadedById: "usr-shanti", ocrStatus: "processing", verificationStatus: "unverified" },
  // Extra dolils: Iqbal
  { id: "d-p531", parcelId: "p-531", ownerId: "usr-iqbal", type: "sale-deed", fileName: "dolil-531-warehouse.pdf", mimeType: "application/pdf", sizeBytes: 1100000, pageCount: 10, uploadedAt: "2026-09-05T08:00:00Z", uploadedById: "usr-iqbal", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.03, extractedFields: { "Dag No": "RS-531", Khatian: "1301", Owner: "Iqbal Enterprise", Area: "6 katha" } },
  { id: "d-p532", parcelId: "p-532", ownerId: "usr-iqbal", type: "sale-deed", fileName: "dolil-532-industrial.pdf", mimeType: "application/pdf", sizeBytes: 1350000, pageCount: 12, uploadedAt: "2026-09-06T09:15:00Z", uploadedById: "usr-iqbal", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.06, extractedFields: { "Dag No": "RS-532", Khatian: "1302", Owner: "Iqbal Enterprise" } },
  { id: "d-p533", parcelId: "p-533", ownerId: "usr-iqbal", type: "title-deed", fileName: "khatian-533-roadfront.pdf", mimeType: "application/pdf", sizeBytes: 820000, pageCount: 7, uploadedAt: "2026-09-07T11:00:00Z", uploadedById: "usr-iqbal", ocrStatus: "pending", verificationStatus: "unverified" },
  // Extra dolils: Legacy estate
  { id: "d-p541", parcelId: "p-541", ownerId: "usr-legacy-2", type: "title-deed", fileName: "khatian-541-adjoining.pdf", mimeType: "application/pdf", sizeBytes: 290000, pageCount: 3, uploadedAt: "2026-09-08T09:00:00Z", uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.02, extractedFields: { "Dag No": "RS-541", Khatian: "218", Owner: "Late Fazlul Haque" } },
  { id: "d-p542", parcelId: "p-542", ownerId: "usr-legacy-2", type: "title-deed", fileName: "khatian-542-paddy-estate.pdf", mimeType: "application/pdf", sizeBytes: 470000, pageCount: 5, uploadedAt: "2026-09-08T09:30:00Z", uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.01, extractedFields: { "Dag No": "CS-542", Khatian: "219", Owner: "Late Fazlul Haque", Area: "110 decimal" } },
  // Demo Citizens Documents
  { id: "d-d2-1", parcelId: "p-d2-1", ownerId: "usr-fatema", type: "sale-deed", fileName: "dolil-d2-1.pdf", mimeType: "application/pdf", sizeBytes: 520411, pageCount: 2, uploadedAt: "2026-08-01T10:00:00Z", uploadedById: "usr-fatema", ocrStatus: "extracted", verificationStatus: "verified" },
  { id: "d-d2-2", parcelId: "p-d2-2", ownerId: "usr-fatema", type: "sale-deed", fileName: "dolil-d2-2.pdf", mimeType: "application/pdf", sizeBytes: 520411, pageCount: 2, uploadedAt: "2026-08-01T10:00:00Z", uploadedById: "usr-fatema", ocrStatus: "extracted", verificationStatus: "verified" },
  { id: "d-d2-3", parcelId: "p-d2-3", ownerId: "usr-fatema", type: "sale-deed", fileName: "dolil-d2-3-pond.pdf", mimeType: "application/pdf", sizeBytes: 590000, pageCount: 5, uploadedAt: "2026-08-02T10:00:00Z", uploadedById: "usr-fatema", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.02, extractedFields: { "Dag No": "RS-603", Khatian: "813", Owner: "Fatema Begum" } },
  { id: "d-d2-4", parcelId: "p-d2-4", ownerId: "usr-fatema", type: "sale-deed", fileName: "dolil-d2-4-shed.pdf", mimeType: "application/pdf", sizeBytes: 620000, pageCount: 5, uploadedAt: "2026-08-03T11:00:00Z", uploadedById: "usr-fatema", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.03, extractedFields: { "Dag No": "RS-604", Khatian: "814", Owner: "Fatema Begum" } },

  { id: "d-d3-1", parcelId: "p-d3-1", ownerId: "usr-rashed", type: "sale-deed", fileName: "dolil-d3-1.pdf", mimeType: "application/pdf", sizeBytes: 520411, pageCount: 2, uploadedAt: "2026-08-01T10:00:00Z", uploadedById: "usr-rashed", ocrStatus: "extracted", verificationStatus: "verified" },
  { id: "d-d3-2", parcelId: "p-d3-2", ownerId: "usr-rashed", type: "sale-deed", fileName: "dolil-d3-2-paddy.pdf", mimeType: "application/pdf", sizeBytes: 742100, pageCount: 6, uploadedAt: "2026-08-05T09:00:00Z", uploadedById: "usr-rashed", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.02, extractedFields: { "Dag No": "RS-702", Khatian: "902", Owner: "Rashed Khan", Area: "65 decimal" } },
  { id: "d-d3-3", parcelId: "p-d3-3", ownerId: "usr-rashed", type: "sale-deed", fileName: "dolil-d3-3-homestead.pdf", mimeType: "application/pdf", sizeBytes: 685000, pageCount: 5, uploadedAt: "2026-08-06T10:15:00Z", uploadedById: "usr-rashed", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.03, extractedFields: { "Dag No": "RS-703", Khatian: "903", Owner: "Rashed Khan", Area: "8 katha" } },
  { id: "d-d3-4", parcelId: "p-d3-4", ownerId: "usr-rashed", type: "inheritance-affidavit", fileName: "warish-d3-4-orchard.pdf", mimeType: "application/pdf", sizeBytes: 390000, pageCount: 4, uploadedAt: "2026-08-07T08:30:00Z", uploadedById: "usr-rashed", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.01, extractedFields: { "Dag No": "RS-704", Khatian: "904", Owner: "Rashed Khan", Area: "85 decimal" } },
  { id: "d-d3-5", parcelId: "p-d3-5", ownerId: "usr-rashed", type: "sale-deed", fileName: "dolil-d3-5-shop.pdf", mimeType: "application/pdf", sizeBytes: 812000, pageCount: 7, uploadedAt: "2026-08-08T11:45:00Z", uploadedById: "usr-rashed", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.04, extractedFields: { "Dag No": "RS-705", Khatian: "905", Owner: "Rashed Khan", Area: "4 katha" } },

  { id: "d-d4-1", parcelId: "p-d4-1", ownerId: "usr-noor", type: "sale-deed", fileName: "dolil-d4-1.pdf", mimeType: "application/pdf", sizeBytes: 520411, pageCount: 2, uploadedAt: "2026-08-01T10:00:00Z", uploadedById: "usr-noor", ocrStatus: "extracted", verificationStatus: "verified" },
  { id: "d-d4-2", parcelId: "p-d4-2", ownerId: "usr-noor", type: "sale-deed", fileName: "dolil-d4-2-compound.pdf", mimeType: "application/pdf", sizeBytes: 610000, pageCount: 5, uploadedAt: "2026-08-04T09:30:00Z", uploadedById: "usr-noor", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.02, extractedFields: { "Dag No": "BS-302", Khatian: "1202", Owner: "Noor Jahan" } },
  { id: "d-d4-3", parcelId: "p-d4-3", ownerId: "usr-noor", type: "inheritance-affidavit", fileName: "warish-d4-3-crop.pdf", mimeType: "application/pdf", sizeBytes: 340000, pageCount: 3, uploadedAt: "2026-08-05T10:00:00Z", uploadedById: "usr-noor", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.01, extractedFields: { "Dag No": "BS-303", Khatian: "1203", Owner: "Noor Jahan" } },
  { id: "d-d4-4", parcelId: "p-d4-4", ownerId: "usr-noor", type: "sale-deed", fileName: "dolil-d4-4-commercial.pdf", mimeType: "application/pdf", sizeBytes: 780000, pageCount: 6, uploadedAt: "2026-08-06T11:15:00Z", uploadedById: "usr-noor", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.04, extractedFields: { "Dag No": "BS-304", Khatian: "1204", Owner: "Noor Jahan" } },

  { id: "d-d5-1", parcelId: "p-d5-1", ownerId: "usr-habib", type: "sale-deed", fileName: "dolil-d5-1.pdf", mimeType: "application/pdf", sizeBytes: 520411, pageCount: 2, uploadedAt: "2026-08-01T10:00:00Z", uploadedById: "usr-habib", ocrStatus: "extracted", verificationStatus: "verified" },
  { id: "d-d5-2", parcelId: "p-d5-2", ownerId: "usr-habib", type: "sale-deed", fileName: "dolil-d5-2.pdf", mimeType: "application/pdf", sizeBytes: 520411, pageCount: 2, uploadedAt: "2026-08-01T10:00:00Z", uploadedById: "usr-habib", ocrStatus: "extracted", verificationStatus: "verified" },
  { id: "d-d5-3", parcelId: "p-d5-3", ownerId: "usr-habib", type: "sale-deed", fileName: "dolil-d5-3-warehouse.pdf", mimeType: "application/pdf", sizeBytes: 920000, pageCount: 8, uploadedAt: "2026-08-07T09:45:00Z", uploadedById: "usr-habib", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.03, extractedFields: { "Dag No": "BS-403", Khatian: "1403", Owner: "Habib Molla" } },
  { id: "d-d5-4", parcelId: "p-d5-4", ownerId: "usr-habib", type: "sale-deed", fileName: "dolil-d5-4-homestead.pdf", mimeType: "application/pdf", sizeBytes: 810000, pageCount: 7, uploadedAt: "2026-08-08T10:30:00Z", uploadedById: "usr-habib", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.02, extractedFields: { "Dag No": "BS-404", Khatian: "1404", Owner: "Habib Molla" } },

];

// ---------------------------------------------------------------------------
// Disputes + timeline events
// ---------------------------------------------------------------------------
export const disputes: Dispute[] = [
  {
    id: "ds-417", caseNumber: "DSP-2026-00417", parcelId: "p-142", parcelDagNo: "CS-142/3",
    type: "boundary", status: "under-land-office-review", priority: "medium", filedById: "usr-ayesha", filedByName: "Ayesha Siddika",
    filedAt: "2026-07-15T10:30:00Z", updatedAt: "2026-07-21T09:00:00Z",
    description: "The adjoining landholder has cultivated roughly 3 metres past the eastern boundary of dag CS-142/3. Requesting a survey to confirm the recorded demarcation.",
    parties: [
      { name: "Ayesha Siddika", role: "claimant", userId: "usr-ayesha" },
      { name: "Md. Karim Uddin", role: "respondent", userId: "usr-karim" },
    ],
    assignedOfficerId: "usr-officer", evidenceDocumentIds: ["d-1"],
  },
  {
    id: "ds-402", caseNumber: "DSP-2026-00402", parcelId: "p-205", parcelDagNo: "BS-205",
    type: "encroachment", status: "under-land-office-review", priority: "high", filedById: "usr-shanti", filedByName: "Shanti Rani Das",
    filedAt: "2026-07-08T13:00:00Z", updatedAt: "2026-07-20T16:00:00Z",
    description: "An unauthorised structure has been raised on the north-west corner of the orchard. Requesting encroachment verification and removal.",
    parties: [{ name: "Shanti Rani Das", role: "claimant", userId: "usr-shanti" }, { name: "Unknown occupant", role: "respondent" }],
    assignedOfficerId: "usr-officer2", evidenceDocumentIds: ["d-5", "d-10"],
  },
  {
    id: "ds-388", caseNumber: "DSP-2026-00388", parcelId: "p-176", parcelDagNo: "CS-176",
    type: "fraud", status: "forwarded-to-settlement", priority: "high", filedById: "usr-karim", filedByName: "Md. Karim Uddin",
    filedAt: "2026-06-25T09:45:00Z", updatedAt: "2026-07-19T11:30:00Z",
    description: "Two conflicting sale deeds (dolil) presented for the same dag. Suspected forged signature on the second deed. Referred to Settlement Office.",
    parties: [{ name: "Md. Karim Uddin", role: "claimant", userId: "usr-karim" }, { name: "Sohel Rana", role: "respondent" }],
    assignedOfficerId: "usr-officer", assignedMediatorId: "usr-mediator", evidenceDocumentIds: ["d-6", "d-11"],
  },
  // Referred to mediation but not yet listed for hearing — this is what fills
  // the mediator's "to convene" board.
  {
    id: "ds-381", caseNumber: "DSP-2026-00381", parcelId: "p-092", parcelDagNo: "RS-92/4",
    type: "easement", status: "decided", priority: "medium", filedById: "usr-ayesha", filedByName: "Ayesha Siddika",
    filedAt: "2026-06-18T07:20:00Z", updatedAt: "2026-07-16T10:05:00Z",
    description: "Right of way across the northern strip of dag RS-92/4 blocked after the neighbouring owner raised a boundary wall.",
    parties: [{ name: "Ayesha Siddika", role: "claimant", userId: "usr-ayesha" }, { name: "Sohel Rana", role: "respondent" }],
    assignedMediatorId: "usr-mediator", evidenceDocumentIds: [], resolution: "The recorded access path was confirmed and reopened by agreement.",
  },
  {
    id: "ds-370", caseNumber: "DSP-2026-00370", parcelId: "p-311", parcelDagNo: "RS-311/2",
    type: "ownership", status: "decided", priority: "low", filedById: "usr-karim", filedByName: "Md. Karim Uddin",
    filedAt: "2026-05-30T10:00:00Z", updatedAt: "2026-06-20T14:00:00Z",
    description: "Clerical mismatch in the recorded owner name resolved after document verification.",
    parties: [{ name: "Md. Karim Uddin", role: "claimant", userId: "usr-karim" }],
    assignedOfficerId: "usr-officer", evidenceDocumentIds: ["d-7"], resolution: "Owner name corrected in the khatian after verification of khajna receipts and NID. No competing claim found.",
  },
  {
    id: "ds-355", caseNumber: "DSP-2026-00355", parcelId: "p-088", parcelDagNo: "RS-88",
    type: "inheritance", status: "submitted", priority: "medium", filedById: "usr-ayesha", filedByName: "Ayesha Siddika",
    filedAt: "2026-07-22T08:15:00Z", updatedAt: "2026-07-22T08:15:00Z",
    description: "Requesting formal recognition of the Faraiz inheritance share for dag RS-88 following the passing of the recorded owner.",
    parties: [{ name: "Ayesha Siddika", role: "claimant", userId: "usr-ayesha" }],
    evidenceDocumentIds: ["d-3"],
  },
  {
    id: "ds-340", caseNumber: "DSP-2026-00340", parcelId: "p-205", parcelDagNo: "BS-205",
    type: "boundary", status: "hearing-scheduled", priority: "medium", filedById: "usr-shanti", filedByName: "Shanti Rani Das",
    filedAt: "2026-06-12T09:00:00Z", updatedAt: "2026-07-18T10:00:00Z",
    description: "Boundary overlap between dag BS-205 and the adjacent khas (government) land line pending tribunal hearing.",
    parties: [{ name: "Shanti Rani Das", role: "claimant", userId: "usr-shanti" }, { name: "Upazila Land Office", role: "respondent" }],
    assignedMediatorId: "usr-mediator", hearingDate: "2026-07-30T05:30:00Z", evidenceDocumentIds: ["d-5"],
  },
  {
    id: "ds-430", caseNumber: "DSP-2026-00430", parcelId: "p-403", parcelDagNo: "RS-403",
    type: "boundary", status: "field-verified", priority: "high", filedById: "usr-ayesha", filedByName: "Ayesha Siddika",
    filedAt: "2026-09-06T09:00:00Z", updatedAt: "2026-09-07T08:30:00Z",
    description: "The field agent found a boundary occupation on the southern edge during measurement.",
    parties: [{ name: "Ayesha Siddika", role: "claimant", userId: "usr-ayesha" }, { name: "Adjacent occupier", role: "respondent" }],
    assignedOfficerId: "usr-officer", assignedAgentId: "usr-agent", evidenceDocumentIds: ["d-16"],
  },
];

export const disputeEvents: DisputeEvent[] = [
  { id: "de-1", disputeId: "ds-417", at: "2026-07-15T10:30:00Z", type: "filed", title: "Dispute filed", content: { code: "filed" }, description: "Boundary dispute submitted by Ayesha Siddika.", actorId: "usr-ayesha", actorName: "Ayesha Siddika" },
  { id: "de-2", disputeId: "ds-417", at: "2026-07-16T09:10:00Z", type: "assigned", title: "Assigned to Sub-Registrar", content: { code: "assigned", to: "Sub-Registrar" }, description: "Case routed to Nasrin Akter, Debidwar Upazila.", actorName: "System" },
  { id: "de-3", disputeId: "ds-417", at: "2026-07-17T14:00:00Z", type: "document-added", title: "Evidence added", content: { code: "evidence-added" }, description: "Khatian for dag CS-142/3 attached as evidence.", actorId: "usr-ayesha", actorName: "Ayesha Siddika" },
  { id: "de-4", disputeId: "ds-417", at: "2026-07-21T09:00:00Z", type: "status-change", title: "Moved to Under review", content: { code: "status-change", status: "under-land-office-review" }, description: "Officer began reviewing submitted records.", actorId: "usr-officer", actorName: "Nasrin Akter" },
  { id: "de-5", disputeId: "ds-388", at: "2026-06-25T09:45:00Z", type: "filed", title: "Dispute filed", content: { code: "filed" }, actorId: "usr-karim", actorName: "Md. Karim Uddin" },
  { id: "de-6", disputeId: "ds-388", at: "2026-07-02T11:00:00Z", type: "status-change", title: "Referred to mediation", content: { code: "status-change", status: "forwarded-to-settlement" }, actorName: "System" },
  { id: "de-7", disputeId: "ds-388", at: "2026-07-19T11:30:00Z", type: "hearing", title: "First hearing held", content: { code: "hearing-held", ordinal: 1 }, description: "Both parties presented deeds. Handwriting examination ordered.", actorId: "usr-mediator", actorName: "Shahida Khatun" },
];

// ---------------------------------------------------------------------------
// Mutations (namjari)
// ---------------------------------------------------------------------------
export const mutations: Mutation[] = [
  { id: "m-1192", mutationNumber: "MUT-2026-01192", parcelId: "p-088", parcelDagNo: "RS-88", type: "inheritance", status: "under-primary-verification", fromOwnerName: "Late Fazlul Haque", fromOwnerId: "usr-legacy-2", toOwnerId: "usr-ayesha", toOwnerName: "Ayesha Siddika", requestedById: "usr-ayesha", requestedAt: "2026-07-14T10:00:00Z", assignedOfficerId: "usr-officer", verificationStartedAt: "2026-07-15T09:00:00Z", verificationStartedById: "usr-officer", verificationNotes: "Warish affidavit and khatian are under officer review.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true, dagKhatianVerified: true, deedVerified: false, landRecordMatched: true, documentsPresent: true, khajnaReceiptVerified: true }, documentIds: ["d-3", "d-9"], objections: [], fee: { amount: 5400, currency: "BDT" }, createdAt: "2026-07-14T10:00:00Z", updatedAt: "2026-07-15T09:00:00Z" },
  { id: "m-1180", mutationNumber: "MUT-2026-01180", parcelId: "p-311", parcelDagNo: "RS-311/2", type: "sale", status: "complete", mutationKhatianNumber: "MK-2026-00001180", dcrPaidAt: "2026-06-30T10:00:00Z", fromOwnerName: "Md. Karim Uddin", fromOwnerId: "usr-karim", toOwnerId: "usr-iqbal", toOwnerName: "Iqbal Enterprise", requestedById: "usr-karim", requestedAt: "2026-06-10T10:00:00Z", assignedOfficerId: "usr-officer", verificationStartedAt: "2026-06-11T09:00:00Z", verificationStartedById: "usr-officer", verifiedAt: "2026-06-14T10:00:00Z", verifiedById: "usr-officer", verificationNotes: "Legacy deed record verified before the statutory notice.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true, dagKhatianVerified: true, deedVerified: true, landRecordMatched: true, documentsPresent: true, khajnaReceiptVerified: true }, objectionStartDate: "2026-06-15T00:00:00Z", objectionWindowEndsAt: "2026-06-29T00:00:00Z", documentIds: ["d-7"], objections: [], fee: { amount: 42000, currency: "BDT" }, approvedAt: "2026-06-30T10:00:00Z", approvedById: "usr-officer", approvalNote: "No objections were received during the notice period.", decidedAt: "2026-06-30T10:00:00Z", createdAt: "2026-06-10T10:00:00Z", updatedAt: "2026-06-30T10:00:00Z" },
  { id: "m-1200", mutationNumber: "MUT-2026-01200", parcelId: "p-142", parcelDagNo: "CS-142/3", type: "gift", status: "field-verification-complete", disputeId: "ds-417", fromOwnerName: "Ayesha Siddika", fromOwnerId: "usr-ayesha", toOwnerId: "usr-karim", toOwnerName: "Md. Karim Uddin", requestedById: "usr-ayesha", requestedAt: "2026-07-09T10:00:00Z", assignedOfficerId: "usr-officer", verificationStartedAt: "2026-07-10T09:00:00Z", verificationStartedById: "usr-officer", verifiedAt: "2026-07-12T11:00:00Z", verifiedById: "usr-officer", verificationNotes: "Deed, khatian, and parties verified.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true, dagKhatianVerified: true, deedVerified: true, landRecordMatched: true, documentsPresent: true, khajnaReceiptVerified: true }, objectionStartDate: "2026-07-13T00:00:00Z", objectionWindowEndsAt: "2026-07-27T00:00:00Z", documentIds: ["d-1", "d-2"], objections: [], createdAt: "2026-07-09T10:00:00Z", updatedAt: "2026-07-27T00:00:00Z" },
  { id: "m-1205", mutationNumber: "MUT-2026-01205", parcelId: "p-176", parcelDagNo: "CS-176", type: "sale", status: "field-investigation", fromOwnerName: "Md. Karim Uddin", fromOwnerId: "usr-karim", toOwnerId: "usr-ayesha", toOwnerName: "Ayesha Siddika", requestedById: "usr-karim", requestedAt: "2026-07-16T10:00:00Z", assignedOfficerId: "usr-officer2", verificationStartedAt: "2026-07-17T09:00:00Z", verificationStartedById: "usr-officer2", verifiedAt: "2026-07-18T10:00:00Z", verifiedById: "usr-officer2", verificationNotes: "Documents cleared for public notice pending the fraud objection.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true, dagKhatianVerified: true, deedVerified: true, landRecordMatched: true, documentsPresent: true, khajnaReceiptVerified: true }, objectionStartDate: "2026-07-18T12:00:00Z", documentIds: ["d-6"], objections: [{ id: "obj-1", by: "Md. Karim Uddin", at: "2026-07-19T09:00:00Z", reason: "Deed signature disputed — see fraud case DSP-2026-00388.", status: "open" }], objectionWindowEndsAt: "2026-07-31T00:00:00Z", createdAt: "2026-07-16T10:00:00Z", updatedAt: "2026-07-31T00:00:00Z" },
  { id: "m-1220", mutationNumber: "MUT-2026-01220", parcelId: "p-311", parcelDagNo: "RS-311/2", type: "sale", status: "rejected", fromOwnerName: "Iqbal Enterprise", fromOwnerId: "usr-iqbal", toOwnerId: "usr-ayesha", toOwnerName: "Ayesha Siddika", requestedById: "usr-karim", requestedAt: "2026-09-01T10:00:00Z", assignedOfficerId: "usr-officer", verificationStartedAt: "2026-09-02T09:00:00Z", verificationStartedById: "usr-officer", verifiedAt: "2026-09-03T10:00:00Z", verifiedById: "usr-officer", verificationNotes: "Current deed, khatian, and recipient identity verified for notice.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true, dagKhatianVerified: true, deedVerified: true, landRecordMatched: true, documentsPresent: true, khajnaReceiptVerified: true }, objectionStartDate: "2026-09-03T12:00:00Z", objectionWindowEndsAt: "2026-09-17T12:00:00Z", documentIds: ["d-7"], objections: [], rejectedAt: "2026-09-04T10:00:00Z", rejectedById: "usr-officer", rejectionReason: "Applicant is not the recorded owner or an authorised representative.", decidedAt: "2026-09-04T10:00:00Z", createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-04T10:00:00Z" },
  { id: "m-1210", mutationNumber: "MUT-2026-01210", parcelId: "p-092", parcelDagNo: "RS-92/4", type: "correction", status: "submitted", fromOwnerName: "Ayesha Siddika", fromOwnerId: "usr-ayesha", toOwnerId: "usr-ayesha", toOwnerName: "Ayesha Siddika", requestedById: "usr-ayesha", requestedAt: "2026-07-22T11:00:00Z", documentIds: ["d-8"], objections: [], createdAt: "2026-07-22T11:00:00Z", updatedAt: "2026-07-22T11:00:00Z" },
  { id: "m-1150", mutationNumber: "MUT-2026-01150", parcelId: "p-205", parcelDagNo: "BS-205", type: "partition", status: "rejected", fromOwnerName: "Shanti Rani Das", fromOwnerId: "usr-shanti", toOwnerName: "Shanti Rani Das + heirs", requestedById: "usr-shanti", requestedAt: "2026-05-02T10:00:00Z", assignedOfficerId: "usr-officer2", verificationStartedAt: "2026-05-05T09:00:00Z", verificationStartedById: "usr-officer2", verificationNotes: "Supporting partition schedule was incomplete.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: false, dagKhatianVerified: true, deedVerified: false, landRecordMatched: false, documentsPresent: false, khajnaReceiptVerified: false }, documentIds: [], objections: [], rejectedAt: "2026-05-20T10:00:00Z", rejectedById: "usr-officer2", rejectionReason: "Required heir consent and partition schedule were not supplied.", decidedAt: "2026-05-20T10:00:00Z", createdAt: "2026-05-02T10:00:00Z", updatedAt: "2026-05-20T10:00:00Z" },
  { id: "m-1230", mutationNumber: "MUT-2026-01230", parcelId: "p-402", parcelDagNo: "RS-402", type: "sale", status: "under-primary-verification", fromOwnerName: "Md. Karim Uddin", fromOwnerId: "usr-karim", toOwnerId: "usr-ayesha", toOwnerName: "Ayesha Siddika", requestedById: "usr-karim", requestedAt: "2026-09-05T09:00:00Z", assignedOfficerId: "usr-officer", verificationStartedAt: "2026-09-06T09:00:00Z", verificationStartedById: "usr-officer", verificationNotes: "Identity, deed, and khatian are being checked.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true, dagKhatianVerified: true, deedVerified: false, landRecordMatched: true, documentsPresent: true, khajnaReceiptVerified: false }, documentIds: ["d-15"], objections: [], fee: { amount: 9600, currency: "BDT" }, createdAt: "2026-09-05T09:00:00Z", updatedAt: "2026-09-06T09:00:00Z" },
  { id: "m-1231", mutationNumber: "MUT-2026-01231", parcelId: "p-405", parcelDagNo: "RS-405", type: "gift", status: "complete", mutationKhatianNumber: "MK-2026-00001231", dcrPaidAt: "2026-08-28T10:00:00Z", fromOwnerName: "Ayesha Siddika", fromOwnerId: "usr-ayesha", toOwnerId: "usr-karim", toOwnerName: "Md. Karim Uddin", requestedById: "usr-ayesha", requestedAt: "2026-08-01T09:00:00Z", assignedOfficerId: "usr-officer", verificationStartedAt: "2026-08-02T09:00:00Z", verificationStartedById: "usr-officer", verifiedAt: "2026-08-05T10:00:00Z", verifiedById: "usr-officer", verificationNotes: "Gift deed and both parties verified.", verificationChecklist: { applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true, dagKhatianVerified: true, deedVerified: true, landRecordMatched: true, documentsPresent: true, khajnaReceiptVerified: true }, documentIds: ["d-18"], objections: [], fee: { amount: 7200, currency: "BDT" }, approvedAt: "2026-08-27T10:00:00Z", approvedById: "usr-officer", approvalNote: "Verification complete and no objections received.", decidedAt: "2026-08-27T10:00:00Z", createdAt: "2026-08-01T09:00:00Z", updatedAt: "2026-08-28T10:00:00Z" },
];

// ---------------------------------------------------------------------------
// Service applications — paid land-tax rows are both receipts and the source
// used to derive each holding's paid-through year. This avoids maintaining a
// second tax status that could disagree with the collection register.
// ---------------------------------------------------------------------------
export const serviceApplications: ServiceApplication[] = [
  {
    id: "sa-tax-1", applicationNo: "LDT-2026-001000", serviceType: "land-tax", status: "approved",
    parcelId: "p-092", applicantId: "usr-ayesha", assignedOfficerId: "usr-officer",
    details: { assessmentYear: 2026, decimals: 8.25, arrears: 0, currentYearDue: 83, years: [{ year: 2026, assessed: 83, surcharge: 0, due: 83, isArrear: false }] },
    documentIds: [], feeAmount: 83, paymentMethod: "bkash", transactionId: "TXN-LDT092A",
    paidAt: "2026-09-10T06:30:00Z", submittedAt: "2026-09-10T06:30:00Z", decidedAt: "2026-09-10T06:30:00Z",
    createdAt: "2026-09-10T06:30:00Z", updatedAt: "2026-09-10T06:30:00Z",
  },
  {
    id: "sa-tax-2", applicationNo: "LDT-2026-001001", serviceType: "land-tax", status: "approved",
    parcelId: "p-311", applicantId: "usr-iqbal", assignedOfficerId: "usr-officer",
    details: { assessmentYear: 2026, decimals: 4.95, arrears: 446, currentYearDue: 124, years: [{ year: 2023, assessed: 124, surcharge: 37, due: 161, isArrear: true }, { year: 2024, assessed: 124, surcharge: 25, due: 149, isArrear: true }, { year: 2025, assessed: 124, surcharge: 12, due: 136, isArrear: true }, { year: 2026, assessed: 124, surcharge: 0, due: 124, isArrear: false }] },
    documentIds: [], feeAmount: 570, paymentMethod: "nagad", transactionId: "TXN-LDT311B",
    paidAt: "2026-09-12T08:15:00Z", submittedAt: "2026-09-12T08:15:00Z", decidedAt: "2026-09-12T08:15:00Z",
    createdAt: "2026-09-12T08:15:00Z", updatedAt: "2026-09-12T08:15:00Z",
  },
];
export const serviceApplicationEvents: ServiceApplicationEvent[] = [
  { id: "sae-tax-1", applicationId: "sa-tax-1", at: "2026-09-10T06:30:00Z", type: "payment-recorded", title: "Land development tax paid", actorId: "usr-officer", actorName: "Nasrin Akter" },
  { id: "sae-tax-2", applicationId: "sa-tax-2", at: "2026-09-12T08:15:00Z", type: "payment-recorded", title: "Land development tax paid", actorId: "usr-officer", actorName: "Nasrin Akter" },
];

// ---------------------------------------------------------------------------
// Field reports
// ---------------------------------------------------------------------------
export const fieldReports: FieldReport[] = [
  { id: "fr-1", parcelId: "p-205", parcelDagNo: "BS-205", disputeId: "ds-402", purpose: "encroachment-check", status: "assigned", assignedAgentId: "usr-agent", assignedAt: "2026-07-22T08:00:00Z", scheduledFor: "2026-07-24T04:00:00Z", addressHint: "NW corner, near canal road, Payalgacha", gpsCaptures: [], photos: [] },
  {
    id: "fr-2", parcelId: "p-142", parcelDagNo: "CS-142/3", disputeId: "ds-417", mutationId: "m-1200", purpose: "boundary-survey", status: "completed", assignedAgentId: "usr-agent", assignedAt: "2026-07-17T09:00:00Z", acceptedAt: "2026-07-17T09:30:00Z", scheduledFor: "2026-07-19T04:30:00Z", submittedAt: "2026-07-19T07:10:00Z", reviewedAt: "2026-07-19T08:00:00Z", reviewedById: "usr-officer", disputeFound: true, disputeDescription: "Boundary occupation reported.", addressHint: "Eastern edge, paddy field, Rajamehar",
    gpsCaptures: [
      { id: "g-1", point: { lat: 23.5494, lng: 90.9895 }, accuracyMeters: 3.2, capturedAt: "2026-07-19T05:00:00Z", label: "NE corner pillar" },
      { id: "g-2", point: { lat: 23.5486, lng: 90.9896 }, accuracyMeters: 4.1, capturedAt: "2026-07-19T05:12:00Z", label: "SE corner pillar" },
    ],
    photos: [{ id: "ph-1", url: "", caption: "Cultivated strip past the boundary pillar", capturedAt: "2026-07-19T05:05:00Z" }],
    notes: "NE corner pillar intact. Cultivation observed ~2.8m inside the recorded line on the eastern edge. Recommend re-demarcation.",
  },
  { id: "fr-3", parcelId: "p-176", parcelDagNo: "CS-176", purpose: "possession-verify", status: "in-progress", assignedAgentId: "usr-agent2", assignedAt: "2026-07-21T10:00:00Z", acceptedAt: "2026-07-21T10:15:00Z", scheduledFor: "2026-07-23T05:00:00Z", addressHint: "Hillfoot plot, Payalgacha", gpsCaptures: [], photos: [] },
  { id: "fr-4", parcelId: "p-088", parcelDagNo: "RS-88", mutationId: "m-1192", purpose: "measurement", status: "cancelled", assignedAgentId: "usr-agent", assignedAt: "2026-07-23T08:30:00Z", scheduledFor: "2026-07-25T04:30:00Z", addressHint: "Homestead plot, Rajamehar", gpsCaptures: [], photos: [], notes: "Cancelled fixture: keeps MUT-2026-01192 in the reassignment queue." },
  { id: "fr-5", parcelId: "p-403", parcelDagNo: "RS-403", disputeId: "ds-430", purpose: "boundary-survey", status: "completed", assignedAgentId: "usr-agent", assignedAt: "2026-09-06T10:00:00Z", acceptedAt: "2026-09-06T10:15:00Z", scheduledFor: "2026-09-07T05:00:00Z", submittedAt: "2026-09-07T08:30:00Z", addressHint: "Southern boundary, Rajamehar", gpsCaptures: [{ id: "g-403-1", point: { lat: 23.5537, lng: 90.9932 }, accuracyMeters: 3.6, capturedAt: "2026-09-07T06:10:00Z", label: "Occupied boundary corner" }], photos: [{ id: "ph-403-1", url: "", caption: "Boundary occupation found during field inspection", capturedAt: "2026-09-07T06:15:00Z" }], notes: "Recorded southern boundary is occupied by the adjacent holder; dispute opened for officer review." },
];

export const fieldSurveySessions: FieldSurveySession[] = [
  {
    id: "fs-2",
    fieldReportId: "fr-2",
    bhumiId: parcels.find((parcel) => parcel.id === "p-142")?.ulpin,
    assignedAgentId: "usr-agent",
    status: "completed",
    version: 1,
    startedAt: "2026-07-19T04:45:00Z",
    completedAt: "2026-07-19T07:10:00Z",
    points: [],
  },
  {
    id: "fs-3",
    fieldReportId: "fr-3",
    bhumiId: parcels.find((parcel) => parcel.id === "p-176")?.ulpin,
    assignedAgentId: "usr-agent2",
    status: "in-progress",
    version: 1,
    startedAt: "2026-07-23T05:05:00Z",
    points: [],
  },
];

export const fieldSurveyGpsPoints: FieldSurveyGpsPoint[] = [];
export const fieldSurveySyncReceipts: MockSyncReceipt[] = [];

// ---------------------------------------------------------------------------
// Hearings
// ---------------------------------------------------------------------------
export const hearings: Hearing[] = [
  { id: "h-1", caseNumber: "HRG-2026-0044", disputeId: "ds-388", parcelDagNo: "CS-176", mediatorId: "usr-mediator", status: "in-hearing", parties: ["Md. Karim Uddin", "Sohel Rana"], hearingDate: "2026-07-26T05:30:00Z", sessions: [{ id: "s-1", at: "2026-07-19T05:30:00Z", summary: "Both deeds presented. Handwriting examiner appointed; next session scheduled.", attendees: ["Md. Karim Uddin", "Sohel Rana", "Shahida Khatun"] }] },
  { id: "h-2", caseNumber: "HRG-2026-0039", disputeId: "ds-340", parcelDagNo: "BS-205", mediatorId: "usr-mediator", status: "scheduled", parties: ["Shanti Rani Das", "Upazila Land Office"], hearingDate: "2026-07-30T05:30:00Z", sessions: [] },
  { id: "h-3", caseNumber: "HRG-2026-0031", disputeId: "ds-370", parcelDagNo: "RS-311/2", mediatorId: "usr-mediator", status: "ruled", parties: ["Md. Karim Uddin"], sessions: [{ id: "s-2", at: "2026-06-15T05:30:00Z", summary: "Name correction upheld.", attendees: ["Md. Karim Uddin", "Shahida Khatun"] }], ruling: "Khatian to reflect the corrected owner name. Case closed.", ruledAt: "2026-06-18T05:30:00Z" },
];

// ---------------------------------------------------------------------------
// Policies (system configuration)
// ---------------------------------------------------------------------------
// The land-tax figures are demonstration values, not a published rate
// schedule — they live here (and in the Policy row on the real API) precisely
// so an operator sets their own district's. See assessLandTax().
export const policies = {
  mutationFeeBdt: 5400,
  objectionWindowDays: 15,
  fraudScoreThreshold: 0.5,
  landTaxRatePerDecimalBdt: {
    agricultural: 2,
    residential: 10,
    commercial: 25,
    industrial: 30,
    mixed: 15,
    vacant: 5,
  },
  landTaxAgriculturalExemptionDecimals: 825,
  landTaxArrearSurchargePercent: 10,
  landTaxMaxArrearYears: 3,
  landAdminCertifiedCopyFeeBdt: 200,
  landAdminCorrectionFeeBdt: 500,
  revenueCaseFilingFeeBdt: 300,
  leaseSettlementAgriculturalFeeBdt: 300,
  leaseSettlementNonAgriculturalFeeBdt: 1200,
  leaseSettlementApplicationFeeBdt: 20,
};

// ---------------------------------------------------------------------------
// Notifications (citizen inbox is richest for the demo)
// ---------------------------------------------------------------------------
export const notifications: AppNotification[] = [
  { id: "n-1", userId: "usr-ayesha", at: "2026-07-21T09:05:00Z", severity: "info", title: "Dispute moved to Under review", body: "Case DSP-2026-00417 is now being reviewed by the Sub-Registrar.", content: { code: "dispute-status", caseNumber: "DSP-2026-00417", status: "under-land-office-review" }, read: false, href: "/disputes/ds-417" },
  { id: "n-2", userId: "usr-ayesha", at: "2026-07-18T11:25:00Z", severity: "success", title: "Document verified", body: "Your khatian for dag CS-142/3 passed verification.", content: { code: "document-verified", dagNo: "CS-142/3" }, read: false, href: "/documents" },
  { id: "n-3", userId: "usr-ayesha", at: "2026-07-22T08:20:00Z", severity: "critical", title: "Action needed: affidavit unclear", body: "The warish (inheritance) affidavit for dag RS-88 needs a clearer re-scan to continue OCR.", content: { code: "document-unclear", dagNo: "RS-88" }, read: false, href: "/documents" },
  { id: "n-4", userId: "usr-ayesha", at: "2026-07-20T16:10:00Z", severity: "info", title: "Field survey scheduled", body: "A boundary survey for dag CS-142/3 has been scheduled.", content: { code: "survey-scheduled", dagNo: "CS-142/3" }, read: true, href: "/disputes/ds-417" },
  { id: "n-5", userId: "usr-ayesha", at: "2026-07-14T10:05:00Z", severity: "info", title: "Namjari in verification", body: "Inheritance mutation MUT-2026-01192 for dag RS-88 is being verified.", content: { code: "mutation-verification", mutationNumber: "MUT-2026-01192", dagNo: "RS-88" }, read: true, href: "/mutations?mutation=m-1192" },
  { id: "n-6", userId: "usr-ayesha", at: "2026-07-10T08:05:00Z", severity: "success", title: "Welcome to VhumiShetu", body: "Your account is active. You can now search records and track disputes.", content: { code: "welcome" }, read: true },
  { id: "n-7", userId: "usr-officer", at: "2026-07-21T09:02:00Z", severity: "warning", title: "New dispute assigned", body: "DSP-2026-00417 requires review.", content: { code: "dispute-assigned", caseNumber: "DSP-2026-00417" }, read: false, href: "/disputes" },
];

// ---------------------------------------------------------------------------
// Assistant (citizen help chatbot) — one running conversation per user,
// simulated with keyword matching in the handler since there is no real
// model to call in mock mode. See apps/api/src/assistant for the real one.
// ---------------------------------------------------------------------------
export interface AssistantMessageMock {
  id: string;
  userId: string;
  role: "user" | "model";
  content: string;
  createdAt: string;
}

export const assistantMessages: AssistantMessageMock[] = [];



// ---------------------------------------------------------------------------
// Complaints & grievances — one open and one resolved for Ayesha. Every
// complaint is reviewed in the admin portal, never by the land office.
// ---------------------------------------------------------------------------
export const grievances: Grievance[] = [
  {
    id: "grv-1", caseNumber: "GRV-2026-01000", category: "delay", status: "under-review",
    description: "My mutation application has been under primary verification for over six weeks without any update.",
    filedById: "usr-ayesha", filedByName: "Ayesha Siddika", escalatedToId: "usr-admin",
    slaDeadline: "2026-09-25T09:00:00Z", createdAt: "2026-09-18T09:00:00Z", updatedAt: "2026-09-19T10:00:00Z",
  },
  {
    id: "grv-2", caseNumber: "GRV-2026-01001", category: "technical", status: "resolved",
    description: "The land tax receipt download failed twice with an error after payment went through.",
    filedById: "usr-ayesha", filedByName: "Ayesha Siddika", escalatedToId: "usr-admin",
    resolutionNote: "The receipt service was restored and your receipt has been reissued.",
    slaDeadline: "2026-09-10T08:00:00Z", resolvedAt: "2026-09-06T12:00:00Z",
    createdAt: "2026-09-03T08:00:00Z", updatedAt: "2026-09-06T12:00:00Z",
  },
];

export const grievanceEvents: GrievanceEvent[] = [
  { id: "ge-1", grievanceId: "grv-1", at: "2026-09-18T09:00:00Z", type: "filed", title: "Grievance filed", actorId: "usr-ayesha", actorName: "Ayesha Siddika" },
  { id: "ge-2", grievanceId: "grv-1", at: "2026-09-19T10:00:00Z", type: "status-change", title: "Status updated", description: "Status changed to under-review", actorId: "usr-admin", actorName: "Registry Administrator" },
  { id: "ge-3", grievanceId: "grv-2", at: "2026-09-03T08:00:00Z", type: "filed", title: "Grievance filed", actorId: "usr-ayesha", actorName: "Ayesha Siddika" },
  { id: "ge-4", grievanceId: "grv-2", at: "2026-09-06T12:00:00Z", type: "resolved", title: "Grievance resolved", description: "The receipt service was restored and your receipt has been reissued.", actorId: "usr-admin", actorName: "Registry Administrator" },
];

// ---------------------------------------------------------------------------
// Audit ledger seed (hashes are computed by the handler to form the chain)
// ---------------------------------------------------------------------------
export const auditSeed: Omit<AuditEvent, "prevHash" | "hash">[] = [
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


