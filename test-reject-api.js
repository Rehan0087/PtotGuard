const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/service-applications/1/decision',
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log("Status:", res.statusCode, "Body:", data));
});
req.write(JSON.stringify({ decision: 'reject' }));
req.end();
