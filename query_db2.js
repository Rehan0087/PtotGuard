const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:plotguard@localhost:55432/plotguard?schema=public' });
async function test() {
  const mRes = await pool.query(`SELECT "disputeId" FROM mutations WHERE "mutationNumber" = 'MUT-2026-01323'`);
  console.log("disputeId:", mRes.rows[0].disputeId);
  pool.end();
}
test();
