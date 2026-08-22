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

export function extractAccountInfo(tokenData) {
  if (!tokenData) return null;
  const t = tokenData.token || {};
  return {
    email: t.email || tokenData.email || '',
    name: t.name || '',
    picture: t.picture || '',
    authMethod: tokenData.auth_method || 'consumer',
    addedAt: Date.now(),
    tokenData: tokenData,
  };
}

export function addAccount(label) {
  const tokenData = readActiveToken();
  if (!tokenData) return { ok: false, error: '没有活跃的 token' };
  const accounts = listAccounts();
  const info = extractAccountInfo(tokenData);
  if (!info) return { ok: false, error: '无法解析 token' };
  info.label = label || info.email || '账号' + (accounts.length + 1);
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

export function getActiveAccountEmail() {
  const tokenData = readActiveToken();
  if (!tokenData) return null;
  const t = tokenData.token || {};
  return t.email || tokenData.email || null;
}
