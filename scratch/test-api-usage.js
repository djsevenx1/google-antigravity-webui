const fetch = require('node-fetch'); // wait, fetch is built-in in Node 18+

async function test() {
  const req = await fetch('http://127.0.0.1:3100/api/status');
  console.log("Status:", req.status);
}
test();
