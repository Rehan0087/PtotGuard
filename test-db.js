const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:plotguard@localhost:55432/plotguard?schema=public' });
async function run() {
  await client.connect();
  const res = await client.query('SELECT id, status, "dagNo" FROM "khas_land_plots"');
  console.log('Plots:', res.rows);
  const res2 = await client.query('SELECT id, status, "khasPlotId" FROM "ServiceApplication" WHERE "serviceType" = \'lease-settlement\'');
  console.log('Apps:', res2.rows);
  await client.end();
}
run().catch(console.error);
