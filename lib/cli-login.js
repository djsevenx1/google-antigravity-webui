import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { bin, invalidateCliAuth } from './cli.js';

// 一次只允许一个进行中的 CLI 登录
const logins = new Map();

const URL_RE = /https:\/\/accounts\.google\.com[^\s'"<>]+/i;
const READY_RE = /paste the authorization code|waiting for authentication/i;
const FAIL_RE = /authentication (failed|interrupted)|sign in/i;

// CLI 需要 PTY 才会在无显示器环境下进入 out-of-band 登录模式。
// `script` 能分配一个 PTY；有它就走 OOB 贴码流程，否则走原生（本机浏览器自动打开）流程。
let _hasScript = null;
function hasScript() {
  if (_hasScript !== null) return _hasScript;
  try {
    execFileSync('script', ['--version'], { stdio: 'ignore' });
    _hasScript = true;
  } catch {
    try { fs.accessSync('/usr/bin/script'); _hasScript = true; } catch { _hasScript = false; }
  }
  return _hasScript;
}

function spawnCliLogin(id) {
  const fakeHome = path.join(os.tmpdir(), 'agy-login-' + id);
  fs.mkdirSync(path.join(fakeHome, '.gemini', 'antigravity-cli'), { recursive: true });
  
  const env = { 
    ...process.env, 
    SSH_CONNECTION: process.env.SSH_CONNECTION || 'remote', 
    NO_COLOR: '1',
    HOME: fakeHome
  };

  let child;
  if (hasScript()) {
    child = spawn('script', ['-qec', `'${bin()}' --print ping`, '/dev/null'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  } else {
    child = spawn(bin(), ['--print', 'ping'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  }
  return { child, fakeHome };
}

function makeLogin(id) {
  return {
    id,
    child: null,
    fakeHome: null,
    url: null,
    urlReady: false,
    codeReady: false,
    output: '',
    settled: false,
    createdAt: Date.now()
  };
}

/**
 * 启动一次 CLI 登录（远程/无显示器的 out-of-band 流程）。
 * 成功返回 { ok:true, id, url }；失败返回 { ok:false, error }。
 */
export async function cliLoginStart() {
  // 每次添加新账号，清理之前所有未完成的旧登录，确保分配全新的隔离环境与 PKCE
  for (const [id, l] of logins) {
    cleanupLogin(id);
  }

  const id = crypto.randomBytes(8).toString('hex');
  const login = makeLogin(id);
  logins.set(id, login);

  const { child, fakeHome } = spawnCliLogin(id);
  login.child = child;
  login.fakeHome = fakeHome;

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  const push = (s) => {
    login.output = (login.output + s).slice(-8000);
    if (!login.url && URL_RE.test(login.output)) {
      const m = login.output.match(URL_RE);
      if (m) login.url = m[0];
    }
    // agy 打印授权 URL 后即进入“等待贴回 code”状态（实测：出 URL 后读 stdin 做 token 交换），无需额外提示词
    if (!login.codeReady && (READY_RE.test(login.output) || login.url)) login.codeReady = true;
  };
  child.stdout.on('data', push);
  child.stderr.on('data', push);

  const finalize = () => {
    if (login.settled) return;
    login.settled = true;
    // 保留一小段时间供 start 端读取结果，随后清理
    setTimeout(() => { logins.delete(id); }, 60_000);
  };
  child.on('close', finalize);
  child.on('error', (e) => {
    login.error = String(e.message);
    finalize();
  });
  child.stdin.on('error', () => {}); // 忽略 EPIPE

  // 等待授权 URL 出现
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (login.url) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!login.url) {
    cleanupLogin(id);
    return { ok: false, error: login.error || login.output.slice(-300) || 'CLI 未输出授权链接' };
  }
  return { ok: true, id, url: login.url };
}

/**
 * 把用户贴回的授权 code 写进 CLI stdin 完成登录。
 */
export function cliLoginComplete(id, code) {
  const login = logins.get(id);
  if (!login) return { ok: false, error: '登录会话不存在或已过期，请重新开始' };
  if (login.settled) return { ok: false, error: '登录会话已结束，请重新开始' };
  if (!login.codeReady) return { ok: false, error: 'CLI 尚未进入等待 code 状态，请稍候' };
  if (login.codeSent) return { ok: false, error: 'code 已提交一次' };
  login.codeSent = true;

  const raw = String(code || '').trim();
  // 允许粘贴整个 oauth-callback 跳转地址，自动抽取 code 参数
  let clean = raw;
  if (/[?&#]code=/i.test(raw)) {
    const m = raw.match(/[?&#]code=([^&#]+)/i);
    if (m) clean = decodeURIComponent(m[1]);
  }
  if (!clean) return { ok: false, error: 'code 不能为空' };
  login.child.stdin.write(clean + '\n');
  return { ok: true };
}

/**
 * 读取登录结果。轮询用。返回 { status: 'pending'|'success'|'error'|'gone', output }。
 */
export function cliLoginStatus(id) {
  const login = logins.get(id);
  if (!login) return { status: 'gone', output: '' };
  if (login.error) return { status: 'error', output: login.output, error: login.error };
  if (login.settled) {
    const out = login.output;
    const bad = FAIL_RE.test(out) || /token exchange.*fail|network|resource_endpoint/i.test(out);
    let tokenData = null;
    if (!bad) {
      invalidateCliAuth();
      if (login.fakeHome) {
        const tokenPath = path.join(login.fakeHome, '.gemini', 'antigravity-cli', 'antigravity-oauth-token');
        try {
          if (fs.existsSync(tokenPath)) {
            tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
          }
        } catch (_) {}
      }
    }
    if (login.fakeHome) {
      try { fs.rmSync(login.fakeHome, { recursive: true, force: true }); } catch (_) {}
    }
    return { status: bad ? 'error' : 'success', output: out, tokenData };
  }
  return { status: 'pending', output: login.output };
}

export function cliLoginCancel(id) {
  const login = logins.get(id);
  if (login) cleanupLogin(id);
}


function cleanupStale() {
  const now = Date.now();
  for (const [id, l] of logins) {
    if (l.settled || now - l.createdAt > 180_000) cleanupLogin(id);
  }
}

function cleanupLogin(id) {
  const login = logins.get(id);
  if (login) {
    if (login.child && !login.child.killed) {
      try { login.child.kill('SIGKILL'); } catch (_) {}
    }
    if (login.fakeHome) {
      try { fs.rmSync(login.fakeHome, { recursive: true, force: true }); } catch (_) {}
    }
    logins.delete(id);
  }
}

export function activeCliLogin() {
  for (const l of logins.values()) {
    if (!l.settled && l.url) return { id: l.id, url: l.url };
  }
  return null;
}