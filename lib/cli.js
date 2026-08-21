import { spawn, execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import config from './config.js';

// 对话必须用 node-pty 提供真实 TTY：无 TTY 时 agy 无法编排多工具（会 Agent execution terminated）。
const nodePty = createRequire(import.meta.url)('node-pty');

let _resolvedBin = '';
// 解析真实 CLI 路径：AGY_BIN 显式覆盖 > config/默认 > PATH 探测。
// 官方二进制名为 agy（部分 Linux 发行版为 antigravity），常装到 /usr/local/bin/agy 或 ~/.local/bin/agy。
export function bin() {
  const env = process.env.AGY_BIN;
  if (env) return env;
  if (_resolvedBin) return _resolvedBin;
  const seen = new Set();
  const candidates = [];
  const push = (p) => { if (p && !seen.has(p)) { seen.add(p); candidates.push(p); } };
  push(config.agyBin);
  push('/usr/local/bin/antigravity');
  push('/usr/local/bin/agy');
  // 官方 `antigravity install` 默认装到 ~/.local/bin/{agy,antigravity}，PATH 未必包含它，须显式探测
  const home = process.env.HOME || '';
  if (home) {
    push(path.join(home, '.local', 'bin', 'antigravity'));
    push(path.join(home, '.local', 'bin', 'agy'));
  }
  try {
    const { stdout } = execFileSync('which', ['agy', 'antigravity'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    String(stdout).trim().split('\n').forEach(push);
  } catch (_) {}
  for (const c of candidates) {
    if (c && fs.existsSync(c)) { _resolvedBin = c; return c; }
  }
  _resolvedBin = candidates[0] || '/usr/local/bin/agy';
  return _resolvedBin;
}

export function cliAvailable() {
  try {
    fs.accessSync(bin());
    return true;
  } catch {
    return false;
  }
}

// 探测 CLI 是否已登录（快速跑 antigravity models 看是否提示登录）
let _authedCache = null;
export async function cliAuthenticated() {
  if (_authedCache !== null) return _authedCache;
  if (!cliAvailable()) { _authedCache = false; return false; }
  try {
    const r = await run(['models'], { timeoutMs: 10000 });
    const text = (r.stdout + '\n' + r.stderr).trim();
    _authedCache = !/(authentication required|sign in|log in|401|unauthorized)/i.test(text);
  } catch {
    _authedCache = false;
  }
  // 登录态由后台轮询刷新，缓存有效时间 60 秒
  setTimeout(() => { _authedCache = null; }, 60000);
  return _authedCache;
}

// 登录成功后清掉缓存，让 /api/status、/api/chat 立刻反映新登录态
export function invalidateCliAuth() {
  _authedCache = null;
  _cachedModelsResult = null;
}

// 后台定期刷新登录态缓存，避免 /api/status 因实时子进程调用而阻塞
let _authPoller = null;
export function startAuthPoller() {
  if (_authPoller) return;
  _authPoller = setInterval(() => { cliAuthenticated().catch(() => {}); }, 15000);
}

// ---------- Plugins ----------
export async function listPlugins() {
  if (!cliAvailable()) return { ok: false, error: 'CLI 未安装' };
  const r = await run(['plugin', 'list'], { timeoutMs: 60000 });
  const text = (r.stdout + '\n' + r.stderr).trim();
  // 空列表 / 无已导入插件
  if (/no imported plugins/i.test(text)) return { ok: true, plugins: [] };
  if (!text || /error|sign in/i.test(text) && !/imported plugins/i.test(text)) {
    return { ok: false, error: text.slice(0, 300) || '无法读取插件列表' };
  }
  // CLI 会打印「Starting proxy... ready (port N)」等噪音行，需要跳过
  const NOISE = /^(starting proxy|\[warn\]|\[ok\]|\(use |deprecationwarning|usage:|commands:|list |import|install |uninstall |enable |disable |validate|link |help)/i;
  const HEADER = /^(id|name|status|plugin)\b|^[-\s]+$/i;
  const plugins = [];
  const seen = new Set();
  const rows = r.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of rows) {
    if (NOISE.test(line) || HEADER.test(line)) continue;
    const tok = line.split(/\s+/).find((t) =>
      isMeaningfulId(t) && !/^(starting|ready|port|proxy|id|name|status|version|plugin)$/i.test(t));
    if (tok && !seen.has(tok)) {
      seen.add(tok);
      plugins.push({ name: tok, line });
    }
  }
  return { ok: true, plugins };
}

export async function pluginAction(action, arg) {
  if (!cliAvailable()) return { ok: false, error: 'CLI 未安装' };
  const a = String(action || '').trim();
  if (!['install', 'uninstall', 'enable', 'disable'].includes(a)) return { ok: false, error: '不支持的操作: ' + a };
  if (a !== 'install' && !String(arg || '').trim()) return { ok: false, error: '缺少插件名' };
  const args = a === 'install' && arg ? ['plugin', a, String(arg)] : ['plugin', a, String(arg || '').trim()];
  const r = await run(args, { timeoutMs: 60000 });
  const text = (r.stdout + '\n' + r.stderr).trim();
  const bad = /error|fail|sign in|invalid|not found|unknown/i.test(text) && !/^All done|installed|enabled|disabled|uninstalled/i.test(text);
  return bad ? { ok: false, error: text.slice(0, 400) } : { ok: true, message: text.slice(0, 400) || 'done' };
}

function run(binArgs, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    // 必须用 spawn 显式 stdio:['ignore','pipe','pipe'] 关掉 stdin：
    // agy 在无 TTY 且 stdin 未 EOF 时会阻塞读 stdin，models/plugin 等会一直卡到超时。
    // (execFile 不支持 stdio 选项，故改 spawn 自收 stdout/stderr。)
    const child = spawn(bin(), binArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: stderr + String(err.message) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code == null ? 'killed' : code, stdout, stderr });
    });
  });
}

