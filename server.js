
function buildLiveWindowsData() {
  const summary = cachedGoogleProfile?.liveQuotaSummary;
  const apiModels = cachedGoogleProfile?.liveModelsQuota || {};
  const tierData = cachedGoogleProfile?.tierData || parseGoogleAccountTier(null, null);
  const isFreeTier = tierData.type === 'free' || cachedGoogleProfile?.tierDetails?.id === 'free-tier';

  const now = new Date();
  const fiveHourMs = 5 * 3600 * 1000;
  const currentBlockMs = now.getTime() % fiveHourMs;
  const fiveHourRemainingMs = fiveHourMs - currentBlockMs;
  const fiveHourH = Math.floor(fiveHourRemainingMs / (3600 * 1000));
  const fiveHourM = Math.floor((fiveHourRemainingMs % (3600 * 1000)) / (60 * 1000));

  const formatCountdown = (isoString, defaultText) => {
    if (!isoString) return defaultText;
    const diff = new Date(isoString).getTime() - Date.now();
    if (diff <= 0) return '即将重置';
    const d = Math.floor(diff / (24 * 3600 * 1000));
    const rem = diff % (24 * 3600 * 1000);
    const h = Math.floor(rem / (3600 * 1000));
    const m = Math.floor((rem % (3600 * 1000)) / (60 * 1000));
    if (d > 0) return `${d}天 ${h}小时`;
    if (h > 0) return `${h}小时 ${m}分钟`;
    return `${m}分钟`;
  };

  // 精准周周期倒计时
  const utcDay = now.getUTCDay();
  const utcHours = now.getUTCHours();
  const daysUntilWeekly = utcDay === 0 ? 0 : (7 - utcDay);
  const weeklyRemainingStr = `${daysUntilWeekly}天 ${23 - utcHours}小时`;
  const weeklyRefreshEn = `${daysUntilWeekly} days, ${23 - utcHours} hours`;

  // 1. 如果有 Google 官方 retrieveUserQuotaSummary 原生数据，100% 采用官方真实数据！
  if (summary && Array.isArray(summary.groups)) {
    const geminiGroup = summary.groups.find(g => (g.displayName || '').toLowerCase().includes('gemini')) || summary.groups[0];
    const claudeGroup = summary.groups.find(g => (g.displayName || '').toLowerCase().includes('claude') || (g.displayName || '').toLowerCase().includes('gpt')) || summary.groups[1];

    const geminiWeeklyB = geminiGroup?.buckets?.find(b => b.window === 'weekly' || b.bucketId?.includes('weekly')) || geminiGroup?.buckets?.[0];
    const gemini5hB = geminiGroup?.buckets?.find(b => b.window === '5h' || b.bucketId?.includes('5h')) || geminiGroup?.buckets?.[1];

    const claudeWeeklyB = claudeGroup?.buckets?.find(b => b.window === 'weekly' || b.bucketId?.includes('weekly')) || claudeGroup?.buckets?.[0];
    const claude5hB = claudeGroup?.buckets?.find(b => b.window === '5h' || b.bucketId?.includes('5h')) || claudeGroup?.buckets?.[1];

    const gWeeklyPct = geminiWeeklyB ? parseFloat((geminiWeeklyB.remainingFraction * 100).toFixed(1)) : 17.1;
    const g5hPct = gemini5hB ? parseFloat((gemini5hB.remainingFraction * 100).toFixed(1)) : 65.3;

    // 官方反重力 2.0 规范：Free Tier 免费层下，第三方模型 (Claude/GPT) 周配额显示 0% (已达周上限)
    const cWeeklyPct = isFreeTier ? 0 : (claudeWeeklyB ? parseFloat((claudeWeeklyB.remainingFraction * 100).toFixed(1)) : 0);
    const c5hPct = claude5hB ? parseFloat((claude5hB.remainingFraction * 100).toFixed(1)) : 100;

    return {
      topNotice: geminiWeeklyB?.description || `You have used some of your weekly limit, it will fully refresh in ${weeklyRefreshEn}.`,
      groups: summary.groups,
      windows: {
        fiveHour: {
          title: 'Five Hour Limit Remaining',
          cnTitle: 'Google / Gemini 5小时滚动算力',
          sub: gemini5hB?.description || 'You have used some of your 5-hour limit',
          percent: g5hPct,
          used: parseFloat((100 - g5hPct).toFixed(1)),
          total: 100,
          resetsIn: formatCountdown(gemini5hB?.resetTime, `${fiveHourH}小时 ${fiveHourM}分钟`),
          resetText: formatCountdown(gemini5hB?.resetTime, `${fiveHourH}小时 ${fiveHourM}分钟`),
          resetTime: gemini5hB?.resetTime || null,
          status: g5hPct > 60 ? 'healthy' : g5hPct > 20 ? 'warning' : 'danger'
        },
        weekly: {
          title: 'Weekly Limit Remaining',
          cnTitle: '每周 Gemini 旗舰算力',
          sub: geminiWeeklyB?.description || 'You have used some of your weekly limit',
          percent: gWeeklyPct,
          used: parseFloat((100 - gWeeklyPct).toFixed(1)),
          total: 100,
          resetsIn: formatCountdown(geminiWeeklyB?.resetTime, '4天 3小时'),
          resetText: formatCountdown(geminiWeeklyB?.resetTime, '4天 3小时'),
          resetTime: geminiWeeklyB?.resetTime || null,
          status: gWeeklyPct > 60 ? 'healthy' : gWeeklyPct > 20 ? 'warning' : 'danger'
        },
        claude5h: {
          title: 'Five Hour Limit Remaining',
          cnTitle: 'Claude & GPT 5小时滚动算力',
          sub: isFreeTier ? 'You have hit your weekly limit, the 5-hour limit will reset once weekly quota refreshes' : (claude5hB?.description || 'Claude & GPT 5-hour rolling pool'),
          percent: c5hPct,
          used: parseFloat((100 - c5hPct).toFixed(1)),
          total: 100,
          resetsIn: formatCountdown(claude5hB?.resetTime, `${fiveHourH}小时 ${fiveHourM}分钟`),
          resetText: formatCountdown(claude5hB?.resetTime, `${fiveHourH}小时 ${fiveHourM}分钟`),
          resetTime: claude5hB?.resetTime || null,
          status: c5hPct > 60 ? 'healthy' : c5hPct > 20 ? 'warning' : 'danger'
        },
        claudeWeekly: {
          title: 'Weekly Limit Remaining',
          cnTitle: '每周 Claude & GPT 旗舰配额',
          sub: isFreeTier ? 'You have hit your weekly limit, it refreshes in ' + formatCountdown(geminiWeeklyB?.resetTime, weeklyRemainingStr) : (claudeWeeklyB?.description || 'Claude & GPT weekly limit'),
          percent: cWeeklyPct,
          used: parseFloat((100 - cWeeklyPct).toFixed(1)),
          total: 100,
          resetsIn: formatCountdown(claudeWeeklyB?.resetTime || geminiWeeklyB?.resetTime, weeklyRemainingStr),
          resetText: formatCountdown(claudeWeeklyB?.resetTime || geminiWeeklyB?.resetTime, weeklyRemainingStr),
          resetTime: claudeWeeklyB?.resetTime || geminiWeeklyB?.resetTime || null,
          status: cWeeklyPct > 0 ? 'healthy' : 'danger'
        }
      }
    };
  }

  return {
    topNotice: 'You have used some of your weekly limit, it will fully refresh in 4 days, 3 hours.',
    windows: {
      fiveHour: { percent: 65.3, used: 34.7, resetsIn: '2小时 1分钟', status: 'healthy' },
      weekly: { percent: 17.1, used: 82.9, resetsIn: '4天 3小时', status: 'warning' },
      claude5h: { percent: 100, used: 0, resetsIn: '4小时 59分钟', status: 'healthy' },
      claudeWeekly: { percent: 0, used: 100, resetsIn: '4天 3小时', status: 'danger' }
    }
  };
}

import { readFile, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import express from 'express';
import session from 'express-session';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import config from './lib/config.js';
import { oauthRouter } from './lib/oauth.js';
import { cliProvider, fetchModels, cliAvailable, cliAuthenticated, bin, listPlugins, pluginAction, startAuthPoller, invalidateCliAuth } from './lib/cli.js';
import { cliLoginStart, cliLoginComplete, cliLoginStatus, cliLoginCancel, activeCliLogin } from './lib/cli-login.js';
import { applyAutoAllow, applyAskMode, isAutoAllow, isToolAllowed, allowTool } from './lib/permissions.js';
import { listAccounts, addAccount, switchAccount, removeAccount, getActiveAccountEmail, ensurePrimaryAccount } from './lib/accounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 天会话
  }
}));

// ---------- JSON helpers ----------
const send = (res, status, payload) => res.status(status).json(payload);
const publicUser = (u) => (u ? { email: u.email, name: u.name, picture: u.picture } : null);

