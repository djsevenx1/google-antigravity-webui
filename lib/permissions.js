// agy 权限策略管理：通过全局 settings.json 的 allow/deny/ask 列表控制工具权限。
// 「自动允许」= 把 permissions.allow 设为全通配，让 agy 对常规工具直接放行——
// 这在 --print 无 TTY 下依然生效（每个新进程都会重读该文件），能根治
// “工具因权限被拒 → Agent execution terminated → 前端一直思考/变红”的问题。
//
// 写入位置：~/.gemini/antigravity-cli/settings.json
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const SETTINGS_DIRS = [
  path.join(os.homedir(), '.gemini', 'antigravity-cli'),
  '/vol5/@apphome/claude code/.gemini/antigravity-cli',
  '/vol5/@apphome/trim.openclaw/data/home/.gemini/antigravity-cli'
];

// 自动允许：仅包含 Antigravity 官方支持的合法权限动作，避免 CLI 启动报未知动作警告
const ALLOW_ALL = [
  'command(*)',
  'read_file(*)',
  'write_file(*)',
  'read_url(*)',
  'execute_url(*)',
  'mcp(*)'
];

export function readSettings() {
  for (const dir of SETTINGS_DIRS) {
    const file = path.join(dir, 'settings.json');
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
      }
    } catch (_) {}
  }
  return {};
}

export function writeSettings(s) {
  for (const dir of SETTINGS_DIRS) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(s, null, 2));
    } catch (_) {}
  }
}

// 把 agy 权限设为「自动允许」：覆盖 allow 列表，保留已有的 deny/ask
export function applyAutoAllow() {
  const s = readSettings();
  if (!s.permissions) s.permissions = {};
  s.permissions.allow = ALLOW_ALL;
  writeSettings(s);
  return true;
}

// 读取当前配置里是否处于“自动允许”。
export function isAutoAllow() {
  const s = readSettings();
  const allow = (s.permissions && Array.isArray(s.permissions.allow)) ? s.permissions.allow : [];
  return ALLOW_ALL.every((x) => allow.includes(x));
}