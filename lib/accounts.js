// 多账号管理：存储多个 Google 账号的 token，切换时自动刷新并替换 agy CLI 的 token 文件
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || Buffer.from('MTA3MTAwNjA2MDU5MS10bWhzc2luMmgyMWxjcmUyMzV2dG9sb2poNGc0MDNlcC5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbQ==', 'base64').toString('utf-8');
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || Buffer.from('R0NDU1BYLUs1OEZXUjQ4NkxkTEoxbUxCOHNYQzR6NnFEQWY=', 'base64').toString('utf-8');

const CLI_DIRS = [
  path.join(os.homedir(), '.gemini', 'antigravity-cli'),
  '/vol1/@apphome/GoogleAntigravityCLI/home/.gemini/antigravity-cli',
  '/vol5/@apphome/claude code/.gemini/antigravity-cli'
];
const ACCOUNTS_FILE = path.join(process.cwd(), 'data', 'accounts.json');

// 自动使用 CLI 原生机制与磁盘文件同步 Google Access Token
export async function refreshAccessToken(tokenData) {
  // 1. 优先检查磁盘上的 antigravity-oauth-token 是否已有更新的有效 token
  const active = readActiveToken();
  if (active?.token?.access_token) {
    const expiry = active.token.expiry;
    if (expiry && (new Date(expiry).getTime() - Date.now() > 2 * 60 * 1000)) {
      syncActiveTokenToAccount();
      return active;
    }
  }

  // 2. 触发 CLI 二进制内部自动刷新 Token
  try {
    const { fetchModels } = await import('./cli.js');
    await fetchModels();
    const fresh = readActiveToken();
    if (fresh?.token?.access_token) {
      syncActiveTokenToAccount();
      return fresh;
    }
  } catch (_) {}

  return tokenData || active;
}

// 检查 Token 是否过期（留出 3 分钟缓冲时间），如果过期则自动刷新
export async function ensureValidToken(tokenData) {
  const active = readActiveToken();
  const target = tokenData || active;
  if (!target || !target.token) return target;

  const expiryStr = target.token.expiry;
  let isExpired = false;
  if (expiryStr) {
    const expiryTime = new Date(expiryStr).getTime();
    if (isNaN(expiryTime) || expiryTime - Date.now() < 3 * 60 * 1000) {
      isExpired = true;
    }
  } else {
    isExpired = true;
  }

  if (!isExpired && target.token.access_token) {
    return target;
  }

  return await refreshAccessToken(target);
}

export function readActiveToken() {
  for (const dir of CLI_DIRS) {
    const f = path.join(dir, 'antigravity-oauth-token');
    try {
      if (fs.existsSync(f)) {
        return JSON.parse(fs.readFileSync(f, 'utf-8'));
      }
    } catch (_) {}
  }
  return null;
}

export function writeActiveToken(tokenData) {
  const json = typeof tokenData === 'string' ? tokenData : JSON.stringify(tokenData, null, 2);
  for (const dir of CLI_DIRS) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'antigravity-oauth-token'), json, 'utf-8');
    } catch (_) {}
  }
}

// 用 access_token 调 Google API 获取用户资料
async function fetchProfile(tokenData) {
  if (!tokenData) return null;
  const validToken = await ensureValidToken(tokenData);
  const token = validToken?.token?.access_token;
  if (!token) return null;
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) return await res.json();
  } catch (_) {}
  return null;
}

// 刷新并修复所有保存的账号 Token
export async function refreshAllAccountsTokens() {
  const accounts = listAccounts();
  let updated = false;
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    if (acc.tokenData?.token?.refresh_token) {
      const freshToken = await refreshAccessToken(acc.tokenData);
      if (freshToken?.token?.access_token) {
        acc.tokenData = freshToken;
        const profile = await fetchProfile(freshToken);
        if (profile) {
          if (profile.name) acc.name = profile.name;
          if (profile.picture) acc.picture = profile.picture;
        }
        updated = true;
      }
    }
  }
  if (updated) {
    saveAccounts(accounts);
  }
  return accounts;
}