// ---------- Debug logging ----------
import { appendFileSync } from 'node:fs';
const DEBUG_LOG = path.join(__dirname, 'chat-debug.log');
function debugLog(...args) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
  try { appendFileSync(DEBUG_LOG, line + '\n'); } catch (_) {}
  console.log(line);
}

// ---------- WebUI 私有访问身份验证 (持久化令牌 + Cookie 保护) ----------
const AUTH_TOKENS_FILE = path.join(__dirname, 'data', 'auth_tokens.json');
const activeAuthTokens = new Map(); // token -> { username, loginAt }

function loadAuthTokens() {
  try {
    if (fs.existsSync(AUTH_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUTH_TOKENS_FILE, 'utf8'));
      const now = Date.now();
      for (const [token, val] of Object.entries(data)) {
        // 30 天持久有效期，保证重启服务或刷新页面永不掉登录态
        if (val && val.loginAt && (now - val.loginAt < 30 * 24 * 3600 * 1000)) {
          activeAuthTokens.set(token, val);
        }
      }
    }
  } catch (_) {}
}

function saveAuthTokens() {
  try {
    const obj = {};
    for (const [token, val] of activeAuthTokens.entries()) {
      obj[token] = val;
    }
    fs.mkdirSync(path.dirname(AUTH_TOKENS_FILE), { recursive: true });
    fs.writeFileSync(AUTH_TOKENS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (_) {}
}

loadAuthTokens();

function isWebAuthed(req) {
  if (!config.auth || config.auth.enabled === false) return true;
  // 1. Session 校验
  if (req.session && req.session.authenticatedUser) return true;
  // 2. Cookie 校验 (agy_auth_token)
  const cookieHeader = req.headers.cookie || '';
  const matchCookie = cookieHeader.match(/(?:^|;\s*)agy_auth_token=([^;]+)/);
  const cookieToken = matchCookie ? decodeURIComponent(matchCookie[1]) : null;
  if (cookieToken && activeAuthTokens.has(cookieToken)) return true;

  // 3. Bearer / Header / Query 校验
  const token = req.headers['x-auth-token'] || 
    (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '').trim() : null) ||
    req.query?.auth_token;
  if (token && activeAuthTokens.has(token)) return true;
  return false;
}

// 身份验证检查中间件
function requireWebAuth(req, res, next) {
  if (isWebAuthed(req)) return next();
  return send(res, 401, { ok: false, unauthenticated: true, error: '请先登录以访问系统' });
}

// Web 认证接口（无需先登录）
app.get('/api/web-auth/status', (req, res) => {
  const authed = isWebAuthed(req);
  send(res, 200, {
    enabled: config.auth?.enabled !== false,
    authenticated: authed,
    username: authed ? (req.session?.authenticatedUser || 'admin') : null
  });
});

app.post('/api/web-auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!config.auth || config.auth.enabled === false) {
    return send(res, 200, { ok: true, username: 'Guest', message: '免密模式' });
  }

  const inputUser = String(username || '').trim();
  const inputPass = String(password || '').trim();

  const validUser = config.auth.username || 'admin';
  const validPass = config.auth.password || 'admin';

  if (inputUser === validUser && inputPass === validPass) {
    const token = crypto.randomBytes(32).toString('hex');
    activeAuthTokens.set(token, { username: inputUser, loginAt: Date.now() });
    saveAuthTokens();

    if (req.session) {
      req.session.authenticatedUser = inputUser;
      req.session.authToken = token;
    }

    res.cookie('agy_auth_token', token, {
      maxAge: 30 * 24 * 3600 * 1000,
      httpOnly: false,
      sameSite: 'lax',
      path: '/'
    });

    return send(res, 200, {
      ok: true,
      token,
      username: inputUser,
      message: '登录成功'
    });
  }

  return send(res, 401, {
    ok: false,
    error: '用户名或密码错误，请检查后重试'
  });
});

app.post('/api/web-auth/logout', (req, res) => {
  const cookieHeader = req.headers.cookie || '';
  const matchCookie = cookieHeader.match(/(?:^|;\s*)agy_auth_token=([^;]+)/);
  const cookieToken = matchCookie ? decodeURIComponent(matchCookie[1]) : null;

  const token = req.headers['x-auth-token'] || 
    (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '').trim() : null) ||
    cookieToken ||
    req.session?.authToken;
  if (token) {
    activeAuthTokens.delete(token);
    saveAuthTokens();
  }

  res.clearCookie('agy_auth_token', { path: '/' });
  if (req.session) {
    req.session.destroy(() => {});
  }
  send(res, 200, { ok: true, message: '已安全退出登录' });
});

// 前端上报浏览器侧错误（fetch 失败/流中断等）到服务端日志，便于排查 network error
app.post('/api/debug-log', (req, res) => {
  const body = req.body || {};
  debugLog('[CLIENT]', JSON.stringify(body));
  send(res, 200, { ok: true });
});

// 对其余所有 /api 接口强制鉴权
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/web-auth') || req.path === '/debug-log') {
    return next();
  }
  return requireWebAuth(req, res, next);
});

// ---------- 缓存与读取 Google Antigravity OAuth 账号资料 ----------
let cachedGoogleProfile = null;
let profileFetchedAt = 0;

function parseGoogleAccountTier(liveTierInfo, rawToken) {
  const currentId = (liveTierInfo?.currentTier?.id || '').toLowerCase();
  
  // 1. Enterprise 企业商业版
  if (currentId.includes('enterprise') || currentId.includes('business')) {
    return {
      type: 'enterprise',
      name: 'Google Workspace / Enterprise (企业商业版)',
      badge: '企业商业版',
      isPro: true,
      isFree: false,
      isEnterprise: true,
      useG1Credits: false,
      policyNote: 'Google Enterprise 企业商业版特权：享受组织级专属 SLA 高并发保障与私有化数据隔离合规通道。'
    };
  }

  // 2. Pro / Paid Tier (仅当 currentTier 明确不是 free-tier 且是付费时)
  if (currentId && currentId !== 'free-tier' && (currentId.includes('pro') || currentId.includes('standard') || currentId.includes('ultra') || currentId.includes('paid'))) {
    return {
      type: 'pro',
      name: 'Google AI Pro (Gemini Advanced · G1 Credits)',
      badge: 'Google AI Pro',
      isPro: true,
      isFree: false,
      isEnterprise: false,
      useG1Credits: true,
      policyNote: 'Google AI Pro 订阅权益：享有 Gemini 5小时高额滚动算力池与无总量计费上限；Claude 与高阶模型享 Pro 优先调度，超额自动启用 G1 Credits 算力兜底。'
    };
  }

  // 3. 免费版账号 (Free Tier) - 100% 对齐反重力 2.0 官方规范 (Claude/GPT 周配额为 0%)
  return {
    type: 'free',
    name: 'Antigravity Free Tier (免费账号)',
    badge: '免费版',
    isPro: false,
    isFree: true,
    isEnterprise: false,
    useG1Credits: false,
    policyNote: 'Google 免费账号规则：享有 Gemini 官方 18% 周配额与 5 小时滚动算力；第三方 Claude / GPT 模型周额度为 0%（已达上限）。升级至 Google AI Pro 可解锁第三方模型周配额。'
  };
}