const SIGN_IN_MARKERS = ['please sign in', 'sign in', 'not authenticated', 'unauthorized', 'authentication required'];
// 权限/授权被拒的错误关键词（针对实际权限提示触发）
const PERM_MARKERS = [
  '--dangerously-skip-permissions',
  'permission denied',
  'user denied permission',
  'permission check failed',
  'requires approval',
  'authorization required',
  'permission required',
  'tool approval needed',
  'cannot prompt for',
  'auto-denied',
  'permissions.allow',
  'jetski:'
];

// agy 的 models / plugin list 均为表格文本、无 --json（实测确认），解析属"尽力而为"。
// 统一的排除词表：跳过表头/状态/能力标注等列，避免把非模型/插件名当名称。
const COLUMN_STOP = new Set([
  'id', 'name', 'model', 'provider', 'type', 'status', 'capabilities', 'version',
  'built-in', 'built_in', 'enabled', 'disabled', 'installed', 'uninstalled', 'active',
  'anonymous', 'api', 'default', 'latest', 'available', 'description', 'note',
  'token', 'input', 'output', 'thinking', 'cache', 'quota', 'count', 'owner', 'tags',
  'plugin', 'plugins', 'category', 'source', 'command', 'alias', 'all'
]);
// 识别"看起来像模型/插件名"的 token：字母开头、非纯数字、非已知列名
const isMeaningfulId = (t) =>
  /^[a-zA-Z][a-zA-Z0-9._\-]{1,64}$/.test(t) && !/^\d+$/.test(t) && !COLUMN_STOP.has(t.toLowerCase());

let _cachedModelsResult = null;
let _cachedModelsTime = 0;
const MODELS_CACHE_TTL = 3 * 60 * 1000;

