const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf-8');

const target = `      if (apiModels[m]?.quotaInfo) qInfo = apiModels[m].quotaInfo;
      else if (apiModels[baseId]?.quotaInfo) qInfo = apiModels[baseId].quotaInfo;
      else if (m.includes('gemini') && m.includes('flash') && apiModels['gemini-3-flash']?.quotaInfo) {
        qInfo = apiModels['gemini-3-flash'].quotaInfo;
      } else if (m.includes('gemini') && m.includes('pro') && apiModels['gemini-3-pro-high']?.quotaInfo) {
        qInfo = apiModels['gemini-3-pro-high'].quotaInfo;
      } else if (m.includes('claude') && m.includes('sonnet') && apiModels['claude-sonnet-4-5']?.quotaInfo) {
        qInfo = apiModels['claude-sonnet-4-5'].quotaInfo;
      } else if (m.includes('claude') && m.includes('opus') && apiModels['claude-opus-4-5-thinking']?.quotaInfo) {
        qInfo = apiModels['claude-opus-4-5-thinking'].quotaInfo;
      }`;

const replacement = `      if (apiModels[m]?.quotaInfo) qInfo = apiModels[m].quotaInfo;
      else if (apiModels[baseId]?.quotaInfo) qInfo = apiModels[baseId].quotaInfo;
      else if (m.includes('gemini') && m.includes('flash') && apiModels['gemini-3.7-flash-high']?.quotaInfo) {
        qInfo = apiModels['gemini-3.7-flash-high'].quotaInfo;
      } else if (m.includes('gemini') && m.includes('pro') && apiModels['gemini-3.1-pro-high']?.quotaInfo) {
        qInfo = apiModels['gemini-3.1-pro-high'].quotaInfo;
      } else if (m.includes('claude') && m.includes('sonnet') && apiModels['claude-sonnet-4-6']?.quotaInfo) {
        qInfo = apiModels['claude-sonnet-4-6'].quotaInfo;
      } else if (m.includes('claude') && m.includes('opus') && apiModels['claude-opus-4-6-thinking']?.quotaInfo) {
        qInfo = apiModels['claude-opus-4-6-thinking'].quotaInfo;
      }`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.js', code);
  console.log("Reverted mappings back to web UI context!");
}
