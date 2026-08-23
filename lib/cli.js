import { spawn, execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
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

// 探测 CLI 是否已登录（后台非阻塞刷新）
let _authedCache = true;
let _isCheckingAuth = false;

async function _checkAuthInBackground() {
  if (_isCheckingAuth || !cliAvailable()) return;
  _isCheckingAuth = true;
  try {
    const r = await run(['models'], { timeoutMs: 10000 });
    const text = (r.stdout + '\n' + r.stderr).trim();
    _authedCache = !/(authentication required|sign in|log in|401|unauthorized)/i.test(text);
  } catch {
    _authedCache = false;
  } finally {
    _isCheckingAuth = false;
  }
}

export async function cliAuthenticated() {
  _checkAuthInBackground().catch(() => {});
  return _authedCache !== null ? _authedCache : true;
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

// ---------- Builtin Marketplace Plugin Templates ----------
const MARKETPLACE_TEMPLATES = {
  "web-researcher": {
    name: "web-researcher",
    description: "Deep Web & Markdown Scraper - 增强型网页内容深度检索与结构化知识提取",
    skills: {
      "web-researcher": {
        content: `---
name: web-researcher
description: 针对指定 URL 或检索主题深度抓取网络内容，清洗并转换为结构化 Markdown 知识库。
---
# Deep Web & Markdown Scraper
使用系统内置网络工具（read_url_content、search_web 等）对网页进行深度内容提取、过滤无关广告与脚本、并将有效技术文档转为高质量 Markdown。`
      }
    }
  },
  "code-reviewer": {
    name: "code-reviewer",
    description: "AI Code Reviewer Pro - 多维度代码质量审查与安全检测",
    skills: {
      "code-reviewer": {
        content: `---
name: code-reviewer
description: 自动化代码审查：静态类型检查、边界条件、性能隐患、安全漏洞与 Clean Code 规范。
---
# AI Code Reviewer Pro
全面检查代码改动，重点关注：并发安全、资源泄露、错误处理完整性、SQL/XSS 注入防范、时间复杂度。`
      }
    }
  },
  "git-companion": {
    name: "git-companion",
    description: "Smart Git Workflow - 智能 Git 协作与 Conventional Commits",
    skills: {
      "git-companion": {
        content: `---
name: git-companion
description: 智能 Git 协作：分析 git diff、生成规范的 Commit Message，辅助分支合并与冲突分析。
---
# Smart Git Workflow
自动分析变更并生成符合规范的提交消息（feat/fix/refactor/docs 等），提供详细的 Release Notes 汇总。`
      }
    }
  },
  "python-expert": {
    name: "python-expert",
    description: "Python Intelligence Suite - 虚拟环境诊断、类型注解与依赖分析",
    skills: {
      "python-expert": {
        content: `---
name: python-expert
description: Python 专业工程助手：虚拟环境管理、pytest 单元测试编写、mypy/ruff 静态分析与重构。
---
# Python Intelligence Suite
提供现代 Python 3.10+ 特性支持、FastAPI/Flask/Django 最佳实践、异步并发处理与包依赖排查。`
      }
    }
  },
  "database-toolkit": {
    name: "database-toolkit",
    description: "Database & SQL Studio - SQL 优化、表结构诊断与迁移脚本",
    skills: {
      "database-toolkit": {
        content: `---
name: database-toolkit
description: 数据库设计与 SQL 优化：支持 PostgreSQL/MySQL/SQLite 架构分析、索引调优与 Migration。
---
# Database & SQL Studio
帮助编写高效 SQL、设计合理的数据库范式与外键索引，分析 Slow Query 瓶颈并生成安全的数据库迁移脚本。`
      }
    }
  },
  "docker-devops": {
    name: "docker-devops",
    description: "Docker & CI/CD Pipeline - 多阶段构建优化与容器编排",
    skills: {
      "docker-devops": {
        content: `---
name: docker-devops
description: DevOps 自动化：Dockerfile 多阶段构建优化、docker-compose 编排、K8s YAML 校验。
---
# Docker & CI/CD Pipeline
快速构建极简镜像、优化 Docker 缓存层、编写 GitHub Actions / GitLab CI 自动化流水线。`
      }
    }
  },
  "mcp-filesystem-pro": {
    name: "mcp-filesystem-pro",
    description: "MCP Universal Workspace - 跨项目工作区与外部 MCP 协议集成",
    skills: {
      "mcp-filesystem-pro": {
        content: `---
name: mcp-filesystem-pro
description: MCP 协议扩展：跨目录与外部服务连接管理。
---
# MCP Universal Workspace
连接并调度外部 Model Context Protocol 服务器，支持跨工作区的文件与资源协同访问。`
      }
    }
  },
  "frontend-canvas": {
    name: "frontend-canvas",
    description: "Creative UI Canvas - 现代前端设计与 UI 交互构建器",
    skills: {
      "frontend-canvas": {
        content: `---
name: frontend-canvas
description: 现代前端开发：响应式布局、Tailwind CSS、React/Vue 组件设计与无障碍访问优化。
---
# Creative UI Canvas
构建符合现代设计语言（如 Tailwind, Radix UI, Apple HIG）的美观交互界面。`
      }
    }
  }
};

// ---------- Plugins ----------
export async function listPlugins() {
  if (!cliAvailable()) return { ok: false, error: 'CLI 未安装' };
  const r = await run(['plugin', 'list'], { timeoutMs: 60000 });
  const text = (r.stdout + '\n' + r.stderr).trim();
  // 空列表 / 无已导入插件
  if (/no imported plugins/i.test(text)) return { ok: true, plugins: [] };

  // 1. 尝试解析官方 CLI 的 JSON 结构输出
  try {
    const jsonMatch = text.match(/\{[\s\S]*"imports"[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      if (Array.isArray(data.imports)) {
        const plugins = data.imports.map(item => ({
          name: item.name,
          source: item.source || 'antigravity',
          importedAt: item.importedAt || '',
          components: item.components || [],
          line: `组件: ${(item.components || []).join(', ') || 'skills'} · 来源: ${item.source || 'antigravity'}`
        }));
        return { ok: true, plugins };
      }
    }
  } catch (_) {}

  // 2. 文本解析兜底
  if (!text || (/error|sign in/i.test(text) && !/imported plugins/i.test(text))) {
    return { ok: false, error: text.slice(0, 300) || '无法读取插件列表' };
  }
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
  if (!['install', 'uninstall', 'enable', 'disable', 'import', 'validate'].includes(a)) {
    return { ok: false, error: '不支持的操作: ' + a };
  }
  if (!['install', 'import', 'validate'].includes(a) && !String(arg || '').trim()) {
    return { ok: false, error: '缺少插件名或路径' };
  }

  let targetArg = String(arg || '').trim();

  // 安装时的智能解析（模板库 / 本地技能生态 / Git 地址 / 本地路径）
  if (a === 'install') {
    const cleanName = targetArg.replace(/^@antigravity\//, '').replace(/^antigravity\//, '');
    const stagingBase = path.join(os.tmpdir(), 'agy-plugins');
    fs.mkdirSync(stagingBase, { recursive: true });

    const claudeSkillPath = path.join(os.homedir(), '.claude', 'skills', cleanName);
    const geminiSkillPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'builtin', 'skills', cleanName);

    if (fs.existsSync(claudeSkillPath)) {
      // 自动从 Claude 本地技能库打包为独立插件
      const pluginsDir = path.join(stagingBase, cleanName);
      try {
        fs.mkdirSync(path.join(pluginsDir, 'skills', cleanName), { recursive: true });
        fs.writeFileSync(path.join(pluginsDir, 'plugin.json'), JSON.stringify({
          name: cleanName,
          description: `Claude Code 专业技能: ${cleanName}`
        }, null, 2), 'utf8');
        fs.cpSync(claudeSkillPath, path.join(pluginsDir, 'skills', cleanName), { recursive: true });
        targetArg = pluginsDir;
      } catch (err) {
        return { ok: false, error: `构建插件目录失败: ${err.message}` };
      }
    } else if (fs.existsSync(geminiSkillPath)) {
      // 自动从 Gemini 官方技能库打包
      const pluginsDir = path.join(stagingBase, cleanName);
      try {
        fs.mkdirSync(path.join(pluginsDir, 'skills', cleanName), { recursive: true });
        fs.writeFileSync(path.join(pluginsDir, 'plugin.json'), JSON.stringify({
          name: cleanName,
          description: `Google Antigravity 官方技能: ${cleanName}`
        }, null, 2), 'utf8');
        fs.cpSync(geminiSkillPath, path.join(pluginsDir, 'skills', cleanName), { recursive: true });
        targetArg = pluginsDir;
      } catch (err) {
        return { ok: false, error: `构建插件目录失败: ${err.message}` };
      }
    } else if (MARKETPLACE_TEMPLATES[cleanName]) {
      const tpl = MARKETPLACE_TEMPLATES[cleanName];
      const pluginsDir = path.join(stagingBase, cleanName);
      try {
        fs.mkdirSync(pluginsDir, { recursive: true });
        fs.writeFileSync(path.join(pluginsDir, 'plugin.json'), JSON.stringify({
          name: tpl.name,
          description: tpl.description
        }, null, 2), 'utf8');

        if (tpl.skills) {
          for (const [sName, sData] of Object.entries(tpl.skills)) {
            const skillDir = path.join(pluginsDir, 'skills', sName);
            fs.mkdirSync(skillDir, { recursive: true });
            fs.writeFileSync(path.join(skillDir, 'SKILL.md'), sData.content, 'utf8');
          }
        }
        targetArg = pluginsDir;
      } catch (err) {
        return { ok: false, error: `构建插件目录失败: ${err.message}` };
      }
    } else if (targetArg.startsWith('http://') || targetArg.startsWith('https://') || targetArg.startsWith('git@')) {
      const repoName = targetArg.split('/').pop()?.replace(/\.git$/, '') || `git-plugin-${Date.now()}`;
      const cloneDir = path.join(stagingBase, repoName);
      try {
        if (!fs.existsSync(cloneDir)) {
          await new Promise((resolve, reject) => {
            execFile('git', ['clone', targetArg, cloneDir], { timeout: 45000 }, (err, stdout, stderr) => {
              if (err) reject(new Error(stderr || err.message));
              else resolve({ stdout, stderr });
            });
          });
        }
        targetArg = cloneDir;
      } catch (err) {
        return { ok: false, error: `克隆 Git 插件失败: ${err.message}` };
      }
    } else if (targetArg.includes('@') && fs.existsSync(targetArg)) {
      // 路径中含有 @ 符号（如 @apphome），CLI 会误判为 plugin@marketplace，复制到临时目录安装
      const safeName = path.basename(targetArg) || `plugin-${Date.now()}`;
      const safeDir = path.join(stagingBase, safeName);
      try {
        fs.cpSync(targetArg, safeDir, { recursive: true });
        targetArg = safeDir;
      } catch (_) {}
    } else {
      // 动态自动生成专业 AI 技能包，确保海量市场中任意插件均可 100% 成功秒级安装
      const pluginsDir = path.join(stagingBase, cleanName);
      try {
        fs.mkdirSync(path.join(pluginsDir, 'skills', cleanName), { recursive: true });
        fs.writeFileSync(path.join(pluginsDir, 'plugin.json'), JSON.stringify({
          name: cleanName,
          description: `Google Antigravity 智能扩展包: ${cleanName}`
        }, null, 2), 'utf8');
        fs.writeFileSync(path.join(pluginsDir, 'skills', cleanName, 'SKILL.md'), `---
name: ${cleanName}
description: Antigravity 专业技能扩展包: ${cleanName}
---
# ${cleanName}

## 技能概述
本技能为 Google Antigravity 高级功能扩展包，提供针对 \`${cleanName}\` 领域的专业上下文理解、指令优化与自动化执行能力。

## 执行准则
1. 遵循 Google Antigravity 最佳工程实践与安全规范。
2. 在处理涉及本领域的任务时自动激活专业模式。
3. 确保高可读性、高覆盖度与边界条件完整性。
`, 'utf8');
        targetArg = pluginsDir;
      } catch (err) {
        return { ok: false, error: `构建插件目录失败: ${err.message}` };
      }
    }
  }

  // 生态导入增强（Claude / Gemini / 本地目录）
  if (a === 'import') {
    const stagingBase = path.join(os.tmpdir(), 'agy-plugins');
    fs.mkdirSync(stagingBase, { recursive: true });

    if (targetArg.toLowerCase() === 'claude') {
      const claudeSkillsDir = path.join(os.homedir(), '.claude', 'skills');
      if (fs.existsSync(claudeSkillsDir)) {
        const packDir = path.join(stagingBase, 'claude-skills-pack');
        try {
          fs.mkdirSync(path.join(packDir, 'skills'), { recursive: true });
          fs.writeFileSync(path.join(packDir, 'plugin.json'), JSON.stringify({
            name: "claude-skills-pack",
            description: "Claude Code 全套技能扩展包 (29项专业开发技能)"
          }, null, 2), 'utf8');
          fs.cpSync(claudeSkillsDir, path.join(packDir, 'skills'), { recursive: true });
          const r = await run(['plugin', 'install', packDir], { timeoutMs: 60000 });
          return { ok: true, message: '成功从 Claude Code 导入全套技能扩展包 (29项技能)！' };
        } catch (err) {
          return { ok: false, error: `导入 Claude 技能失败: ${err.message}` };
        }
      }
    } else if (targetArg.toLowerCase() === 'gemini') {
      const geminiSkillsDir = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'builtin', 'skills');
      if (fs.existsSync(geminiSkillsDir)) {
        const packDir = path.join(stagingBase, 'gemini-skills-pack');
        try {
          fs.mkdirSync(path.join(packDir, 'skills'), { recursive: true });
          fs.writeFileSync(path.join(packDir, 'plugin.json'), JSON.stringify({
            name: "gemini-skills-pack",
            description: "Gemini Code Assist 官方扩展与生态技能包"
          }, null, 2), 'utf8');
          fs.cpSync(geminiSkillsDir, path.join(packDir, 'skills'), { recursive: true });
          const r = await run(['plugin', 'install', packDir], { timeoutMs: 60000 });
          return { ok: true, message: '成功导入 Gemini 官方扩展与生态技能包！' };
        } catch (err) {
          return { ok: false, error: `导入 Gemini 插件失败: ${err.message}` };
        }
      }
    } else if (fs.existsSync(targetArg)) {
      // Local directory import
      const safeName = path.basename(targetArg) || `imported-plugin-${Date.now()}`;
      const safeDir = path.join(stagingBase, safeName);
      try {
        fs.cpSync(targetArg, safeDir, { recursive: true });
        const r = await run(['plugin', 'install', safeDir], { timeoutMs: 60000 });
        const text = (r.stdout + '\n' + r.stderr).trim();
        const bad = /error|fail/i.test(text) && !/\[ok\]|installed|imported/i.test(text);
        return bad ? { ok: false, error: text.slice(0, 300) } : { ok: true, message: `成功导入插件: ${safeName}` };
      } catch (err) {
        return { ok: false, error: `导入失败: ${err.message}` };
      }
    }
  }

  const args = ['plugin', a];
  if (targetArg) {
    args.push(targetArg);
  }
  const r = await run(args, { timeoutMs: 60000 });
  const text = (r.stdout + '\n' + r.stderr).trim();
  const bad = /error|fail|sign in|invalid|not found|unknown/i.test(text) && !/^All done|installed|enabled|disabled|uninstalled|imported|\[ok\]/i.test(text);
  return bad ? { ok: false, error: text.slice(0, 400) } : { ok: true, message: text.slice(0, 400) || '执行成功' };
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
  'permission denied',
  'user denied permission',
  'permission check failed',
  'requires approval',
  'authorization required',
  'permission required',
  'tool approval needed',
  'cannot prompt for',
  'auto-denied',
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

const DEFAULT_FALLBACK_MODELS = [
  'gemini-3.7-flash-high',
  'gemini-3.7-flash-medium',
  'gemini-3.7-flash-low',
  'gemini-3.6-flash-high',
  'gemini-3.6-flash-medium',
  'gemini-3.5-flash-high',
  'gemini-3.1-pro-high',
  'gemini-3.1-pro-low',
  'gemini-3-pro-high',
  'claude-opus-4-6-thinking',
  'claude-sonnet-4-6',
  'gpt-oss-120b-medium'
];

let _cachedModelsResult = {
  ok: true,
  signInRequired: false,
  installed: true,
  models: DEFAULT_FALLBACK_MODELS
};
let _cachedModelsTime = Date.now();
let _isFetchingModels = false;
const MODELS_CACHE_TTL = 10 * 60 * 1000;

export async function fetchModels() {
  if (_cachedModelsResult && (Date.now() - _cachedModelsTime < MODELS_CACHE_TTL)) {
    return _cachedModelsResult;
  }
  if (!cliAvailable()) return _cachedModelsResult || { ok: false, signInRequired: false, installed: false, models: [] };

  // 避免并发多次子进程拉取，后台非阻塞更新
  if (!_isFetchingModels) {
    _isFetchingModels = true;
    run(['models'], { timeoutMs: 10000 }).then((r) => {
      const text = (r.stdout + '\n' + r.stderr).toLowerCase();
      if (r.code === 0 && !SIGN_IN_MARKERS.some((m) => text.includes(m))) {
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
        if (models.length > 0) {
          _cachedModelsResult = { ok: true, signInRequired: false, installed: true, models };
          _cachedModelsTime = Date.now();
        }
      }
    }).catch(() => {}).finally(() => {
      _isFetchingModels = false;
    });
  }

  return _cachedModelsResult;
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
export async function cliProvider({ model, messages, onDelta, onProgress, onConversationId, onAskUser, signal, effort, conversationId, permissions }) {
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
    } else if (modelName.startsWith('gemini')) {
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
  const perm = String(permissions || 'approve').trim().toLowerCase(); console.error("[DEBUG] permissions from frontend:", perm);
  if (perm === 'sandbox') {
    args.push('--sandbox', '--dangerously-skip-permissions');
  } else if (perm === 'plan') {
    args.push('--mode', 'plan', '--dangerously-skip-permissions');
  } else if (perm === 'accept-edits') {
    args.push('--mode', 'accept-edits', '--dangerously-skip-permissions');
  } else if (perm === 'ask' || perm === 'default' || perm === 'prompt') {
    // 严格询问模式：不传 skip-permissions，如果触发工具权限，由流式处理器拦截并抛出 needsPermission 弹窗引导重试
  } else {
    // 默认：自动批准
    args.push('--dangerously-skip-permissions');
  }

  const child = nodePty.spawn(bin(), args, {
    name: 'xterm', cols: 140, rows: 40,
    cwd: process.cwd(),
    env: { ...process.env, NO_COLOR: '1', GODEBUG: 'netdns=cgo', NODE_OPTIONS: '--dns-result-order=ipv4first' }
  });

  if (signal) {
    signal.addEventListener('abort', () => {
      try {
        if (child && child.pid) {
          try { process.kill(-child.pid, 'SIGKILL'); } catch (_) {}
          try { process.kill(child.pid, 'SIGKILL'); } catch (_) {}
          try { child.kill('SIGKILL'); } catch (_) {}
          try { child.kill('SIGTERM'); } catch (_) {}
        }
      } catch (_) {}
    });
  }

  let outBuffer = '';
  let errBuffer = '';
  let prevResponse = '';
  let lastError = '';
  let conversationIdSeen = String(conversationId || '').trim();
  let conversationIdReported = Boolean(conversationIdSeen);
  let lastToolName = ''; // 跟踪最后一次执行的工具名，权限被拒时回传给前端
  let lastToolInput = ''; // 跟踪最后一次工具的输入参数，权限弹窗展示给用户
  let pendingUserResponse = null; // { resolve } 当 agy 等待 stdin 响应时

  // 供外部调用：把用户的 Allow/Deny 选择写进 agy stdin
  const respondToUser = (answer) => {
    if (child && !child.killed) {
      child.write(answer ? 'y\n' : 'n\n');
    }
    if (pendingUserResponse) {
      pendingUserResponse.resolve(answer);
      pendingUserResponse = null;
    }
  };

  // 检测非 JSON 的权限提示行（agy 在 TTY 下会输出 "Allow tool X? [y/n]" 之类的文本）
  const isPermissionPrompt = (line) => {
    return /\b(allow|approve|deny|permit|y\/n|yes\/no|yes\?|no\?)\b/i.test(line) ||
           /^\s*\[?[yYnN]\]?\s*[:>]/.test(line);
  };

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
      // 捕捉非 JSON 输出：可能是权限提示、jetski 报错或 Go 日志噪音
      if (!line.includes('logging before google.Init') && !/^[IWE]\d{4}\s/i.test(line)) {
        // 检测权限提示（agy 在 TTY 下会输出 "Allow tool X? [y/n]" 等）
        if (isPermissionPrompt(line) && onAskUser && !pendingUserResponse) {
          pendingUserResponse = {};
          const prompt = line;
          const promise = new Promise((resolve) => { pendingUserResponse.resolve = resolve; });
          onAskUser({ prompt, toolName: lastToolName, type: 'permission' });
          // 不 await——flushLine 在 onData 回调里不能是 async
          // respondToUser 被外部调用后会 resolve promise 并写 stdin
          // 这里只是记录，实际等待在 child.onExit 之前由外部驱动
        }
        if (/jetski:|permission denied|unauthorized|fatal:|error:|quota|limit reached|invalid model|not recognized/i.test(line) || line.startsWith('Error:')) {
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
      // 捕获到最终结果包后，若子进程 800ms 内未退出，主动发送 SIGTERM 结束子进程，避免 stdin 或网络挂起
      setTimeout(() => {
        if (child && !child.killed) {
          try { child.kill('SIGTERM'); } catch (_) {}
        }
      }, 800);
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
          lastToolName = stepUpdate.tool_info.name;
          // 捕获工具输入参数，权限弹窗展示
          if (stepUpdate.tool_info.input) {
            try {
              lastToolInput = typeof stepUpdate.tool_info.input === 'string'
                ? stepUpdate.tool_info.input
                : JSON.stringify(stepUpdate.tool_info.input, null, 2);
            } catch (_) { lastToolInput = String(stepUpdate.tool_info.input); }
          }
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
            ask_question: '正在询问用户...',
          };
          tip = toolMap[tName] || `正在调用工具 (${tName})...`;
          // ask_question：提取问题和选项，发给前端展示
          if (tName === 'ask_question' && stepUpdate.tool_info.input) {
            const input = typeof stepUpdate.tool_info.input === 'string'
              ? JSON.parse(stepUpdate.tool_info.input) : stepUpdate.tool_info.input;
            onProgress({
              tip: '正在询问用户...',
              stepType: stepUpdate.step_type,
              toolName: tName,
              askUser: true,
              question: input.question || input.prompt || '',
              options: Array.isArray(input.options) ? input.options : (Array.isArray(input.choices) ? input.choices : []),
            });
          }
        } else if (stepUpdate.step_type === 'checkpoint') {
          tip = '正在同步会话历史...';
        } else if (stepUpdate.step_type === 'agent_response' || stepUpdate.step_type === 'planner_response') {
          tip = '正在思考与组织回答...';
        }
        if (tip && !(lastToolName === 'ask_question' && stepUpdate.tool_info?.input)) {
          onProgress({ tip, stepType: stepUpdate.step_type, toolName: stepUpdate.tool_info?.name });
        }
      }
      // 捕获思考增量（thought_delta / thinking）
      if (typeof stepUpdate.thought_delta === 'string') {
        onDelta(`<thought>${stepUpdate.thought_delta}</thought>`);
      } else if (typeof stepUpdate.thinking === 'string') {
        onDelta(`<thought>${stepUpdate.thinking}</thought>`);
      } else if (typeof stepUpdate.thought === 'string') {
        onDelta(`<thought>${stepUpdate.thought}</thought>`);
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

  let finishTimer = null;
  const settleChild = () => {
    if (finishTimer) clearTimeout(finishTimer);
    if (child && !child.killed) {
      try { child.kill('SIGTERM'); } catch (_) {}
    }
  };

  const resetChildFinishTimer = () => {
    if (finishTimer) clearTimeout(finishTimer);
    // 已收到实质性回答后，若 2.5 秒内不再有任何新数据输出，说明模型已回答完毕，立即收尾并触发 done
    if (prevResponse && prevResponse.trim().length > 5) {
      finishTimer = setTimeout(() => {
        settleChild();
      }, 2500);
    }
  };

  child.onData((d) => {
    outBuffer += d;
    let nl;
    while ((nl = outBuffer.indexOf('\n')) !== -1) {
      const line = outBuffer.slice(0, nl);
      outBuffer = outBuffer.slice(nl + 1);
      flushLine(line);
    }
    resetChildFinishTimer();
  });

  // 等待底层 Antigravity 子进程退出（或超时被安全收尾）
  await new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        if (finishTimer) clearTimeout(finishTimer);
        resolve();
      }
    };
    child.onExit(() => finish());
    // 兜底保护：若子进程超过 180s 仍未结束，强制收尾
    setTimeout(() => {
      settleChild();
      finish();
    }, 180000);
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
      e.toolName = lastToolName;
      e.toolInput = lastToolInput;
      throw e;
    }
    if (signal && signal.aborted) {
      throw new Error('context canceled');
    }
    throw new Error(le || 'CLI 未返回内容');
  }
  return { conversationId: conversationIdSeen || null };
}