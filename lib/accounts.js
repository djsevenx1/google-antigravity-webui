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

// 自动使用 refresh_token 刷新 Google Access Token
export async function refreshAccessToken(tokenData) {
  const rf = tokenData?.token?.refresh_token;
  if (!rf) return tokenData;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: rf
      }).toString(),
      signal: AbortSignal.timeout(8000)
    });

    const json = await res.json();
    if (json.access_token) {
      tokenData.token.access_token = json.access_token;
      if (json.refresh_token) tokenData.token.refresh_token = json.refresh_token;
      const expiresInSec = json.expires_in || 3600;
      tokenData.token.expiry = new Date(Date.now() + expiresInSec * 1000).toISOString();
      return tokenData;
    }
  } catch (err) {
    console.error('[accounts] Token refresh error:', err.message);
  }
  return tokenData;
}

// 检查 Token 是否过期（留出 5 分钟缓冲时间），如果过期则自动刷新
export async function ensureValidToken(tokenData) {
  if (!tokenData || !tokenData.token) return tokenData;
  const expiryStr = tokenData.token.expiry;
  let isExpired = false;
  if (expiryStr) {
    const expiryTime = new Date(expiryStr).getTime();
    if (isNaN(expiryTime) || expiryTime - Date.now() < 5 * 60 * 1000) {
      isExpired = true;
    }
  } else {
    isExpired = true;
  }

  if (isExpired && tokenData.token.refresh_token) {
    return await refreshAccessToken(tokenData);
  }
  return tokenData;
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

export async function switchAccount(email) {
  const accounts = listAccounts();
  const acc = accounts.find(a => a.email === email || a.label === email);
  if (!acc) return { ok: false, error: '账号不存在' };

  // 1. 写入目标账号的 Token 到 CLI 的 antigravity-oauth-token
  writeActiveToken(acc.tokenData);

  // 2. 通过执行一次 CLI 命令触发 Antigravity 官方底层的 OAuth2 自动刷新机制
  try {
    const { execFile } = await import('node:child_process');
    const agyBin = process.env.AGY_BIN || '/vol1/@apphome/GoogleAntigravityCLI/bin/antigravity';
    await new Promise((resolve) => {
      execFile(agyBin, ['models'], { timeout: 15000 }, () => resolve());
    });
  } catch (_) {}

  // 3. 读取 CLI 刷新后的最新 Token 并同步保存回 accounts.json
  const freshToken = readActiveToken();
  if (freshToken && freshToken.token) {
    acc.tokenData = freshToken;
    const profile = await fetchProfile(freshToken);
    if (profile) {
      if (profile.name) acc.name = profile.name;
      if (profile.picture) acc.picture = profile.picture;
    }
    saveAccounts(accounts);
  }

  // 4. 清除旧账号的 Profile 缓存文件
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

  // 如果删除的是当前正在使用的账号，自动回滚切回默认主账号
  const primary = filtered.find(a => a.isPrimary) || filtered[0];
  if (primary) {
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
  syncActiveTokenToAccount();
  const tokenData = readActiveToken();
  if (!tokenData) return null;
  const activeRefreshToken = tokenData.token?.refresh_token;
  
  const accounts = listAccounts();
  const acc = accounts.find(a => {
    if (activeRefreshToken && a.tokenData?.token?.refresh_token === activeRefreshToken) {
      return true;
    }
    if (a.tokenData?.token?.access_token === tokenData.token?.access_token) {
      return true;
    }
    return JSON.stringify(a.tokenData) === JSON.stringify(tokenData);
  });
  
  return acc ? acc.email : null;
}
