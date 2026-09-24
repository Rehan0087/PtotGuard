require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { execSync } = require('child_process');
const { createHmac } = require('crypto');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

function issueToken(id, role) {
  const encode = (val) => Buffer.from(JSON.stringify(val)).toString("base64url");
  const sign = (h, p) => createHmac("sha256", process.env.AUTH_TOKEN_SECRET).update(`${h}.${p}`).digest("base64url");
  
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ sub: id, role, type: 'access', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 3600 });
  return `${header}.${payload}.${sign(header, payload)}`;
}

async function run() {
  const plot = await prisma.khasLandPlot.findFirst({ where: { status: 'available' } });
  if (!plot) { console.log("No available plot"); return; }
  
  const app = await prisma.serviceApplication.create({
    data: {
      id: 'sa-test-msg',
      applicationNo: 'LSE-MSG',
      serviceType: 'lease-settlement',
      status: 'submitted',
      applicantId: 'usr-ayesha',
      khasPlotId: plot.id,
      details: {
        landUse: plot.landUse,
        locationDescription: 'test',
        areaDecimals: plot.areaDecimals,
        termYears: 5,
        purpose: 'test',
        leaseFeeAmount: 50
      }
    }
  });
  
  const token = issueToken('usr-officer', 'land-office');
  
  console.log(`Testing rejection for app ${app.id}`);
  const cmd = `curl -s -X PATCH http://localhost:3001/api/service-applications/${app.id}/decision -H "Content-Type: application/json" -H "Authorization: Bearer ${token}" -d '{"decision":"reject", "decisionMessage":"test message"}'`;
  const out = execSync(cmd, { encoding: 'utf-8' });
  console.log("Response:", out);
  
  await prisma.serviceApplication.delete({ where: { id: app.id } }).catch(() => {});
}
run().catch(console.error).finally(() => prisma.$disconnect());
