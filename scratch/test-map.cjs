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

  const ep = 'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels';
  const res = await fetch(ep, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'antigravity/0.2.0'
    },
    body: JSON.stringify({})
  });
  const data = await res.json();
  const apiModels = data.models || {};

  const rawModelIds = [
    'gemini-3.7-flash-high',
    'gemini-3.1-pro-high',
    'claude-sonnet-4-6',
    'claude-opus-4-6-thinking'
  ];

  const results = rawModelIds.map((m) => {
    const meta = { id: m, percent: 88 };
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

    if (qInfo) {
      const fraction = qInfo.remainingFraction ?? 0;
      meta.percent = parseFloat((fraction * 100).toFixed(2));
      if (qInfo.resetTime) {
        meta.resetTime = qInfo.resetTime;
      }
    }
    return meta;
  });

  console.log(JSON.stringify(results, null, 2));
}

main();
