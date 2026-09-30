const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgres://postgres:plotguard@localhost:55432/plotguard'
  });
  await client.connect();

  const mutations = await client.query('SELECT * FROM "mutations"');
  console.log('Mutations:', mutations.rows.map(m => ({ id: m.id, status: m.status })));
  
  const fieldReports = await client.query('SELECT * FROM "field_reports"');
  console.log('FieldReports:', fieldReports.rows.map(r => ({ id: r.id, mutationId: r.mutationId, status: r.status, disputeFound: r.disputeFound })));

  await client.end();
}

main().catch(console.error);
