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

export async function addAccount(label) {
  const tokenData = readActiveToken();
  if (!tokenData) return { ok: false, error: '没有活跃的 token' };
  const accounts = listAccounts();

  // 用 access_token 调 Google API 拿 email/name/picture
  const profile = await fetchProfile(tokenData);
  const email = profile?.email || '';
  const name = profile?.name || '';
  const picture = profile?.picture || '';

  if (!email) return { ok: false, error: '无法获取账号 email，请确认已登录' };

  var info = {
    email: email,
    name: name,
    picture: picture,
    authMethod: tokenData.auth_method || 'consumer',
    addedAt: Date.now(),
    tokenData: tokenData,
    label: label || email || '账号' + (accounts.length + 1)
  };
  const idx = accounts.findIndex(a => a.email === info.email);
  if (idx >= 0) accounts[idx] = info; else accounts.push(info);
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
  const filtered = accounts.filter(a => a.email !== email);
  saveAccounts(filtered);
  return { ok: true };
}

export async function getActiveAccountEmail() {
  const tokenData = readActiveToken();
  if (!tokenData) return null;
  // token 文件没有 email，需要查 accounts.json 里哪个 tokenData 匹配
  const accounts = listAccounts();
  const acc = accounts.find(a => JSON.stringify(a.tokenData) === JSON.stringify(tokenData));
  return acc ? acc.email : null;
}
