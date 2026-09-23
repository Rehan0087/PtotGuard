import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

async function main() {
  await prisma.khasLandPlot.deleteMany({});
  await prisma.khasLandPlot.createMany({
    data: [
      { id: "klp-1", mouza: "Rajamehar", upazila: "Debidwar", district: "Cumilla", dagNo: "110", landUse: "agricultural", areaDecimals: 50, centroidLat: 23.550, centroidLng: 90.990, boundaryGeoJson: square({ lat: 23.550, lng: 90.990 }), status: "available" },
      { id: "klp-2", mouza: "Rajamehar", upazila: "Debidwar", district: "Cumilla", dagNo: "115", landUse: "non-agricultural", areaDecimals: 12, centroidLat: 23.552, centroidLng: 90.992, boundaryGeoJson: square({ lat: 23.552, lng: 90.992 }), status: "available" },
      { id: "klp-3", mouza: "Payalgacha", upazila: "Barura", district: "Cumilla", dagNo: "220", landUse: "agricultural", areaDecimals: 120, centroidLat: 23.360, centroidLng: 91.030, boundaryGeoJson: square({ lat: 23.360, lng: 91.030 }), status: "available" },
      { id: "klp-4", mouza: "Payalgacha", upazila: "Barura", district: "Cumilla", dagNo: "225", landUse: "non-agricultural", areaDecimals: 8, centroidLat: 23.362, centroidLng: 91.032, boundaryGeoJson: square({ lat: 23.362, lng: 91.032 }), status: "reserved" },
      { id: "klp-5", mouza: "Debidwar", upazila: "Debidwar", district: "Cumilla", dagNo: "45", landUse: "non-agricultural", areaDecimals: 5, centroidLat: 23.555, centroidLng: 90.985, boundaryGeoJson: square({ lat: 23.555, lng: 90.985 }), status: "leased" },
      // New plots added
      { id: "klp-6", mouza: "Rajamehar", upazila: "Debidwar", district: "Cumilla", dagNo: "116", landUse: "agricultural", areaDecimals: 65, centroidLat: 23.553, centroidLng: 90.993, boundaryGeoJson: square({ lat: 23.553, lng: 90.993 }), status: "available" },
      { id: "klp-7", mouza: "Dhamti", upazila: "Debidwar", district: "Cumilla", dagNo: "502", landUse: "agricultural", areaDecimals: 40, centroidLat: 23.560, centroidLng: 91.010, boundaryGeoJson: square({ lat: 23.560, lng: 91.010 }), status: "available" },
      { id: "klp-8", mouza: "Dhamti", upazila: "Debidwar", district: "Cumilla", dagNo: "505", landUse: "non-agricultural", areaDecimals: 15, centroidLat: 23.562, centroidLng: 91.012, boundaryGeoJson: square({ lat: 23.562, lng: 91.012 }), status: "available" },
      { id: "klp-9", mouza: "Barkamta", upazila: "Debidwar", district: "Cumilla", dagNo: "301", landUse: "agricultural", areaDecimals: 110, centroidLat: 23.540, centroidLng: 90.970, boundaryGeoJson: square({ lat: 23.540, lng: 90.970 }), status: "available" },
      { id: "klp-10", mouza: "Barkamta", upazila: "Debidwar", district: "Cumilla", dagNo: "305", landUse: "non-agricultural", areaDecimals: 20, centroidLat: 23.542, centroidLng: 90.972, boundaryGeoJson: square({ lat: 23.542, lng: 90.972 }), status: "available" },
      { id: "klp-11", mouza: "Payalgacha", upazila: "Barura", district: "Cumilla", dagNo: "228", landUse: "agricultural", areaDecimals: 85, centroidLat: 23.365, centroidLng: 91.035, boundaryGeoJson: square({ lat: 23.365, lng: 91.035 }), status: "available" },
    ] as any[]
  });
  console.log("Khas land plots seeded");
}

main().catch(console.error);
