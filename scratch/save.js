const fs = require('fs');
const path = require('path');
const os = require('os');

async function test() {
  const tokenPaths = [
    path.join(os.homedir(), '.gemini', 'antigravity-cli', 'antigravity-oauth-token'),
    '/vol5/@apphome/claude code/.gemini/antigravity-cli/antigravity-oauth-token'
  ];
  let token = null;
  let raw = null;
  for (const tp of tokenPaths) {
    if (fs.existsSync(tp)) {
      raw = JSON.parse(fs.readFileSync(tp, 'utf-8'));
      token = raw?.token?.access_token;
      if (token) break;
    }
  }
  
  if (!token) {
    console.log("No token found");
    return;
  }
  
  const ep = 'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels';
  console.log("Fetching...", ep);
  const projectId = raw?.projectId || "";
  const bodyPayload = projectId ? { project: projectId } : {};
  
  const res = await fetch(ep, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'antigravity/0.2.0'
    },
    body: JSON.stringify(bodyPayload)
  });
  if (res.ok) {
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log("Error:", res.status, await res.text());
  }
}
test();
