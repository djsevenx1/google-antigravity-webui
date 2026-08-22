const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf-8');

code = code.replace(
  "const geminiProModel = modelsQuota.find(m => m.id === 'gemini-3.1-pro-high' || m.id === 'gemini-3.7-flash-high');",
  "const geminiProModel = modelsQuota.find(m => m.id === 'gemini-3.1-pro-high') || modelsQuota.find(m => m.id === 'gemini-3.7-flash-high');"
);

fs.writeFileSync('server.js', code);
console.log("Patched find priority!");
