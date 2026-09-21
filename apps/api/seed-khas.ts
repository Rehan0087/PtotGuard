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
    ] as any[]
  });
  console.log("Khas land plots seeded");
}

main().catch(console.error);