export function listAccounts() {
  try {
    const data = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch (_) { return []; }
}

export function saveAccounts(accounts) {
  try {
    fs.mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
  } catch (_) {}
}

// 确保系统默认主账号（第一次登录的账号）通过 Google 官方 API 动态获取并锁定保护
export async function ensurePrimaryAccount() {
  const accounts = listAccounts();
  const activeToken = readActiveToken();
  if (!activeToken) return accounts;

  // 如果列表为空，实时调用 Google 官方接口动态读取真实账号并录入为【默认主账号】
  if (accounts.length === 0) {
    const profile = await fetchProfile(activeToken);
    if (profile && profile.email) {
      const primaryAcc = {
        email: profile.email,
        name: profile.name || profile.email.split('@')[0],
        picture: profile.picture || '',
        authMethod: activeToken.auth_method || 'consumer',
        addedAt: Date.now(),
        tokenData: activeToken,
        label: '默认主账号 (' + profile.email + ')',
        isPrimary: true
      };
      accounts.push(primaryAcc);
      saveAccounts(accounts);
      return accounts;
    }
  }

  // 保证列表中有且仅有一个 isPrimary
  let hasPrimary = accounts.some(a => a.isPrimary);
  if (!hasPrimary && accounts.length > 0) {
    accounts[0].isPrimary = true;
    if (!accounts[0].label.includes('默认主账号')) {
      accounts[0].label = '默认主账号 (' + accounts[0].email + ')';
    }
    saveAccounts(accounts);
  }

  return accounts;
}

export async function addAccount(label, providedToken) {
  await ensurePrimaryAccount();
  const tokenData = providedToken || readActiveToken();
  if (!tokenData) return { ok: false, error: '没有活跃的 token' };
  const accounts = listAccounts();

  // 用 access_token 调 Google API 拿 email/name/picture
  const profile = await fetchProfile(tokenData);
  const email = profile?.email || '';
  const name = profile?.name || '';
  const picture = profile?.picture || '';

  if (!email) return { ok: false, error: '无法获取账号 email，请确认已登录' };

  const isFirst = accounts.length === 0;
  const info = {
    email: email,
    name: name,
    picture: picture,
    authMethod: tokenData.auth_method || 'consumer',
    addedAt: Date.now(),
    tokenData: tokenData,
    label: label || (isFirst ? ('默认主账号 (' + email + ')') : email),
    isPrimary: isFirst
  };

  const idx = accounts.findIndex(a => a.email === info.email);
  if (idx >= 0) {
    // 保留已有的 isPrimary 属性
    info.isPrimary = accounts[idx].isPrimary || isFirst;
    accounts[idx] = info;
  } else {
    accounts.push(info);
  }

  saveAccounts(accounts);
  return { ok: true, account: info };
}

const ACTIVE_ACCOUNT_FILE = path.join(process.cwd(), 'data', 'active_account.json');

export function setActiveAccountEmail(email) {
  if (!email) return;
  try {
    fs.mkdirSync(path.dirname(ACTIVE_ACCOUNT_FILE), { recursive: true });
    fs.writeFileSync(ACTIVE_ACCOUNT_FILE, JSON.stringify({ email, updatedAt: Date.now() }, null, 2), 'utf-8');
  } catch (_) {}
  const accounts = listAccounts();
  let changed = false;
  for (const acc of accounts) {
    const shouldBeActive = (acc.email === email);
    if (acc.isActive !== shouldBeActive) {
      acc.isActive = shouldBeActive;
      changed = true;
    }
  }
  if (changed) saveAccounts(accounts);
}

export async function switchAccount(email) {
  const accounts = listAccounts();
  const acc = accounts.find(a => a.email === email || a.label === email);
  if (!acc) return { ok: false, error: '账号不存在' };

  // 1. 显式锁定当前账号为唯一激活账号
  setActiveAccountEmail(acc.email);

  // 2. 写入目标账号的 Token 到 CLI 的 antigravity-oauth-token
  writeActiveToken(acc.tokenData);

  // 3. 检查 Token 是否需要刷新，如果 access_token 为空或已过期，通过 CLI 自动刷新
  const expiry = acc.tokenData?.token?.expiry;
  const isExp = !acc.tokenData?.token?.access_token || !expiry || (new Date(expiry).getTime() - Date.now() < 3 * 60 * 1000);
  if (isExp) {
    try {
      const { fetchModels } = await import('./cli.js');
      await fetchModels();
      const fresh = readActiveToken();
      if (fresh?.token?.access_token) {
        acc.tokenData = fresh;
      }
    } catch (_) {}
  }

  // 4. 读取用户 Profile 并保存
  if (!acc.name || !acc.picture) {
    const profile = await fetchProfile(acc.tokenData);
    if (profile) {
      if (profile.name) acc.name = profile.name;
      if (profile.picture) acc.picture = profile.picture;
    }
  }
  saveAccounts(accounts);

  // 5. 清除旧账号的 Profile 缓存文件
  try {
    const profileCacheFile = path.join(process.cwd(), 'data', 'google_profile_cache.json');
    if (fs.existsSync(profileCacheFile)) fs.unlinkSync(profileCacheFile);
  } catch (_) {}

  return { ok: true, account: acc };
}

export function removeAccount(email) {
  const accounts = listAccounts();
  const target = accounts.find(a => a.email === email);
  if (!target) return { ok: false, error: '账号不存在' };

  // 👑 默认主账号不可删除安全锁
  if (target.isPrimary) {
    return { ok: false, error: '默认主账号不可删除，保障系统基础登录态' };
  }

  if (accounts.length <= 1) {
    return { ok: false, error: '至少需要保留一个生效账号，不可全部删除' };
  }

  const filtered = accounts.filter(a => a.email !== email);
  saveAccounts(filtered);

  // 如果删除的是当前正在使用的账号，切回默认主账号
  const primary = filtered.find(a => a.isPrimary) || filtered[0];
  if (primary) {
    setActiveAccountEmail(primary.email);
    writeActiveToken(primary.tokenData);
  }

  return { ok: true };
}

export function syncActiveTokenToAccount() {
  const tokenData = readActiveToken();
  if (!tokenData || !tokenData.token) return;
  const accounts = listAccounts();
  const activeRt = tokenData.token?.refresh_token;
  if (!activeRt) return;
  const idx = accounts.findIndex(a => a.tokenData?.token?.refresh_token === activeRt);
  if (idx >= 0) {
    if (JSON.stringify(accounts[idx].tokenData) !== JSON.stringify(tokenData)) {
      accounts[idx].tokenData = tokenData;
      saveAccounts(accounts);
    }
  }
}

export async function getActiveAccountEmail() {
  try {
    if (fs.existsSync(ACTIVE_ACCOUNT_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACTIVE_ACCOUNT_FILE, 'utf-8'));
      if (data && data.email) return data.email;
    }
  } catch (_) {}
  const accounts = listAccounts();
  const activeAcc = accounts.find(a => a.isActive);
  if (activeAcc) return activeAcc.email;
  const primary = accounts.find(a => a.isPrimary) || accounts[0];
  return primary ? primary.email : null;
}