export async function fetchModels() {
  if (_cachedModelsResult && (Date.now() - _cachedModelsTime < MODELS_CACHE_TTL)) {
    return _cachedModelsResult;
  }
  if (!cliAvailable()) return { ok: false, signInRequired: false, installed: false, models: [] };
  const r = await run(['models'], { timeoutMs: 15000 });
  const text = (r.stdout + '\n' + r.stderr).toLowerCase();
  if (r.code !== 0 || SIGN_IN_MARKERS.some((m) => text.includes(m))) {
    return { ok: false, signInRequired: true, installed: true, models: [] };
  }
  // 清除 spinner 字符及 Fetching available models 提示，避免吞掉第一行模型
  const cleaned = r.stdout
    .replace(/(?:[\u2800-\u28ff]|\s)*fetching available models\.*/gi, '\n')
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  const raw = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);
  const models = [];
  const seen = new Set();
  for (const line of raw) {
    if (/^\s*(model|id|name|provider|type|status)\b/i.test(line)) continue;
    const tok = line.split(/\s+/).find((t) => isMeaningfulId(t));
    if (tok && !seen.has(tok)) { seen.add(tok); models.push(tok); }
  }
  const result = { ok: models.length > 0, signInRequired: false, installed: true, models };
  if (result.ok) {
    _cachedModelsResult = result;
    _cachedModelsTime = Date.now();
  }
  return result;
}

/**
 * 把多轮 messages 拼接成带角色的上下文 prompt（避免依赖 --conversation）。
 * 越靠后越保留（最近的对话优先）；超长自动截断，保证 prompt 不会过大。
 */
function buildPrompt(messages, limit = 6000) {
  const lines = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || typeof m.content !== 'string') continue;
    const content = m.content.trim();
    if (!content) continue;
    const role = m.role === 'user' ? '用户' : '助手';
    const seg = `${role}：${content}`;
    if (total + seg.length > limit) { lines.unshift('…(较早上下文已省略)…'); break; }
    lines.unshift(seg);
    total += seg.length;
  }
  return lines.join('\n');
}

/**
 * CLI 流式对话。逐行消费 NDJSON(stream-json)，把累计的 response 增量发到 onDelta。
 */
