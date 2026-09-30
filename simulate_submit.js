const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgres://postgres:plotguard@localhost:55432/plotguard'
  });
  await client.connect();

  const reportId = 'fr-b6f4888f-2729-477a-a69a-d34a8e0556df';
  // Simulate status="in-progress" for the report so we can update it
  await client.query('UPDATE field_reports SET status=$1 WHERE id=$2', ['in-progress', reportId]);

  // Fetch report
  const res = await client.query('SELECT * FROM field_reports WHERE id=$1', [reportId]);
  const report = res.rows[0];

  const mutationRes = await client.query('SELECT * FROM mutations WHERE id=$1', [report.mutationId]);
  const mutation = mutationRes.rows[0];
  console.log("Mutation before:", mutation.id, mutation.status, mutation.updatedAt);

  // simulate updateMany
  const updateRes = await client.query(
    'UPDATE mutations SET status=$1 WHERE id=$2 AND status=$3 AND "updatedAt"=$4 RETURNING *',
    ['field-verification-complete', mutation.id, 'field-investigation', mutation.updatedAt]
  );

  console.log("Updated rows:", updateRes.rowCount);

  await client.end();
}

main().catch(console.error);
