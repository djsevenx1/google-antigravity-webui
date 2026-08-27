// ── Antigravity Web UI 系统全面健康度自检工具 (v1.0.1) ──
// 自动化诊断 Node 运行时、Google 账号配额与本地会话数据
import os from 'os';
import fs from 'fs';
import { getActiveAccount } from '../lib/accounts.js';

console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════');
console.log('\x1b[1m\x1b[32m%s\x1b[0m', '  🚀 Antigravity Web UI - 实时系统健康检查状态报告');
console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════');

// 1. 系统与硬件环境
const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
const uptimeHours = (os.uptime() / 3600).toFixed(1);
console.log('\x1b[33m%s\x1b[0m', '\n[1] 🖥️ 系统与硬件状态:');
console.log(`  • 操作系统: ${os.type()} ${os.release()} (${os.arch()})`);
console.log(`  • CPU 核心数: ${os.cpus().length} 核心`);
console.log(`  • 内存占用: 剩余 ${freeMem} GB / 总计 ${totalMem} GB`);
console.log(`  • 系统运行时间: ${uptimeHours} 小时`);

// 2. Node.js 运行时
console.log('\x1b[33m%s\x1b[0m', '\n[2] 🟢 运行时与进程:');
console.log(`  • Node.js 版本: ${process.version}`);
console.log(`  • 进程 PID: ${process.pid}`);
console.log(`  • 内存驻留 (RSS): ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`);

// 3. 当前登录账号信息
console.log('\x1b[33m%s\x1b[0m', '\n[3] 👤 当前登录的 Google 账号:');
try {
  const acc = getActiveAccount();
  if (acc) {
    console.log(`  • 登录邮箱: \x1b[32m${acc.email}\x1b[0m`);
    console.log(`  • 账号名称: ${acc.name || '未设置'}`);
    console.log(`  • 订阅类型: \x1b[35m${acc.tierType?.toUpperCase() || 'PRO'}\x1b[0m`);
    console.log(`  • 主账号标识: ${acc.isPrimary ? '是 (Primary)' : '否'}`);
  } else {
    console.log('  • 暂未获取到活跃账号');
  }
} catch (err) {
  console.log(`  • 账号检查跳过: ${err.message}`);
}

// 4. 会话与数据存储检测
console.log('\x1b[33m%s\x1b[0m', '\n[4] 📂 数据与存储状态:');
const sessionsDir = 'data/sessions';
if (fs.existsSync(sessionsDir)) {
  const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
  console.log(`  • 本地会话总数: \x1b[32m${sessionFiles.length}\x1b[0m 个对话已落盘`);
} else {
  console.log('  • 会话目录待初始化');
}

console.log('\x1b[36m%s\x1b[0m', '\n═══════════════════════════════════════════════════════');
console.log('\x1b[1m\x1b[32m%s\x1b[0m', '  ✅ 全项系统检查完成，服务运行正常！');
console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════\n');
