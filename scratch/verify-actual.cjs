const fs = require('fs');
const path = require('path');
const os = require('os');

async function main() {
  const tokenPaths = [
    path.join(os.homedir(), '.gemini', 'antigravity-cli', 'antigravity-oauth-token'),
    '/vol5/@apphome/claude code/.gemini/antigravity-cli/antigravity-oauth-token'
  ];
  let token = null;
  for (const tp of tokenPaths) {
    if (fs.existsSync(tp)) {
      const raw = JSON.parse(fs.readFileSync(tp, 'utf-8'));
      token = raw?.token?.access_token;
      if (token) break;
    }
  }
  
  const res = await fetch('https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'antigravity/0.2.0'
    },
    body: JSON.stringify({})
  });
  
  const apiData = await res.json();
  const apiModels = apiData.models || {};
  
  const rawModelIds = [
    'gemini-3.7-flash-high',
    'gemini-3.1-pro-high',
    'claude-sonnet-4-6',
    'claude-opus-4-6-thinking'
  ];

  const results = rawModelIds.map((m) => {
    let qInfo = null;
    const baseId = m.replace(/-(low|medium|high)$/i, '');
    
    if (apiModels[m]?.quotaInfo) qInfo = apiModels[m].quotaInfo;
    else if (apiModels[baseId]?.quotaInfo) qInfo = apiModels[baseId].quotaInfo;
    else if (m.includes('gemini') && m.includes('flash') && apiModels['gemini-3.7-flash-high']?.quotaInfo) {
      qInfo = apiModels['gemini-3.7-flash-high'].quotaInfo;
    } else if (m.includes('gemini') && m.includes('pro') && apiModels['gemini-3.1-pro-high']?.quotaInfo) {
      qInfo = apiModels['gemini-3.1-pro-high'].quotaInfo;
    } else if (m.includes('claude') && m.includes('sonnet') && apiModels['claude-sonnet-4-6']?.quotaInfo) {
      qInfo = apiModels['claude-sonnet-4-6'].quotaInfo;
    } else if (m.includes('claude') && m.includes('opus') && apiModels['claude-opus-4-6-thinking']?.quotaInfo) {
      qInfo = apiModels['claude-opus-4-6-thinking'].quotaInfo;
    }
    
    let percent = 88; // Default mock fallback
    let resetTime = null;
    if (qInfo) {
      const fraction = qInfo.remainingFraction ?? 0;
      percent = parseFloat((fraction * 100).toFixed(2));
      if (qInfo.resetTime) {
        resetTime = qInfo.resetTime;
      }
    }
    return { model: m, percent, resetTime };
  });

  console.log("Calculated Quota Results:", JSON.stringify(results, null, 2));
}

main();