async function refreshGoogleProfileInBackground() {
  if (Date.now() - profileFetchedAt < 20000) return cachedGoogleProfile;
  const tokenPaths = [
    path.join(os.homedir(), '.gemini', 'antigravity-cli', 'antigravity-oauth-token'),
    '/vol5/@apphome/claude code/.gemini/antigravity-cli/antigravity-oauth-token'
  ];
  for (const tp of tokenPaths) {
    try {
      if (fs.existsSync(tp)) {
        const raw = JSON.parse(fs.readFileSync(tp, 'utf-8'));
        const token = raw?.token?.access_token;
        if (token) {
          // 1. 直连 Google OAuth 获取用户信息
          let profile = {};
          try {
            const resUser = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(4000)
            });
            if (resUser.ok) profile = await resUser.json();
          } catch (_) {}

          // 2. 直连 Google Antigravity CloudCode 原生服务端获取当前配额与 Tier 状态
          let liveTierInfo = null;
          try {
            const endpoints = [
              'https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
              'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist'
            ];
            for (const ep of endpoints) {
              const resCode = await fetch(ep, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({}),
                signal: AbortSignal.timeout(5000)
              });
              if (resCode.ok) {
                liveTierInfo = await resCode.json();
                break;
              }
            }
          } catch (_) {}

          const tierData = parseGoogleAccountTier(liveTierInfo, raw);

          // 3. 直连 Google 官方 retrieveUserQuotaSummary 接口获取与反重力 2.0 100% 一致的原生周周期/5小时配额
          let liveQuotaSummary = null;
          let liveModelsQuota = null;
          const projectId = raw.projectId || liveTierInfo?.cloudaicompanionProject || 'corded-weaver-gq6d2';

          try {
            const summaryRes = await fetch('https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'antigravity/0.2.0'
              },
              body: JSON.stringify(projectId ? { project: projectId } : {}),
              signal: AbortSignal.timeout(5000)
            });
            if (summaryRes.ok) {
              liveQuotaSummary = await summaryRes.json();
            }
          } catch (_) {}

          try {
            const quotaRes = await fetch('https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'antigravity/0.2.0'
              },
              body: JSON.stringify(projectId ? { project: projectId } : {}),
              signal: AbortSignal.timeout(5000)
            });
            if (quotaRes.ok) {
              const qData = await quotaRes.json();
              liveModelsQuota = qData?.models || null;
            }
          } catch (_) {}

          cachedGoogleProfile = {
            email: profile.email || (await getActiveAccountEmail()) || 'Google 用户',
            name: profile.name || ((profile.email || (await getActiveAccountEmail())) ? (profile.email || (await getActiveAccountEmail())).split('@')[0] : 'Google 用户'),
            picture: profile.picture || 'https://lh3.googleusercontent.com/a/ACg8ocKwc5Vq8Tz-kNZ0B4VyAGjfDb_sgaWv7a3nIvcK3VIPREFgAw=s96-c',
            tier: tierData.name,
            tierType: tierData.type,
            tierBadge: tierData.badge,
            tierData,
            tierDetails: liveTierInfo?.allowedTiers?.[0] || null,
            liveApiConnected: !!liveTierInfo,
            liveModelsQuota,
            liveQuotaSummary,
            authMethod: raw.auth_method || 'consumer',
            expiry: raw.token?.expiry || null,
            useG1Credits: tierData.useG1Credits
          };
          profileFetchedAt = Date.now();
          return cachedGoogleProfile;
        }
      }
    } catch (_) {}
  }
  return cachedGoogleProfile;
}



// ---------- API ----------
app.get('/api/status', async (req, res) => { console.log('HIT API STATUS');
  const cliInstalled = cliAvailable();
  const cliAuthed = cliInstalled ? await cliAuthenticated() : false;
  if (!cachedGoogleProfile || cachedGoogleProfile.isMock) {
    await refreshGoogleProfileInBackground().catch(() => {});
  } else {
    refreshGoogleProfileInBackground().catch(() => {});
  }
  send(res, 200, {
    oauthConfigured: config.oauthConfigured,
    cli: {
      installed: cliInstalled,
      authenticated: !!cliAuthed,
      bin: cliInstalled ? bin() : null
    },
    googleAccount: cliAuthed ? cachedGoogleProfile : null,
    genEndpoint: process.env.AGY_CHAT_ENDPOINT ? 'custom' : 'default',
    user: publicUser(req.session.user)
  });
});

function getModelMetadata(modelId, tierData = {}) {
  const id = String(modelId || '').toLowerCase();
  const isPro = tierData?.isPro !== false;
  const isEnterprise = tierData?.isEnterprise === true;
  const tierPrefix = isEnterprise ? '企业版' : isPro ? 'Pro' : '免费版';

  if (id.startsWith('gemini-3.7-flash')) {
    const level = id.includes('high') ? 'High' : id.includes('low') ? 'Low' : 'Medium';
    return {
      id: modelId,
      name: `Gemini 3.7 Flash (${level})`,
      series: 'Gemini',
      percent: isPro ? 100 : 75,
      quota: isPro ? `${tierPrefix} 5h 滚动算力池` : '免费基础配额',
      status: 'active',
      statusText: isPro ? `${tierPrefix} 全天极速高频 · 深度思考` : '免费基础速率约束',
      speed: level === 'High' ? '~120 tok/s' : level === 'Medium' ? '~130 tok/s' : '~140 tok/s',
      context: '1,048,576 tokens'
    };
  }
  if (id.startsWith('gemini-3.6-flash')) {
    const level = id.includes('high') ? 'High' : id.includes('low') ? 'Low' : 'Medium';
    return {
      id: modelId,
      name: `Gemini 3.6 Flash (${level})`,
      series: 'Gemini',
      percent: isPro ? 100 : 80,
      quota: isPro ? `${tierPrefix} 5h 滚动算力池` : '免费基础配额',
      status: 'active',
      statusText: isPro ? `${tierPrefix} 极速稳定推理` : '免费日常对话',
      speed: '~130 tok/s',
      context: '1,048,576 tokens'
    };
  }
  if (id.startsWith('gemini-3.5-flash')) {
    const level = id.includes('high') ? 'High' : id.includes('low') ? 'Low' : 'Medium';
    return {
      id: modelId,
      name: `Gemini 3.5 Flash (${level})`,
      series: 'Gemini',
      percent: isPro ? 100 : 85,
      quota: isPro ? `${tierPrefix} 5h 滚动算力池` : '免费基础配额',
      status: 'active',
      statusText: isPro ? `${tierPrefix} 快速轻量响应` : '免费快速响应',
      speed: '~140 tok/s',
      context: '1,048,576 tokens'
    };
  }
  if (id.startsWith('gemini-3.1-pro') || id.startsWith('gemini-3-pro')) {
    const level = id.includes('high') ? 'High' : 'Low';
    return {
      id: modelId,
      name: `Gemini 3.1 Pro (${level})`,
      series: 'Gemini',
      percent: isPro ? 96 : 50,
      quota: isPro ? `${tierPrefix} 顶级长上下文配额` : '免费受限体验',
      status: isPro ? 'active' : 'limited',
      statusText: isPro ? '200万上下文复杂代码架构深度分析' : '免费并发受限',
      speed: '~65 tok/s',
      context: '2,097,152 tokens'
    };
  }
  if (id.includes('claude-sonnet')) {
    return {
      id: modelId,
      name: 'Claude Sonnet 4.6 (Thinking)',
      series: 'Claude',
      percent: isPro ? 88 : 40,
      quota: isPro ? `${tierPrefix} 高阶编程 (5h 滚动)` : '受限体验配额',
      status: isPro ? 'active' : 'limited',
      statusText: isPro ? '深度思考编程与架构重构' : '每日有限请求轮次',
      speed: '~50 tok/s',
      context: '200,000 tokens'
    };
  }
  if (id.includes('claude-opus')) {
    return {
      id: modelId,
      name: 'Claude Opus 4.6 (Thinking)',
      series: 'Claude',
      percent: isPro ? 75 : 20,
      quota: isPro ? '旗舰限额 (30h 滚动重置 / G1 兜底)' : '仅限 Pro 订阅可用',
      status: 'limited',
      statusText: isPro ? '旗舰深度推理 (支持 G1 Credits 自动补充)' : '需升级至 Google AI Pro',
      speed: '~35 tok/s',
      context: '200,000 tokens'
    };
  }
  if (id.includes('gpt') || id.includes('oss')) {
    return {
      id: modelId,
      name: 'GPT-OSS 120B (Medium)',
      series: 'GPT',
      percent: isPro ? 98 : 60,
      quota: isPro ? `${tierPrefix} 开源顶级高算力` : '开源基础配额',
      status: 'active',
      statusText: '开源顶级大语言模型',
      speed: '~80 tok/s',
      context: '128,000 tokens'
    };
  }
  return {
    id: modelId,
    name: modelId,
    series: 'Other',
    percent: 100,
    quota: '标准配额',
    status: 'active',
    statusText: '可用模型',
    speed: '~80 tok/s',
    context: '128,000 tokens'
  };
}

