const http = require('http');

const data = JSON.stringify({
  photo: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", caption: "Test" }
});

const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/field-reports/fr-3/media',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    // Auth token needed! Let's get the token. 
    // We can't easily get the auth token for the field agent.
  }
});
