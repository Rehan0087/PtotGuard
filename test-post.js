const { sign } = require('./node_modules/jsonwebtoken');
const { readFileSync } = require('fs');
const env = readFileSync('apps/api/.env', 'utf-8');
const secretMatch = env.match(/AUTH_TOKEN_SECRET=\"([^\"]+)\"/);
const secret = secretMatch[1];
const token = sign({ sub: 'citizen-demo', role: 'citizen', type: 'access' }, secret, { expiresIn: '1h' });
console.log('Generated token:', token);
fetch('http://localhost:3001/api/community/posts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ title: 'Test Post', content: 'This is a test post from script' })
}).then(async r => {
  console.log('Status:', r.status);
  console.log('Body:', await r.text());
}).catch(console.error);