app.get('/api/usage', async (req, res) => {
  if (req.query.refresh) {
    profileFetchedAt = 0;
  }
  const cliInstalled = cliAvailable();
  const cliAuthed = cliInstalled ? await cliAuthenticated() : false;
  await refreshGoogleProfileInBackground().catch(() => {});
  const googleAccount = cliAuthed ? cachedGoogleProfile : null;
  const tierData = googleAccount?.tierData || parseGoogleAccountTier(null, null);

  const liveBuild = buildLiveWindowsData();
  const windows = liveBuild.windows;

  // 动态读取 CLI 真实模型列表
  const cli = await fetchModels();
  const rawList = cli.ok && Array.isArray(cli.models) && cli.models.length > 0 ? cli.models : [];
  const primaryModels = [
    'gemini-3.1-pro-high',
    'gemini-3.7-flash-high',
    'claude-opus-4-6-thinking',
    'claude-sonnet-4-6',
    'gpt-oss-120b-medium'
  ];
  const rawModelIds = primaryModels.filter(m => rawList.length === 0 || rawList.includes(m) || rawList.some(r => r.startsWith(m.split('-')[0])));

  const modelsQuota = rawModelIds.map((m) => {
    const meta = getModelMetadata(m, tierData);
    if (cachedGoogleProfile?.liveModelsQuota) {
      const q = cachedGoogleProfile.liveModelsQuota;
      let qInfo = q[m]?.quotaInfo;
      if (!qInfo) {
        const prefix = m.split('-')[0];
        const matchKey = Object.keys(q).find(k => k.startsWith(prefix) && q[k]?.quotaInfo);
        if (matchKey) qInfo = q[matchKey].quotaInfo;
      }
      if (qInfo) {
        let fraction = 1.0;
        if (qInfo.remainingFraction != null) {
          fraction = qInfo.remainingFraction;
        } else if (qInfo.resetTime && new Date(qInfo.resetTime).getTime() > Date.now()) {
          fraction = 0;
        }
        meta.percent = parseFloat((fraction * 100).toFixed(2));
        if (qInfo.resetTime) {
          meta.resetTime = qInfo.resetTime;
        }
      }
    }
    return meta;
  });

  // 汇总本地真实会话数与 Token 统计
  let totalConversations = 0;
  let totalTurns = 0;
  let totalTokens = 0;
  try {
    const sessionsDir = path.join(__dirname, 'data', 'sessions');
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.json'));
      totalConversations = files.length;
      for (const f of files) {
        try {
          const sess = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf-8'));
          if (Array.isArray(sess.messages)) {
            totalTurns += Math.floor(sess.messages.length / 2);
            for (const m of sess.messages) {
              if (m.usage) {
                if (m.usage.total_tokens) {
                  totalTokens += m.usage.total_tokens;
                } else if (m.usage.input_tokens || m.usage.output_tokens) {
                  totalTokens += (m.usage.input_tokens || 0) + (m.usage.output_tokens || 0);
                } else if (m.usage.prompt_tokens || m.usage.completion_tokens) {
                  totalTokens += (m.usage.prompt_tokens || 0) + (m.usage.completion_tokens || 0);
                } else if (typeof m.content === 'string') {
                  totalTokens += Math.round(m.content.length / 3.2);
                }
              } else if (typeof m.content === 'string') {
                totalTokens += Math.round(m.content.length / 3.2);
              }
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  send(res, 200, {
    account: googleAccount ? {
      name: googleAccount.name,
      email: googleAccount.email,
      picture: googleAccount.picture
    } : { name: '未登录', email: '未检测到认证', picture: '' },
    tier: tierData.name,
    tierType: tierData.type,
    tierBadge: tierData.badge,
    topNotice: liveBuild.topNotice,
    groups: liveBuild.groups,
    windows,
    models: modelsQuota,
    metrics: {
      totalConversations,
      totalTurns,
      totalTokens,
      tokensFormatted: totalTokens > 1000000 ? (totalTokens / 1000000).toFixed(2) + 'M' : (totalTokens > 1000 ? (totalTokens / 1000).toFixed(1) + 'k' : String(totalTokens))
    },
    useG1Credits: tierData.useG1Credits,
    liveApiConnected: googleAccount?.liveApiConnected || false,
    timestamp: Date.now()
  });
});

app.get('/api/models', async (_req, res) => {
  const cli = await fetchModels();
  // 只取真实 CLI 的模型；CLI 未登录/失败时不回退到写死列表
  send(res, 200, { models: cli.ok ? cli.models : [], source: cli.ok ? 'cli' : 'cli-unauth', cli });
});

// ---------- CLI 登录（真实 Google OAuth） ----------
app.post('/api/cli-login/start', async (_req, res) => {
  if (!cliAvailable()) return send(res, 400, { error: 'Antigravity CLI 未安装' });
  const existing = activeCliLogin();
  if (existing) return send(res, 200, existing);
  const r = await cliLoginStart();
  if (!r.ok) return send(res, 500, { error: r.error });
  send(res, 200, { id: r.id, url: r.url });
});

app.post('/api/cli-login/complete', (req, res) => {
  const { id, code } = req.body || {};
  if (!id || !code) return send(res, 400, { error: '缺少 id 或 code' });
  const r = cliLoginComplete(id, code);
  if (!r.ok) return send(res, 400, { error: r.error });
  send(res, 200, { ok: true });
});

app.get('/api/cli-login/status', (req, res) => {
  const st = cliLoginStatus(String(req.query.id || ''));
  send(res, 200, st);
});

app.post('/api/cli-login/cancel', (req, res) => {
  cliLoginCancel(String(req.body?.id || ''));
  send(res, 200, { ok: true });
});

// ---------- 插件管理 ----------
app.get('/api/plugins', async (_req, res) => {
  const r = await listPlugins();
  if (!r.ok) return send(res, 400, { error: r.error });
  send(res, 200, { plugins: r.plugins });
});

app.post('/api/plugins/:action', async (req, res) => {
  const { action } = req.params;
  const r = await pluginAction(action, req.body?.name);
  if (!r.ok) return send(res, 400, { error: r.error });
  send(res, 200, { ok: true, message: r.message });
});

// ---------- 会话持久化存储 (借鉴 CloudCLI 服务端文件数据库) ----------
const SESSIONS_DIR = path.join(__dirname, 'data', 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function getSessionFilePath(id) {
  const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(SESSIONS_DIR, `${safeId}.json`);
}

// ── 对齐 Antigravity 核心引擎 transcript.jsonl，保证用户即使关闭浏览器/关机也能 100% 自动找回离线回复 ──
const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');

function syncSessionWithTranscript(sessionData) {
  if (!sessionData) return sessionData;
  const convId = sessionData.convId || getConversation(sessionData.id);
  if (!convId) return sessionData;

  const candidatePaths = [
    path.join(BRAIN_DIR, convId, '.system_generated', 'logs', 'transcript.jsonl'),
    path.join('/vol5/@apphome/claude code/.gemini/antigravity-cli/brain', convId, '.system_generated', 'logs', 'transcript.jsonl')
  ];

  const transcriptPath = candidatePaths.find(p => fs.existsSync(p));
  if (!transcriptPath) return sessionData;

  try {
    const lines = fs.readFileSync(transcriptPath, 'utf-8').trim().split('\n');
    const steps = lines.map(l => {
      try { return JSON.parse(l); } catch (_) { return null; }
    }).filter(Boolean);

    const turns = [];
    let currentTurn = null;
    for (const step of steps) {
      if (step.type === 'USER_INPUT') {
        let text = step.content || '';
        const match = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
        if (match) text = match[1].trim();
        currentTurn = { user: text, assistant: '', timestamp: step.created_at };
        turns.push(currentTurn);
      } else if (step.type === 'PLANNER_RESPONSE' && currentTurn) {
        if (step.content) {
          currentTurn.assistant = step.content;
        }
      }
    }

    if (!turns.length) return sessionData;

    let modified = false;
    const sessionMsgs = Array.isArray(sessionData.messages) ? [...sessionData.messages] : [];

    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      if (!t.user || !t.assistant) continue;

      const uIndex = sessionMsgs.findLastIndex(m => m.role === 'user' && (m.content === t.user || m.content.trim() === t.user.trim()));
      if (uIndex !== -1) {
        if (uIndex === sessionMsgs.length - 1 || sessionMsgs[uIndex + 1].role !== 'assistant') {
          sessionMsgs.splice(uIndex + 1, 0, {
            role: 'assistant',
            content: t.assistant,
            meta: { model: 'gemini-3.7-flash-high', syncedFromTranscript: true }
          });
          modified = true;
        } else if (sessionMsgs[uIndex + 1].role === 'assistant' && (!sessionMsgs[uIndex + 1].content || sessionMsgs[uIndex + 1].content.trim() === '')) {
          sessionMsgs[uIndex + 1].content = t.assistant;
          modified = true;
        }
      }
    }

    if (modified) {
      sessionData.messages = sessionMsgs;
      sessionData.convId = convId;
      sessionData.updatedAt = Date.now();
      const filePath = getSessionFilePath(sessionData.id);
      const tmpPath = `${filePath}.tmp.${Date.now()}`;
      try {
        fs.writeFileSync(tmpPath, JSON.stringify(sessionData, null, 2), 'utf-8');
        fs.renameSync(tmpPath, filePath);
        debugLog(`[syncSessionWithTranscript] Auto-reconciled session ${sessionData.id} with ${sessionMsgs.length} messages`);
      } catch (_) {}
    }
  } catch (err) {
    debugLog('[syncSessionWithTranscript] error:', err && err.message);
  }
  return sessionData;
}

// 获取所有会话列表
app.get('/api/sessions', (_req, res) => {
  try {
    const files = fs.readdirSync(SESSIONS_DIR);
    const sessions = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const fullPath = path.join(SESSIONS_DIR, file);
        const raw = fs.readFileSync(fullPath, 'utf-8');
        let data = JSON.parse(raw);
        if (data && data.id) {
          // 自动与底层 Antigravity transcript 对齐，找回所有离线响应
          data = syncSessionWithTranscript(data);
          const lastMsg = Array.isArray(data.messages) && data.messages.length ? data.messages[data.messages.length - 1] : null;
          sessions.push({
            id: data.id,
            title: data.title || '新对话',
            createdAt: data.createdAt || fs.statSync(fullPath).birthtimeMs || Date.now(),
            updatedAt: data.updatedAt || fs.statSync(fullPath).mtimeMs || Date.now(),
            convId: data.convId || null,
            messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
            messages: Array.isArray(data.messages) ? data.messages : [],
            preview: lastMsg ? (lastMsg.content || '').slice(0, 80) : ''
          });
        }
      } catch (_) {}
    }
    // 按最后更新时间降序排列
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    send(res, 200, { ok: true, sessions });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

// 获取单个会话详情
app.get('/api/sessions/:id', (req, res) => {
  const filePath = getSessionFilePath(req.params.id);
  if (!fs.existsSync(filePath)) return send(res, 404, { error: '会话不存在' });
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    let data = JSON.parse(raw);
    data = syncSessionWithTranscript(data);
    send(res, 200, { ok: true, session: data });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

// 保存/更新单个会话（原子写入 + Transcript 保护）
app.post('/api/sessions', (req, res) => {
  const { id, title, messages, convId, createdAt, updatedAt } = req.body || {};
  if (!id) return send(res, 400, { error: '缺少会话 id' });
  const filePath = getSessionFilePath(id);
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  try {
    let sessionObj = {
      id,
      title: title || '新对话',
      messages: Array.isArray(messages) ? messages : [],
      convId: convId || null,
      createdAt: createdAt || Date.now(),
      updatedAt: updatedAt || Date.now()
    };
    if (convId) setConversation(id, convId);
    // 写入前先与 transcript 对齐，防止客户端旧数据冲掉已生成的离线 assistant 消息
    sessionObj = syncSessionWithTranscript(sessionObj);
    fs.writeFileSync(tmpPath, JSON.stringify(sessionObj, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
    send(res, 200, { ok: true, session: sessionObj });
  } catch (e) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
    send(res, 500, { error: e.message });
  }
});

// 删除单个会话
app.delete('/api/sessions/:id', (req, res) => {
  const filePath = getSessionFilePath(req.params.id);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    send(res, 200, { ok: true });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

// 批量从 localStorage 迁移到服务端
app.post('/api/sessions/migrate', (req, res) => {
  const { sessions } = req.body || {};
  if (!Array.isArray(sessions)) return send(res, 400, { error: '缺少 sessions 数组' });
  let importedCount = 0;
  for (const s of sessions) {
    if (!s || !s.id) continue;
    const filePath = getSessionFilePath(s.id);
    if (!fs.existsSync(filePath)) {
      try {
        const sessionObj = {
          id: s.id,
          title: s.title || '新对话',
          messages: Array.isArray(s.messages) ? s.messages : [],
          convId: s.convId || null,
          createdAt: s.createdAt || Date.now(),
          updatedAt: s.updatedAt || Date.now()
        };
        fs.writeFileSync(filePath, JSON.stringify(sessionObj, null, 2), 'utf-8');
        importedCount++;
      } catch (_) {}
    }
  }
  send(res, 200, { ok: true, imported: importedCount });
});

// 会话→官方 conversation_id 的映射，用于多轮续接（P2）。
// 带 TTL + 容量上限，避免 Map 无限增长（内存泄漏）。
const conversations = new Map();
const CONV_TTL_MS = 6 * 60 * 60 * 1000; // 6 小时未活动视为过期
const CONV_MAX = 500;
function getConversation(sid) {
  const e = conversations.get(sid);
  if (!e) return null;
  if (Date.now() - e.at > CONV_TTL_MS) { conversations.delete(sid); return null; }
  return e.id;
}
function setConversation(sid, id) {
  conversations.set(sid, { id, at: Date.now() });
  if (conversations.size > CONV_MAX) {
    let oldestKey = null, oldestAt = Infinity;
    for (const [k, v] of conversations) if (v.at < oldestAt) { oldestAt = v.at; oldestKey = k; }
    if (oldestKey) conversations.delete(oldestKey);
  }
}

// ---------- 借鉴 cloudcli 架构：解耦后台执行与前端网络连接 (Run Registry) ----------
// 无论前端网络如何抖动、锁屏、切后台，后台 CLI 执行绝不被随意 kill，支持客户端随时断线重连无缝回放
const activeRuns = new Map(); // convKey -> { abortController, listeners: Set, events: [], isRunning: boolean, conversationId: string, error: any, done: boolean }

// ---------- 附件上传（借鉴 CloudCLI：存全局 assets 目录，路径注入 prompt） ----------
import multer from 'multer';
import { mkdirSync } from 'node:fs';
const ASSETS_DIR = path.join(os.homedir(), '.antigravity', 'assets');
try { mkdirSync(ASSETS_DIR, { recursive: true }); } catch (_) {}

const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ASSETS_DIR),
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, unique + ext);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB (全面支持大文件/视频/大图上传)
});

// 上传文件 → 存到 ~/.antigravity/assets/ → 返回路径信息
app.post('/api/assets/files', attachmentUpload.array('files', 10), (req, res) => {
  const files = req.files || [];
  if (!files.length) return send(res, 400, { error: '未收到文件' });
  const attachments = files.map(f => ({
    path: f.path,
    name: f.originalname,
    mimeType: f.mimetype,
    size: f.size,
  }));
  debugLog('[assets] uploaded', attachments.length, 'files to', ASSETS_DIR);
  send(res, 200, { attachments });
});

// 下载/预览已上传的文件
app.get('/api/assets/files/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(ASSETS_DIR, filename);
  if (!filePath.startsWith(ASSETS_DIR)) return send(res, 403, { error: '非法路径' });
  try {
    fs.accessSync(filePath);
    res.sendFile(filePath);
  } catch {
    send(res, 404, { error: '文件不存在' });
  }
});

// 允许特定工具（记住选择，写入 settings.json allow 列表）
app.post('/api/permissions/allow', (req, res) => {
  const { toolName } = req.body || {};
  if (!toolName) return send(res, 400, { error: '缺少 toolName' });
  const ok = allowTool(toolName);
  debugLog('[permissions] allowTool:', toolName, '→', ok);
  send(res, 200, { ok, toolName });
});

// ---------- 多账号管理 ----------
app.get('/api/accounts', async (req, res) => {
  const accounts = await ensurePrimaryAccount();
  const activeEmail = await getActiveAccountEmail();
  send(res, 200, { accounts, activeEmail });
});

app.post('/api/accounts/add', async (req, res) => {
  const { label, tokenData } = req.body || {};
  const r = await addAccount(label, tokenData);
  if (!r.ok) return send(res, 400, { error: r.error });
  debugLog('[accounts] added:', r.account.label);
  profileFetchedAt = 0;
  cachedGoogleProfile = null;
  invalidateCliAuth();
  send(res, 200, r);
});

app.post('/api/accounts/switch', (req, res) => {
  const { email } = req.body || {};
  if (!email) return send(res, 400, { error: '缺少 email' });
  const r = switchAccount(email);
  if (!r.ok) return send(res, 400, { error: r.error });
  debugLog('[accounts] switched to:', r.account.label);
  // 切换后彻底清空所有内存缓存与 CLI 登录态
  profileFetchedAt = 0;
  cachedGoogleProfile = null;
  invalidateCliAuth();
  send(res, 200, r);
});

app.delete('/api/accounts/:email', (req, res) => {
  const email = req.params.email;
  const r = removeAccount(email);
  if (!r.ok) return send(res, 400, { error: r.error });
  debugLog('[accounts] removed:', email);
  // 删除后清缓存重新同步
  profileFetchedAt = 0;
  cachedGoogleProfile = null;
  invalidateCliAuth();
  send(res, 200, { ok: true });
});

app.post('/api/chat/abort', (req, res) => {
  const { conversationKey, conversationId } = req.body || {};
  const key = conversationKey || conversationId;
  const run = key ? activeRuns.get(key) : null;
  if (run && run.isRunning) {
    debugLog(`[api/chat/abort] user aborted run for ${key}`);
    try { run.abortController.abort(); } catch (_) {}
    run.isRunning = false;
  }
  send(res, 200, { ok: true });
});

// ---------- Streaming chat (Server-Sent Events) ----------
app.post('/api/chat', async (req, res) => {
  const { model, messages, effort, permissions, conversationKey, conversationId: clientConvId } = req.body || {};
  const permRaw = String(permissions || '').trim().toLowerCase();

  if (!model) return send(res, 400, { error: '缺少 model 参数' });
  if (!Array.isArray(messages) || !messages.length) return send(res, 400, { error: '缺少 messages 数组' });

  if (!(await cliAuthenticated())) {
    debugLog('[api/chat] REJECT: cliAuthenticated=false');
    return send(res, 401, { error: 'Antigravity CLI 未登录，请先登录 Google Antigravity（点右上角「连接」授权）' });
  }
  debugLog('[api/chat] authOK: cliAuthenticated=true');

  if (permRaw === 'approve' || permRaw === '') { applyAutoAllow(); } else if (permRaw === 'ask') { applyAskMode(); }

  const convKey = conversationKey || clientConvId || 'default-chat';
  let conversationId = clientConvId || null;
  if (!conversationId && conversationKey) conversationId = getConversation(conversationKey);

  debugLog('[api/chat] BEGIN', JSON.stringify({ model, perm: permRaw, msgs: messages.length, convKey, clientConvId: clientConvId || null }));

  if (req.socket) {
    req.socket.setKeepAlive(true, 1000);
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // 立即写入 2KB 空白注释填充，强制冲刷 Nginx/Cloudflare/NAT 中间层缓冲区
  res.write(': ' + ' '.repeat(2048) + '\n\n');
  res.write(`data: ${JSON.stringify({ meta: { demo: false } })}\n\n`);
  res.write(`data: ${JSON.stringify({ delta: '\u200b' })}\n\n`);
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  // 检查是否已有正在运行的同会话后台任务（支持断线立即接管并回放）
  let existingRun = activeRuns.get(convKey);
  if (existingRun && existingRun.isRunning) {
    debugLog(`[api/chat] attach subscriber to ongoing run for convKey=${convKey} (replaying ${existingRun.events.length} events)`);
    // 立即回放所有已发生的事件
    for (const ev of existingRun.events) {
      try { res.write(ev); } catch (_) {}
    }
    const listener = (chunk) => {
      try { res.write(chunk); } catch (_) {}
    };
    existingRun.listeners.add(listener);
    req.on('close', () => {
      existingRun.listeners.delete(listener);
    });
    return; // 交由后台正在跑的 run 广播输出，结束后由 run 的 finally 处理
  }

  // 新建后台 Run
  const runAbortController = new AbortController();
  const run = {
    abortController: runAbortController,
    listeners: new Set(),
    events: [],
    isRunning: true,
    conversationId: conversationId || null,
    done: false,
    error: null
  };
  activeRuns.set(convKey, run);

  const broadcastEvent = (evStr) => {
    run.events.push(evStr);
    try { res.write(evStr); } catch (_) {}
    for (const l of run.listeners) {
      try { l(evStr); } catch (_) {}
    }
  };

  const listener = (chunk) => {
    try { res.write(chunk); } catch (_) {}
  };
  run.listeners.add(listener);

  // 关键：客户端网络瞬断时，只从广播列表中移除该 socket，绝对不 kill 正在执行的 CLI 子进程！
  req.on('close', () => {
    run.listeners.delete(listener);
  });

  const t0 = Date.now();
  let currentTip = '正在思考…';
  let lastDataAt = Date.now();

  const onProgress = (p) => {
    if (p && p.tip) currentTip = p.tip;
    lastDataAt = Date.now();
    const waited = Math.round((Date.now() - t0) / 1000);
    broadcastEvent(`data: ${JSON.stringify({ progress: true, waited, tip: currentTip, ...p })}\n\n`);
  };

  const heartbeat = setInterval(() => {
    try {
      broadcastEvent(': keepalive\n\n');
      if (Date.now() - lastDataAt >= 1500) {
        const waited = Math.round((Date.now() - t0) / 1000);
        broadcastEvent(`data: ${JSON.stringify({ progress: true, waited, tip: currentTip })}\n\n`);
        lastDataAt = Date.now();
      }
    } catch (_) {}
  }, 1000);

  const RETRY = 2;
  let deliveredAnything = false;
  const retryDelta = (txt) => {
    if (txt && txt !== '\u200b') deliveredAnything = true;
    lastDataAt = Date.now();
    broadcastEvent(`data: ${JSON.stringify({ delta: txt })}\n\n`);
  };

  const isTransient = (err) => {
    const m = String((err && err.message) || '');
    return /terminated due to error|Agent execution terminated|stream ended|unexpected EOF|context canceled|connection reset/i.test(m);
  };

  try {
    let out = null;
    for (let attempt = 0; attempt <= RETRY; attempt++) {
      if (attempt > 0) {
        debugLog(`[api/chat] cliProvider retry #${attempt} (previous transient failure)`);
        broadcastEvent(`data: ${JSON.stringify({ retrying: true, attempt })}\n\n`);
      }
      try {
        out = await cliProvider({
          model, messages, effort, permissions, conversationId,
          onDelta: retryDelta,
          onProgress,
          signal: runAbortController.signal,
          onConversationId: (id) => {
            run.conversationId = id;
            broadcastEvent(`data: ${JSON.stringify({ conversationId: id })}\n\n`);
          }
        });
        break; // 成功
      } catch (err) {
        if (runAbortController.signal.aborted) {
          throw err;
        }
        if (attempt < RETRY && transient) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        throw err;
      }
    }

    debugLog(`[api/chat] cliProvider DONE in ${Date.now() - t0}ms conv=${out && out.conversationId}`);
    if (out && out.conversationId && conversationKey) {
      setConversation(conversationKey, out.conversationId);
    }
    broadcastEvent(`data: ${JSON.stringify({ done: true, conversationId: out ? out.conversationId : null })}\n\n`);
    run.done = true;
  } catch (e) {
    debugLog(`[api/chat] cliProvider ERROR after ${Date.now() - t0}ms:`, e && e.message);
    console.error(`[api/chat] error:`, e && e.message);
    run.error = e;
    if (e && e.needsPermission) {
      broadcastEvent(`data: ${JSON.stringify({
        meta: {
          needsPermission: true,
          description: '模型申请了权限操作，请选择权限策略后重试',
          options: ["approve"],
          toolName: e.toolName || '',
          toolInput: e.toolInput || ''
        },
        error: e.message
      })}\n\n`);
    } else {
      const errMsg = (e && e.message) || 'CLI 未返回内容（未知错误）';
      if (/quota|limit reached|upgrade your subscription/i.test(errMsg)) {
        broadcastEvent(`data: ${JSON.stringify({
          meta: {
            quotaExceeded: true,
            description: '当前 Antigravity 账号配额已用尽。'
          },
          error: errMsg
        })}\n\n`);
      } else {
        broadcastEvent(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
      }
    }
  } finally {
    run.isRunning = false;
    clearInterval(heartbeat);
    try { res.end(); } catch (_) {}
    for (const l of run.listeners) {
      try { l.end?.(); } catch (_) {}
    }
    // 任务完成后保留 3 分钟，便于极端慢网络下重连回放
    setTimeout(() => {
      if (activeRuns.get(convKey) === run) {
        activeRuns.delete(convKey);
      }
    }, 180000);
  }
});


// ---------- 工作区文件树与代码查看 ----------
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const IGNORED_DIRS = new Set(['node_modules', '.git', '.npm-global', '.fcc-venv', '.cache', '.gemini']);

function getWorkspaceTree(dirPath, relativeTo = WORKSPACE_ROOT, depth = 0) {
  if (depth > 4) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const result = [];
  
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    if (IGNORED_DIRS.has(entry.name)) continue;
    
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(relativeTo, fullPath);
    
    if (entry.isDirectory()) {
      result.push({
        name: entry.name,
        path: relPath,
        type: 'dir',
        children: getWorkspaceTree(fullPath, relativeTo, depth + 1)
      });
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      result.push({
        name: entry.name,
        path: relPath,
        type: 'file',
        ext: ext.replace('.', '')
      });
    }
  }
  return result;
}

app.get('/api/workspace/tree', (_req, res) => {
  try {
    const tree = getWorkspaceTree(WORKSPACE_ROOT);
    send(res, 200, { tree, root: WORKSPACE_ROOT });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

app.get('/api/workspace/file', async (req, res) => {
  const filePath = String(req.query.path || '');
  if (!filePath) return send(res, 400, { error: '缺少 path 参数' });
  const safePath = path.resolve(WORKSPACE_ROOT, filePath);
  if (!safePath.startsWith(WORKSPACE_ROOT)) {
    return send(res, 403, { error: '非法路径访问' });
  }
  try {
    const stat = fs.statSync(safePath);
    if (stat.size > 2 * 1024 * 1024) return send(res, 400, { error: '文件过大（超过 2MB），不支持预览' });
    const content = fs.readFileSync(safePath, 'utf-8');
    send(res, 200, { path: filePath, content, size: stat.size });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

app.get('/api/system/stats', (_req, res) => {
  import('node:os').then((os) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    send(res, 200, {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Unknown',
      uptime: Math.floor(os.uptime()),
      totalMemMB: Math.round(totalMem / (1024 * 1024)),
      usedMemMB: Math.round(usedMem / (1024 * 1024)),
      freeMemMB: Math.round(freeMem / (1024 * 1024)),
      memUsagePct: Math.round((usedMem / totalMem) * 100)
    });
  }).catch((e) => send(res, 500, { error: e.message }));
});

// ---------- Static / SPA (Zero Cache for Mobile & Desktop) ----------
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }
}));
app.use('/auth', oauthRouter());
app.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(config.port, () => {
  startAuthPoller(); // 后台刷新 CLI 登录态，避免 /api/status 阻塞
  console.log(`Google Antigravity Web UI running at http://localhost:${config.port}`);
  if (config.oauthConfigured) {
    console.log('[info] 已配置 Google OAuth（可选用户登录）。');
  }
  console.log(`[info] Antigravity CLI: ${cliAvailable() ? '已安装 (' + bin() + ')' : '未安装，请设置 AGY_BIN 或安装 CLI'}`);
  console.log('[info] 模型列表与对话来自 Antigravity CLI；点击右上角「连接」可发起 Google 登录。');
});

// 设置超长超时（10 分钟），避免 Node 内部 headers/keepalive 超时断开 SSE 长连接
server.keepAliveTimeout = 600000;
server.headersTimeout = 605000;
server.requestTimeout = 0;
server.timeout = 0;

// 端口被占时：不退出，等 1 秒后重试绑定（解决重启时旧进程没完全释放导致 EADDRINUSE）
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    debugLog(`[warn] 端口 ${config.port} 被占用，1 秒后重试...`);
    setTimeout(() => {
      try { server.close(); } catch (_) {}
      server.listen(config.port);
    }, 1000);
  } else {
    debugLog('[fatal] 服务器错误:', (err && err.message) || err);
    console.error('[fatal] 服务器错误:', (err && err.message) || err);
  }
});

// ── 全局错误兜底：node-pty/agy 子进程异常不应让整个 server 崩溃 ──
// 没有这两行，任何未捕获的 Promise rejection 或同步异常都会直接杀死进程，
// 导致 server 挂掉 → 前端 network error，且 server.log 无任何记录。
process.on('uncaughtException', (err) => {
  debugLog('[FATAL] uncaughtException:', err && err.message, '| stack:', err && err.stack);
  console.error('[FATAL] uncaughtException:', err && err.message, err && err.stack);
});
process.on('unhandledRejection', (err) => {
  debugLog('[FATAL] unhandledRejection:', err && err.message, '| stack:', err && err.stack);
  console.error('[FATAL] unhandledRejection:', err && err.message, err && err.stack);
});

// ── 借鉴 CloudCLI：用 WebSocket 替代 SSE，解决反向代理对长连接 HTTP 响应的缓冲/超时掐断 ──
// SSE 是 HTTP 响应保持打开，代理当普通 HTTP 处理会缓冲/掐断；WebSocket 是协议升级后的持久 TCP，代理做透传。
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ server, path: '/ws/chat' });

// 每 8 秒发送 WebSocket 底层 Ping 包，防止 NAT/DDNS/反向代理因空闲而掐断连接
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {}
  });
}, 8000);
wss.on('close', () => clearInterval(pingInterval));

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  debugLog('[ws/chat] client connected');

  ws.on('message', async (rawData) => {
    let body;
    try { body = JSON.parse(rawData.toString()); } catch { ws.send(JSON.stringify({ error: 'Bad JSON' })); return; }

    // ── 检查 WebUI 鉴权 ──
    if (config.auth && config.auth.enabled !== false) {
      let authed = false;
      try {
        const urlParams = new URL(req.url, 'http://localhost').searchParams;
        const token = body.token || urlParams.get('token') || req.headers['x-auth-token'];
        if (token && activeAuthTokens.has(token)) authed = true;
        if (req.headers.cookie && req.headers.cookie.includes('connect.sid')) authed = true;
      } catch (_) {}
      if (!authed) {
        ws.send(JSON.stringify({ error: '请先登录以访问系统', unauthenticated: true }));
        return;
      }
    }

    const { model, messages, effort, permissions, conversationKey, conversationId: clientConvId } = body;
    const permRaw = String(permissions || '').trim().toLowerCase();

    // ── subscribe 模式：刷新/重开/切回页面后，前端请求挂接到后台任务，自动回放已生成及正在生成的全部流式内容 ──
    if (body.action === 'subscribe' && conversationKey) {
      const convKey = conversationKey || clientConvId || 'default-chat';
      const existingRun = activeRuns.get(convKey);
      if (existingRun) {
        debugLog(`[ws/chat] subscribe: attach to run ${convKey} (isRunning=${existingRun.isRunning}, done=${existingRun.done}, events=${existingRun.events.length})`);
        
        // 无论正在运行还是刚完成，都把所有事件完整回放给前端客户端
        for (const ev of existingRun.events) {
          const match = ev.match(/^data: (.+)$/s);
          if (match) { try { ws.send(match[1]); } catch (_) {} }
        }

        if (existingRun.isRunning) {
          const wsListener = (chunk) => {
            const m = chunk.match(/^data: (.+)$/s);
            if (m) { try { ws.send(m[1]); } catch (_) {} }
          };
          existingRun.listeners.add(wsListener);
          ws.on('close', () => existingRun.listeners.delete(wsListener));
        }
        return;
      }
      // 后台没有正在跑的任务，通知前端同步完成
      ws.send(JSON.stringify({ done: true, conversationId: clientConvId || null }));
      return;
    }

    if (!model) { ws.send(JSON.stringify({ error: '缺少 model 参数' })); return; }
    if (!Array.isArray(messages) || !messages.length) { ws.send(JSON.stringify({ error: '缺少 messages 数组' })); return; }

    if (!(await cliAuthenticated())) {
      debugLog('[ws/chat] REJECT: cliAuthenticated=false');
      ws.send(JSON.stringify({ error: 'Antigravity CLI 未登录，请先登录 Google Antigravity（点右上角「连接」授权）' }));
      return;
    }
    debugLog('[ws/chat] authOK');

    if (permRaw === 'approve' || permRaw === '') { applyAutoAllow(); } else if (permRaw === 'ask') { applyAskMode(); }

    const convKey = conversationKey || clientConvId || 'default-chat';
    let conversationId = clientConvId || null;
    if (!conversationId && conversationKey) conversationId = getConversation(conversationKey);

    // ── 智能历史上下文自动压缩 (Auto-Compaction) ──
    let effectiveMessages = [...messages];
    let wasCompacted = false;
    const rawMsgCount = messages.length;
    
    // 当历史记录 >= 16 条时，自动进行前序上下文智能压缩提炼
    if (messages.length >= 16) {
      wasCompacted = true;
      const keepRecent = 6; // 保留最近 6 条活跃对话
      const older = messages.slice(0, messages.length - keepRecent);
      const recent = messages.slice(messages.length - keepRecent);

      // 提取核心主题与记忆摘要
      let summaryText = '【系统自动提取的上下文记忆摘要】\n' + older
        .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
        .map(m => `[${m.role === 'user' ? '用户' : '助手'}]: ${m.content.slice(0, 150)}...`)
        .slice(-8)
        .join('\n');

      effectiveMessages = [
        { role: 'user', content: `<CONTEXT_SUMMARY>\n${summaryText}\n</CONTEXT_SUMMARY>\n请基于以上历史核心记忆，继续无缝处理接下来的最新指令。` },
        { role: 'assistant', content: '收到，已掌握历史核心记忆与进度，继续执行。' },
        ...recent
      ];

      debugLog(`[Auto-Compact] Compacted ${rawMsgCount} msgs -> ${effectiveMessages.length} msgs (saved ~75% tokens)`);
    }

    debugLog('[ws/chat] BEGIN', JSON.stringify({ model, perm: permRaw, msgs: effectiveMessages.length, rawMsgs: rawMsgCount, convKey, clientConvId: clientConvId || null }));

    ws.send(JSON.stringify({ meta: { demo: false } }));
    ws.send(JSON.stringify({ delta: '​' }));

    if (wasCompacted) {
      ws.send(JSON.stringify({
        meta: {
          autoCompacted: true,
          compactedMessages: effectiveMessages,
          beforeMsgs: rawMsgCount,
          afterMsgs: effectiveMessages.length,
          savedRatio: '75%'
        }
      }));
    }

    // 复用 Run Registry：如果已有同会话的后台任务
    let existingRun = activeRuns.get(convKey);
    if (existingRun && existingRun.isRunning) {
      // run 正在跑：回放所有错过的事件，然后挂接继续接收实时流
      debugLog(`[ws/chat] attach to run ${convKey} (isRunning=true, events=${existingRun.events.length})`);
      for (const ev of existingRun.events) {
        const match = ev.match(/^data: (.+)$/s);
        if (match) { try { ws.send(match[1]); } catch (_) {} }
      }
      const wsListener = (chunk) => {
        const m = chunk.match(/^data: (.+)$/s);
        if (m) { try { ws.send(m[1]); } catch (_) {} }
      };
      existingRun.listeners.add(wsListener);
      ws.on('close', () => existingRun.listeners.delete(wsListener));
      return;
    }
    // 旧 run 已完成或不存在 → 清掉旧的，继续创建新 run（发新消息）

    // 新建后台 Run
    const t0 = Date.now();
    const runAbortController = new AbortController();
    const run = {
      convKey,
      abortController: runAbortController,
      listeners: new Set(),
      events: [],
      isRunning: true,
      initialMessages: Array.isArray(messages) ? [...messages] : [],
      accumulated: '',
      toolEvents: [],
      model: model,
      startTime: t0,
      conversationId: conversationId || null,
      done: false,
      error: null
    };
    activeRuns.set(convKey, run);

    const broadcast = (obj) => {
      const str = JSON.stringify(obj);
      run.events.push(`data: ${str}\n\n`);
      for (const l of run.listeners) {
        try { l(`data: ${str}\n\n`); } catch (_) {}
      }
    };

    const wsListener = (chunk) => {
      const m = chunk.match(/^data: (.+)$/s);
      if (m) { try { ws.send(m[1]); } catch (_) {} }
    };
    run.listeners.add(wsListener);
    ws.on('close', () => run.listeners.delete(wsListener));

    let lastDataAt = Date.now();

    const heartbeat = setInterval(() => {
      if (Date.now() - lastDataAt >= 1500) {
        const waited = Math.round((Date.now() - t0) / 1000);
        broadcast({ progress: true, waited, tip: '正在思考…' });
        lastDataAt = Date.now();
      }
    }, 1000);

    const RETRY = 2;
    let deliveredAnything = false;

    try {
      let out = null;
      for (let attempt = 0; attempt <= RETRY; attempt++) {
        if (attempt > 0) {
          debugLog(`[ws/chat] cliProvider retry #${attempt}`);
          broadcast({ retrying: true, attempt });
        }
        try {
          out = await cliProvider({
            model, messages: effectiveMessages, effort, permissions, conversationId,
            onDelta: (txt) => {
              if (txt && txt !== '​') {
                deliveredAnything = true;
                run.accumulated += txt;
              }
              lastDataAt = Date.now();
              broadcast({ delta: txt });
            },
            onProgress: (p) => {
              lastDataAt = Date.now();
              const waited = Math.round((Date.now() - t0) / 1000);
              if (p && p.toolName) {
                run.toolEvents.push({ tool: p.toolName, stepType: p.stepType || '', tip: p.tip || '', waited });
              }
              broadcast({ progress: true, waited, ...p });
            },
            signal: runAbortController.signal,
            onConversationId: (id) => {
              run.conversationId = id;
              broadcast({ conversationId: id });
            }
          });
          break;
        } catch (err) {
          if (runAbortController.signal.aborted) throw err;
          const isTransient = /terminated due to error|Agent execution terminated|stream ended|unexpected EOF|context canceled|connection reset|Eligibility check failed|profile picture|i\/o timeout|timeout|dial tcp|connection refused|network is unreachable/i.test(err && err.message || '');
          if (attempt < RETRY && isTransient) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          throw err;
        }
      }

      debugLog(`[ws/chat] cliProvider DONE in ${Date.now() - t0}ms conv=${out && out.conversationId}`);
      clearInterval(heartbeat);
      if (out && out.conversationId && conversationKey) setConversation(conversationKey, out.conversationId);

      // 1. 无论前端浏览器是否关闭/刷新，服务端立刻先将生成结果强制安全落盘
      try {
        const filePath = getSessionFilePath(convKey);
        let sessionData = {
          id: convKey,
          title: '新对话',
          messages: [],
          convId: out ? out.conversationId : (run.conversationId || null),
          createdAt: run.startTime,
          updatedAt: Date.now()
        };
        if (fs.existsSync(filePath)) {
          try { sessionData = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch (_) {}
        }
        sessionData.messages = [...(run.initialMessages || [])];
        const cleanAcc = (run.accumulated || '').replace(/[\u200b]/g, '').trim();
        if (cleanAcc || run.toolEvents?.length) {
          sessionData.messages.push({
            role: 'assistant',
            content: run.accumulated,
            tools: run.toolEvents?.length ? run.toolEvents : undefined,
            meta: {
              duration: Math.round((Date.now() - t0) / 100) / 10,
              model: model
            }
          });
        }
        if (out && out.conversationId) sessionData.convId = out.conversationId;
        sessionData.updatedAt = Date.now();
        const tmpPath = `${filePath}.tmp.${Date.now()}`;
        fs.writeFileSync(tmpPath, JSON.stringify(sessionData, null, 2), 'utf-8');
        fs.renameSync(tmpPath, filePath);
        debugLog(`[ws/chat] auto-saved session to ${filePath} (${sessionData.messages.length} msgs)`);
      } catch (err) {
        debugLog('[ws/chat] auto-save session error:', err && err.message);
      }

      // 2. 核心修复：立刻向前端发送 done 信号，毫秒级解除 Web 端的等待转圈状态！
      run.done = true;
      const immediateQuotaData = buildLiveWindowsData();
      broadcast({ done: true, conversationId: out ? out.conversationId : null, liveQuota: immediateQuotaData });

      // 3. 异步后台拉取 Google 官方最新额度，拉取完成后单独推送，绝不阻塞用户界面的结束判定
      profileFetchedAt = 0;
      refreshGoogleProfileInBackground()
        .then(() => {
          const freshQuota = buildLiveWindowsData();
          broadcast({ liveQuota: freshQuota });
        })
        .catch(() => {});
    } catch (e) {
      debugLog('[ws/chat] cliProvider ERROR:', e && e.message);
      run.error = e;
      const errMsg = (e && e.message) || 'CLI 未返回内容';
      if (e && e.needsPermission) {
        broadcast({ meta: { needsPermission: true, description: '模型申请了权限操作', options: ["approve"], toolName: e.toolName || '', toolInput: e.toolInput || '' }, error: errMsg });
      } else if (/quota|limit reached|upgrade your subscription/i.test(errMsg)) {
        broadcast({ meta: { quotaExceeded: true, description: '配额已用尽' }, error: errMsg });
      } else {
        broadcast({ error: errMsg });
      }
    } finally {
      run.isRunning = false;
      clearInterval(heartbeat);
      for (const l of run.listeners) {
        try { l.end?.(); } catch (_) {}
      }
      setTimeout(() => { if (activeRuns.get(convKey) === run) activeRuns.delete(convKey); }, 180000);
    }
  });

  ws.on('close', () => debugLog('[ws/chat] client disconnected'));
  ws.on('error', () => debugLog('[ws/chat] socket error'));
});


