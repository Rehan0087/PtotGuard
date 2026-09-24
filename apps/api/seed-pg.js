const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:plotguard@localhost:55432/plotguard?schema=public' });
async function run() {
  await client.connect();
  const now = new Date().toISOString();
  const q = `INSERT INTO "khas_land_plots" (id, mouza, upazila, district, "dagNo", "landUse", "areaDecimals", "centroidLat", "centroidLng", "boundaryGeoJson", status, "unitPricePerYear", "createdAt", "updatedAt") VALUES 
  ('klp-1', 'Rajamehar', 'Debidwar', 'Cumilla', '110', 'agricultural', 50, 23.550, 90.990, '{}', 'available', 50, '${now}', '${now}'),
  ('klp-2', 'Rajamehar', 'Debidwar', 'Cumilla', '115', 'non-agricultural', 12, 23.552, 90.992, '{}', 'available', 100, '${now}', '${now}'),
  ('klp-3', 'Payalgacha', 'Barura', 'Cumilla', '220', 'agricultural', 120, 23.360, 91.030, '{}', 'available', 60, '${now}', '${now}'),
  ('klp-4', 'Payalgacha', 'Barura', 'Cumilla', '225', 'non-agricultural', 8, 23.362, 91.032, '{}', 'available', 120, '${now}', '${now}'),
  ('klp-5', 'Debidwar', 'Debidwar', 'Cumilla', '45', 'non-agricultural', 5, 23.555, 90.985, '{}', 'available', 150, '${now}', '${now}'),
  ('klp-6', 'Debidwar', 'Debidwar', 'Cumilla', '48', 'agricultural', 40, 23.556, 90.986, '{}', 'available', 50, '${now}', '${now}'),
  ('klp-7', 'Payalgacha', 'Barura', 'Cumilla', '230', 'non-agricultural', 15, 23.364, 91.034, '{}', 'available', 110, '${now}', '${now}')
  ON CONFLICT (id) DO UPDATE SET status = 'available', "unitPricePerYear" = EXCLUDED."unitPricePerYear", "updatedAt" = EXCLUDED."updatedAt";`;
  await client.query(q);
  console.log('Done');
  await client.end();
}
run().catch(console.error);
