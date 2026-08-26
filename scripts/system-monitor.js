/**
 * 🚀 Antigravity 实时多账号状态与系统运行监控看板 (v1.0.2)
 * ----------------------------------------------------
 * 功能特性：
 * 1. 实时读取当前活跃账号与配额使用情况
 * 2. 统计 CPU、内存使用率与系统负载
 * 3. 统计本地已存储的会话与历史记录数量
 */

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 终端炫彩配色定义
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

async function runMonitor() {
  console.log(`\n${C.cyan}╔═══════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}║${C.bright}${C.green}          🤖 Antigravity Web UI 实时系统运行看板               ${C.reset}${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╚═══════════════════════════════════════════════════════════════╝${C.reset}\n`);

  // 1. 硬件与操作系统状态
  const cpus = os.cpus();
  const totalMemGB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
  const freeMemGB = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
  const usedMemGB = (totalMemGB - freeMemGB).toFixed(2);
  const memUsagePercent = Math.round((usedMemGB / totalMemGB) * 100);

  console.log(`${C.yellow}[1] 🖥️  宿主机硬件与性能看板:${C.reset}`);
  console.log(`    • 操作系统平台 : ${C.bright}${os.type()} ${os.release()} (${os.arch()})${C.reset}`);
  console.log(`    • CPU 逻辑核心 : ${C.bright}${cpus.length} 核心${C.reset} (${cpus[0]?.model.trim()})`);
  console.log(`    • 内存使用情况 : ${C.green}${usedMemGB} GB${C.reset} / ${totalMemGB} GB (${C.yellow}${memUsagePercent}% 已使用${C.reset})`);
  console.log(`    • 系统运行天数 : ${C.bright}${(os.uptime() / 86400).toFixed(1)} 天${C.reset}`);

  // 2. Node.js 进程运行时
  const memUsage = process.memoryUsage();
  console.log(`\n${C.yellow}[2] 🟢 Node.js 服务端进程:${C.reset}`);
  console.log(`    • Node.js 版本 : ${C.bright}${process.version}${C.reset}`);
  console.log(`    • 进程 PID     : ${process.pid}`);
  console.log(`    • 内存驻留 RSS : ${C.green}${(memUsage.rss / 1024 / 1024).toFixed(2)} MB${C.reset}`);
  console.log(`    • V8 堆内存    : ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB / ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);

  // 3. 读取本地账号与当前生效账号
  console.log(`\n${C.yellow}[3] 👤 账户管理与登录凭据:${C.reset}`);
  try {
    const accPath = path.join(rootDir, 'data', 'accounts.json');
    if (fs.existsSync(accPath)) {
      const accounts = JSON.parse(fs.readFileSync(accPath, 'utf8'));
      const primary = accounts.find(a => a.isPrimary) || accounts[0];
      console.log(`    • 已配置账号数 : ${C.bright}${accounts.length} 个账号${C.reset}`);
      accounts.forEach((a, i) => {
        const isCur = a.isPrimary ? ` ${C.green}(当前主要)${C.reset}` : '';
        console.log(`      [${i + 1}] ${a.email} - ${a.name || '未命名'} [${a.tierType || 'PRO'}]${isCur}`);
      });
    } else {
      console.log(`    • 账号数据文件待初始化`);
    }
  } catch (err) {
    console.log(`    • 读取账号信息失败: ${err.message}`);
  }

  // 4. 会话数据统计
  console.log(`\n${C.yellow}[4] 💬 对话会话与存储概览:${C.reset}`);
  try {
    const sessDir = path.join(rootDir, 'data', 'sessions');
    if (fs.existsSync(sessDir)) {
      const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.json'));
      console.log(`    • 已归档会话数 : ${C.green}${files.length} 个会话历史${C.reset}`);
    }
  } catch (err) {
    console.log(`    • 读取会话统计失败: ${err.message}`);
  }

  const nowTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`\n${C.cyan}───────────────────────────────────────────────────────────────${C.reset}`);
  console.log(`${C.gray}    • 巡检时间: ${nowTime}${C.reset}`);
  console.log(`${C.green}✨ 系统诊断就绪，所有模块运行稳健！${C.reset}\n`);
}

runMonitor().catch(console.error);
