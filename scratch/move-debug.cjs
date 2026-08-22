const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf-8');

const debugRoute = `
app.get('/api/usage_debug', async (req, res) => {
  const cliInstalled = cliAvailable();
  const cliAuthed = cliInstalled ? await cliAuthenticated() : false;
  
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(path.join(cliConfigDir(), 'antigravity-oauth-token'), 'utf-8')); } catch(e) {}
  const tierData = parseGoogleAccountTier(cachedGoogleProfile?.liveTierInfo, raw);
  
  const rawModelIds = [
    'gemini-3.7-flash-high', 'gemini-3.1-pro-high', 'claude-sonnet-4-6'
  ];
  const modelsQuota = rawModelIds.map((m) => {
    const meta = getModelMetadata(m, tierData);
    if (cachedGoogleProfile?.liveModelsQuota) {
      let qInfo = null;
      const baseId = m.replace(/-(low|medium|high)$/i, '');
      const apiModels = cachedGoogleProfile.liveModelsQuota;
      
      if (apiModels[m]?.quotaInfo) qInfo = apiModels[m].quotaInfo;
      else if (apiModels[baseId]?.quotaInfo) qInfo = apiModels[baseId].quotaInfo;
      else if (m.includes('gemini') && m.includes('flash') && apiModels['gemini-2.5-flash']?.quotaInfo) {
        qInfo = apiModels['gemini-2.5-flash'].quotaInfo;
      } else if (m.includes('gemini') && m.includes('pro') && apiModels['gemini-2.5-pro']?.quotaInfo) {
        qInfo = apiModels['gemini-2.5-pro'].quotaInfo;
      }
      
      if (qInfo) {
        if (qInfo.remainingFraction !== undefined) {
          meta.percent = parseFloat((qInfo.remainingFraction * 100).toFixed(2));
        }
        if (qInfo.resetTime) {
          meta.resetTime = qInfo.resetTime;
        }
      }
    }
    return meta;
  });
  
  res.json({ modelsQuota, cachedGoogleProfile });
});
`;

// Remove it from the current location
code = code.replace(debugRoute.trim(), '');

// Insert it before app.use('/api'
code = code.replace("app.use('/api', (req, res, next) => {", debugRoute.trim() + "\n\napp.use('/api', (req, res, next) => {");

fs.writeFileSync('server.js', code);