export function getActiveAccount() {
  const activeEmail = (() => {
    try {
      if (fs.existsSync(ACTIVE_ACCOUNT_FILE)) {
        const data = JSON.parse(fs.readFileSync(ACTIVE_ACCOUNT_FILE, 'utf-8'));
        if (data && data.email) return data.email;
      }
    } catch (_) {}
    return null;
  })();

  const accounts = listAccounts();
  if (!accounts || accounts.length === 0) return null;
  const acc = (activeEmail ? accounts.find(a => a.email === activeEmail) : null) ||
              accounts.find(a => a.isActive) ||
              accounts.find(a => a.isPrimary) ||
              accounts[0];
  return acc || null;
}

export function updateAccountQuota(email, quotaSummary, quotaBuckets) {
  if (!email) return null;
  const accounts = listAccounts();
  const idx = accounts.findIndex(a => a.email === email);
  if (idx >= 0) {
    if (quotaSummary) {
      accounts[idx].quotaSummary = quotaSummary;
      syncAccountLocalQuota(email, quotaSummary);
    }
    if (quotaBuckets) accounts[idx].quotaBuckets = quotaBuckets;
    accounts[idx].quotaUpdatedAt = Date.now();
    saveAccounts(accounts);
    return accounts[idx];
  }
  return null;
}

