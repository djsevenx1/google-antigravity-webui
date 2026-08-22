const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf-8');

// First, find the real modelsQuota map logic around line 620
code = code.replace(
`      if (apiModels[m]?.quotaInfo) qInfo = apiModels[m].quotaInfo;
      else if (apiModels[baseId]?.quotaInfo) qInfo = apiModels[baseId].quotaInfo;
      else if (m.includes('gemini') && m.includes('flash') && apiModels['gemini-2.5-flash']?.quotaInfo) {
        qInfo = apiModels['gemini-2.5-flash'].quotaInfo;
      } else if (m.includes('gemini') && m.includes('pro') && apiModels['gemini-2.5-pro']?.quotaInfo) {
        qInfo = apiModels['gemini-2.5-pro'].quotaInfo;
      }`,
`      if (apiModels[m]?.quotaInfo) qInfo = apiModels[m].quotaInfo;
      else if (apiModels[baseId]?.quotaInfo) qInfo = apiModels[baseId].quotaInfo;
      else if (m.includes('gemini') && m.includes('flash') && apiModels['gemini-3-flash']?.quotaInfo) {
        qInfo = apiModels['gemini-3-flash'].quotaInfo;
      } else if (m.includes('gemini') && m.includes('pro') && apiModels['gemini-3-pro-high']?.quotaInfo) {
        qInfo = apiModels['gemini-3-pro-high'].quotaInfo;
      } else if (m.includes('claude') && m.includes('sonnet') && apiModels['claude-sonnet-4-5']?.quotaInfo) {
        qInfo = apiModels['claude-sonnet-4-5'].quotaInfo;
      } else if (m.includes('claude') && m.includes('opus') && apiModels['claude-opus-4-5-thinking']?.quotaInfo) {
        qInfo = apiModels['claude-opus-4-5-thinking'].quotaInfo;
      }`
);

// Second, remove the usage_debug route
const debugStart = code.indexOf("app.get('/api/usage_debug'");
if (debugStart !== -1) {
  const nextAppUse = code.indexOf("app.use('/api', (req, res, next)", debugStart);
  if (nextAppUse !== -1) {
    code = code.slice(0, debugStart) + code.slice(nextAppUse);
  }
}

fs.writeFileSync('server.js', code);
