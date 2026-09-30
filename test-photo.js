const fetch = require('node-fetch');

async function test() {
  try {
    // get a valid report
    const res1 = await fetch('http://localhost:3000/api/field-reports?status=in-progress', {
      headers: { cookie: 'access_token=... wait, how do I auth?' }
    });
  } catch (err) {
    console.error(err);
  }
}
test();