export function syncAccountLocalQuota(email, quotaSummary) {
  if (!email || !quotaSummary?.groups) return null;
  const accounts = listAccounts();
  const acc = accounts.find(a => a.email === email);
  if (!acc) return null;

  const geminiGroup = quotaSummary.groups.find(g => (g.displayName || '').toLowerCase().includes('gemini')) || quotaSummary.groups[0];
  const claudeGroup = quotaSummary.groups.find(g => (g.displayName || '').toLowerCase().includes('claude') || (g.displayName || '').toLowerCase().includes('gpt') || (g.displayName || '').toLowerCase().includes('3p')) || quotaSummary.groups[1];

  const geminiWeeklyB = geminiGroup?.buckets?.find(b => b.window === 'weekly' || b.bucketId?.includes('weekly')) || geminiGroup?.buckets?.[0];
  const gemini5hB = geminiGroup?.buckets?.find(b => b.window === '5h' || b.bucketId?.includes('5h')) || geminiGroup?.buckets?.[1];

  const claudeWeeklyB = claudeGroup?.buckets?.find(b => b.window === 'weekly' || b.bucketId?.includes('weekly')) || claudeGroup?.buckets?.[0];
  const claude5hB = claudeGroup?.buckets?.find(b => b.window === '5h' || b.bucketId?.includes('5h')) || claudeGroup?.buckets?.[1];

  acc.localQuota = {
    gemini5h: {
      remainingFraction: gemini5hB && gemini5hB.remainingFraction != null ? gemini5hB.remainingFraction : 1.0,
      resetTime: gemini5hB?.resetTime || null
    },
    geminiWeekly: {
      remainingFraction: geminiWeeklyB && geminiWeeklyB.remainingFraction != null ? geminiWeeklyB.remainingFraction : 1.0,
      resetTime: geminiWeeklyB?.resetTime || null
    },
    claude5h: {
      remainingFraction: claude5hB && claude5hB.remainingFraction != null ? claude5hB.remainingFraction : 1.0,
      resetTime: claude5hB?.resetTime || null
    },
    claudeWeekly: {
      remainingFraction: claudeWeeklyB && claudeWeeklyB.remainingFraction != null ? claudeWeeklyB.remainingFraction : 1.0,
      resetTime: claudeWeeklyB?.resetTime || null
    },
    lastCalibrate: Date.now(),
    lastDeduct: null
  };
  acc.quotaUpdatedAt = Date.now();
  saveAccounts(accounts);
  return acc.localQuota;
}

export function deductAccountQuota(email, model, totalTokens) {
  if (!email || !totalTokens || totalTokens <= 0) return null;
  const accounts = listAccounts();
  const acc = accounts.find(a => a.email === email);
  if (!acc) return null;

  // 若尚未初始化 localQuota，先用 quotaSummary 初始化
  if (!acc.localQuota && acc.quotaSummary) {
    syncAccountLocalQuota(email, acc.quotaSummary);
  }
  if (!acc.localQuota) return null;

  const isClaude = String(model || '').toLowerCase().includes('claude') || String(model || '').toLowerCase().includes('gpt') || String(model || '').toLowerCase().includes('oss');
  const prefix = isClaude ? 'claude' : 'gemini';

  const modelLower = String(model || '').toLowerCase();
  let weight = 1;
  if (modelLower.includes('opus')) weight = 15;
  else if (modelLower.includes('sonnet')) weight = 3;
  else if (modelLower.includes('pro') && !modelLower.includes('flash')) weight = 5;
  else if (modelLower.includes('gpt') || modelLower.includes('oss')) weight = 1;

  // 算力池容量（按 tokens 计算比例）
  // 5 小时滚动算力池总额度约 5,000,000 标准 token 算力
  // 周度旗舰配额总额度约 30,000,000 标准 token 算力
  const CAPACITY_5H = 5000000;
  const CAPACITY_WEEKLY = 30000000;

  const consumedTokens = totalTokens * weight;
  const fraction5h = consumedTokens / CAPACITY_5H;
  const fractionWeekly = consumedTokens / CAPACITY_WEEKLY;

  const key5h = `${prefix}5h`;
  const keyW = `${prefix}Weekly`;

  // 1. 扣减 5h 算力池
  if (acc.localQuota[key5h]) {
    const w5 = acc.localQuota[key5h];
    if (w5.resetTime && Date.now() >= new Date(w5.resetTime).getTime()) {
      w5.remainingFraction = 1.0;
      w5.resetTime = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
    }
    w5.remainingFraction = Math.max(0, Math.min(1.0, w5.remainingFraction - fraction5h));
  }

  // 2. 扣减周度算力池
  if (acc.localQuota[keyW]) {
    const ww = acc.localQuota[keyW];
    if (ww.resetTime && Date.now() >= new Date(ww.resetTime).getTime()) {
      ww.remainingFraction = 1.0;
      ww.resetTime = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    }
    ww.remainingFraction = Math.max(0, Math.min(1.0, ww.remainingFraction - fractionWeekly));
  }

  acc.localQuota.lastDeduct = Date.now();
  saveAccounts(accounts);
  return acc.localQuota;
}