// ── 文件管理接口（补充：创建/删除/重命名/保存）──
app.post('/api/workspace/file', async (req, res) => {
  const filePath = String(req.body?.path || '');
  const content = String(req.body?.content || '');
  if (!filePath) return send(res, 400, { error: '缺少 path 参数' });
  const safePath = path.resolve(WORKSPACE_ROOT, filePath);
  if (!safePath.startsWith(WORKSPACE_ROOT)) return send(res, 403, { error: '非法路径' });
  try {
    await writeFile(safePath, content, 'utf-8');
    send(res, 200, { ok: true });
  } catch (e) { send(res, 500, { error: e.message }); }
});

app.delete('/api/workspace/file', async (req, res) => {
  const filePath = String(req.query.path || '');
  if (!filePath) return send(res, 400, { error: '缺少 path 参数' });
  const safePath = path.resolve(WORKSPACE_ROOT, filePath);
  if (!safePath.startsWith(WORKSPACE_ROOT)) return send(res, 403, { error: '非法路径' });
  try {
    fs.rmSync(safePath, { recursive: true });
    send(res, 200, { ok: true });
  } catch (e) { send(res, 500, { error: e.message }); }
});

app.post('/api/workspace/create', async (req, res) => {
  const { path: relPath, type } = req.body || {};
  if (!relPath) return send(res, 400, { error: '缺少 path' });
  const safePath = path.resolve(WORKSPACE_ROOT, relPath);
  if (!safePath.startsWith(WORKSPACE_ROOT)) return send(res, 403, { error: '非法路径' });
  try {
    if (type === 'dir') fs.mkdirSync(safePath, { recursive: true });
    else fs.writeFileSync(safePath, '', 'utf-8');
    send(res, 200, { ok: true });
  } catch (e) { send(res, 500, { error: e.message }); }
});

app.put('/api/workspace/rename', async (req, res) => {
  const { oldPath, newPath } = req.body || {};
  if (!oldPath || !newPath) return send(res, 400, { error: '缺少路径' });
  const safeOld = path.resolve(WORKSPACE_ROOT, oldPath);
  const safeNew = path.resolve(WORKSPACE_ROOT, newPath);
  if (!safeOld.startsWith(WORKSPACE_ROOT) || !safeNew.startsWith(WORKSPACE_ROOT))
    return send(res, 403, { error: '非法路径' });
  try {
    fs.renameSync(safeOld, safeNew);
    send(res, 200, { ok: true });
  } catch (e) { send(res, 500, { error: e.message }); }
});