export async function cliProvider({ model, messages, onDelta, onProgress, onConversationId, signal, effort, conversationId, permissions }) {
  if (!cliAvailable()) throw new Error('未找到 Antigravity CLI 二进制，请先安装或设置 AGY_BIN');

  // 真会话续接：只取最后一条 user 消息发给 agy，上下文由 agy 服务端 --conversation 记住。
  // （已实测验证：--conversation + --dangerously-skip-permissions 可共存，工具正常执行）
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const prompt = lastUser?.content || '';

  let modelName = String(model || '').trim();
  const eff = String(effort || '').trim().toLowerCase();

  const args = [
    '--print', prompt,
    '--output-format', 'stream-json',
    '--print-timeout', '300s'
  ];

  // 模型与思考强度（effort）智能匹配与消歧
  if (eff && ['low', 'medium', 'high'].includes(eff)) {
    if (/-(low|medium|high)$/i.test(modelName)) {
      // 若模型名已自带 -low/-medium/-high 后缀，替换成用户当前选择的 effort，避免同时传 --effort 发生冲突报错
      modelName = modelName.replace(/-(low|medium|high)$/i, `-${eff}`);
    } else {
      args.push('--effort', eff);
    }
  }
  if (modelName) {
    args.unshift(modelName);
    args.unshift('--model');
  }

  // 真会话续接：首轮不带 id → agy 新建会话返回 conversation_id；后续带 id 续接
  const convId = String(conversationId || '').trim();
  if (convId) args.push('--conversation', convId);

  // 权限策略：
  // WebUI 处于无 TTY 非交互环境下（--print），除明确选择严格询问（default）外，
  // 所有自动化模式（approve/sandbox/plan/accept-edits）均须附带 --dangerously-skip-permissions，
  // 避免 CLI 因无法在终端读取 stdin 而直接自动拒绝（auto-denied）工具调用。
  const perm = String(permissions || 'approve').trim().toLowerCase();
  if (perm === 'sandbox') {
    args.push('--sandbox', '--dangerously-skip-permissions');
  } else if (perm === 'plan') {
    args.push('--mode', 'plan', '--dangerously-skip-permissions');
  } else if (perm === 'accept-edits') {
    args.push('--mode', 'accept-edits', '--dangerously-skip-permissions');
  } else if (perm === 'default') {
    // 严格询问模式：不传 skip-permissions，如果触发工具权限，由流式处理器拦截并抛出 needsPermission 弹窗引导重试
  } else {
    // 默认：自动批准
    args.push('--dangerously-skip-permissions');
  }

  const child = nodePty.spawn(bin(), args, {
    name: 'xterm', cols: 140, rows: 40,
    cwd: process.cwd(),
    env: { ...process.env, NO_COLOR: '1' }
  });

  if (signal) signal.addEventListener('abort', () => { try { child.kill('SIGTERM'); } catch (_) {} });

  let outBuffer = '';
  let errBuffer = '';
  let prevResponse = '';
  let lastError = '';
  let conversationIdSeen = String(conversationId || '').trim();
  let conversationIdReported = Boolean(conversationIdSeen);

  // 官方 agy stream-json：NDJSON typed events，每行形如
  //   {"event":"result","result":{"response":"...","status":"...","error":"","usage":{...}}}
  // 累计正文在 event.result.response；出错时 event.result.error 给出原因。
  const flushLine = (line) => {
    line = line.trim();
    if (!line) return;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      // 捕捉非 JSON 输出（例如 CLI 打印的原生 jetski: 提示或底层报错）
      // 过滤 Go 日志库的前缀（ERROR: logging before google.Init 等启动提示），避免误判为执行错误
      if (!line.includes('logging before google.Init') && !/^[IWE]\d{4}\s/i.test(line)) {
        if (/jetski:|permission denied|unauthorized|fatal:/i.test(line)) {
          if (!lastError) lastError = line;
          else lastError += '\n' + line;
        }
      }
      return;
    }

    if (obj && typeof obj.error === 'string' && obj.error) {
      lastError = obj.error;
    }

    const payload = obj && typeof obj.result === 'object' ? obj.result : null;
    if (payload) {
      if (typeof payload.error === 'string' && payload.error) {
        lastError = payload.error;
      }
      const id = payload.conversation_id || '';
      if (typeof id === 'string' && id.trim()) conversationIdSeen = id.trim();
      if (!conversationIdReported && conversationIdSeen && onConversationId) { conversationIdReported = true; onConversationId(conversationIdSeen); }
    }

    if (obj && obj.conversation_id && typeof obj.conversation_id === 'string' && obj.conversation_id.trim()) {
      conversationIdSeen = obj.conversation_id.trim();
      if (!conversationIdReported && onConversationId) { conversationIdReported = true; onConversationId(conversationIdSeen); }
    }

    // 官方 agy 以 event:"step_update" 发送状态更新与增量文本
    const stepUpdate = obj && typeof obj.step_update === 'object' ? obj.step_update : null;
    if (stepUpdate) {
      if (typeof stepUpdate.error === 'string' && stepUpdate.error) {
        lastError = stepUpdate.error;
      }
      // 捕获权限被拒的错误（针对实际权限提示触发）
      if (stepUpdate.tool_info && stepUpdate.tool_info.error) {
        const toolErr = stepUpdate.tool_info.error;
        const msg = typeof toolErr === 'string' ? toolErr : (toolErr.message || JSON.stringify(toolErr));
        if (msg && PERM_MARKERS.some((m) => msg.toLowerCase().includes(m.toLowerCase()))) {
          lastError = msg;
        }
      }
      // 提取工具或步骤进度
      if (onProgress) {
        let tip = '';
        if (stepUpdate.tool_info && stepUpdate.tool_info.name) {
          const tName = stepUpdate.tool_info.name;
          const toolMap = {
            view_file: '正在读取文件...',
            read_resource: '正在读取资源...',
            run_command: '正在执行命令...',
            grep_search: '正在检索代码...',
            find_by_name: '正在查找文件...',
            search_web: '正在联网检索...',
            read_url_content: '正在读取网页...',
            write_to_file: '正在写入文件...',
            replace_file_content: '正在修改文件...',
            multi_replace_file_content: '正在批量修改代码...',
            list_dir: '正在浏览目录...',
            manage_task: '正在管理后台任务...',
            invoke_subagent: '正在调度子 Agent...',
            ask_question: '正在等待确认...',
          };
          tip = toolMap[tName] || `正在调用工具 (${tName})...`;
        } else if (stepUpdate.step_type === 'checkpoint') {
          tip = '正在同步会话历史...';
        } else if (stepUpdate.step_type === 'agent_response' || stepUpdate.step_type === 'planner_response') {
          tip = '正在思考与组织回答...';
        }
        if (tip) {
          onProgress({ tip, stepType: stepUpdate.step_type, toolName: stepUpdate.tool_info?.name });
        }
      }
      // 捕获文本增量（text_delta）
      if (typeof stepUpdate.text_delta === 'string') {
        onDelta(stepUpdate.text_delta);
        prevResponse += stepUpdate.text_delta;
      }
    }

    if (payload && typeof payload.response === 'string') {
      const full = payload.response;
      if (full.length > prevResponse.length) onDelta(full.slice(prevResponse.length));
      prevResponse = full;
    } else if (typeof obj.response === 'string') {
      const full = obj.response;
      if (full.length > prevResponse.length) onDelta(full.slice(prevResponse.length));
      prevResponse = full;
    } else if (typeof obj.text === 'string') {
      onDelta(obj.text); // 兼容增量 text 形式
    }
  };

  child.onData((d) => {
    // PTY 输出每行以 \r\n 结尾；按 '\n' 切分，行尾 \r 由 flushLine 的 trim 处理。
    outBuffer += d;
    let nl;
    while ((nl = outBuffer.indexOf('\n')) !== -1) {
      const line = outBuffer.slice(0, nl);
      outBuffer = outBuffer.slice(nl + 1);
      flushLine(line);
    }
  });

  await new Promise((resolve) => {
    child.onExit(() => resolve());
  });

  // 追加缓冲里剩余的半行
  if (outBuffer.trim()) flushLine(outBuffer);

  const combined = (outBuffer + '\n' + errBuffer + '\n' + lastError).toLowerCase();
  const hasPermError = PERM_MARKERS.some((m) => combined.includes(m.toLowerCase()) || (lastError && lastError.toLowerCase().includes(m.toLowerCase())));

  // ── 诊断增强：失败时把完整 stderr + 部分 stdout 尾部写到 debug 日志，便于定位 Agent 终止根因 ──
  if (!prevResponse || lastError) {
    try {
      const fs2 = await import('node:fs');
      const os2 = await import('node:os');
      const p2 = await import('node:path');
      const dp = p2.join(os2.homedir(), '.gemini', 'antigravity-cli', 'cli-err-debug.log');
      const tail = outBuffer.replace(/\n+/g, '\n').slice(-4000);
      fs2.appendFileSync(dp, `\n\n==== ${new Date().toISOString()} ====\n-- lastError --\n${lastError || '(none)'}\n-- errBuffer --\n${errBuffer.slice(-3000)}\n-- outTail --\n${tail}\n`);
    } catch (_) {}
  }

  if (!prevResponse) {
    const le = lastError || errBuffer.trim();
    // 权限/授权被拒 → 标记 needsPermission，由上层桥回浏览器反问弹窗（P3）
    if (le && hasPermError) {
      const e = new Error('CLI 需要授权：' + le);
      e.needsPermission = true;
      throw e;
    }
    if (lastError) throw new Error(lastError);
    if (SIGN_IN_MARKERS.some((m) => combined.includes(m))) {
      throw new Error('CLI 需要登录 Google Antigravity（在设备上用 `antigravity` 登录一次后重试）');
    }
    throw new Error(errBuffer.trim() || 'CLI 未返回内容');
  } else if (hasPermError && lastError) {
    // 即使有部分流式输出，若中途因权限拦截中断，也抛出 needsPermission 提示
    const e = new Error('CLI 权限拦截中断：' + lastError);
    e.needsPermission = true;
    throw e;
  }
  // 返回官方会话 ID，供 WebUI 保存并续接多轮对话（P2）
  return { conversationId: conversationIdSeen || null };
}