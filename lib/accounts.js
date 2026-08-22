// 多账号管理：存储多个 Google 账号的 token，切换时替换 agy CLI 的 token 文件
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI_DIR = path.join(os.homedir(), '.gemini', 'antigravity-cli');
const CLI_DIR_ALT = '/vol5/@apphome/claude code/.gemini/antigravity-cli';
const ACCOUNTS_FILE = path.join(process.cwd(), 'data', 'accounts.json');

export function readActiveToken() {
  for (const dir of [CLI_DIR, CLI_DIR_ALT]) {
    const f = path.join(dir, 'antigravity-oauth-token');
    try {
      return JSON.parse(fs.readFileSync(f, 'utf-8'));
    } catch (_) {}
  }
  return null;
}

export function writeActiveToken(tokenData) {
  const json = typeof tokenData === 'string' ? tokenData : JSON.stringify(tokenData);
  for (const dir of [CLI_DIR, CLI_DIR_ALT]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'antigravity-oauth-token'), json, 'utf-8');
    } catch (_) {}
  }
}

// 用 access_token 调 Google API 获取用户资料
async function fetchProfile(tokenData) {
  const token = tokenData?.token?.access_token;
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

export function switchAccount(email) {
  const accounts = listAccounts();
  const acc = accounts.find(a => a.email === email || a.label === email);
  if (!acc) return { ok: false, error: '账号不存在' };
  writeActiveToken(acc.tokenData);
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

export async function getActiveAccountEmail() {
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
