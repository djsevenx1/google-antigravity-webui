const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf-8');

const target = `      let resetBadge = "";
      let resetInfoText = "";
      if (m.series === "Claude" || m.id.includes("claude")) {
        if (isClaudeInCooldown) {
          isModelCooldown = true;
          pct = 0; // 冷却中配额强制归零！
          resetBadge = \`<span class="quota-tag" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);font-weight:600;">⏳ \${claudeCooldownH}h \${claudeCooldownM}m 重置</span>\`;
          resetInfoText = \`<span style="color:#ef4444;font-weight:600;">⚠️ 配额已耗尽 · \${claudeCooldownH}小时\${claudeCooldownM}分后解封</span>\`;
        } else {
          resetBadge = \`<span class="quota-tag" style="background:rgba(168,85,247,0.12);color:#c084fc;border:1px solid rgba(168,85,247,0.25);">⚡ 5h 滚动 + 每周旗舰</span>\`;
          resetInfoText = \`<span style="color:var(--text-dim);">双重机制：5h 交互频次 · 每周旗舰算力池</span>\`;
        }
      } else if (m.series === "GPT" || m.id.includes("gpt") || m.id.includes("oss")) {
        resetBadge = \`<span class="quota-tag" style="background:rgba(59,130,246,0.12);color:#3b82f6;border:1px solid rgba(59,130,246,0.25);">⚡ 5h 滚动重置</span>\`;
        resetInfoText = \`<span style="color:var(--text-dim);">重置周期：5小时滚动 · 开源算力池</span>\`;
      } else if (m.series === "Gemini" || m.id.includes("gemini")) {
        resetBadge = \`<span class="quota-tag" style="background:rgba(16,185,129,0.08);color:#10b981;border:1px solid rgba(16,185,129,0.2);">⚡ 5h 滚动重置</span>\`;
        resetInfoText = \`<span style="color:var(--text-dim);">重置周期：5小时滚动 · 原生算力池</span>\`;
      }`;

const replacement = `      let resetBadge = "";
      let resetInfoText = "";
      
      if (m.resetTime) {
        const dDate = new Date(m.resetTime);
        const diff = dDate - new Date();
        let countdownText = "";
        if (diff > 0) {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
          const mins = Math.floor((diff / (1000 * 60)) % 60);
          countdownText = days > 0 ? \`\${days}d \${hours}h \${mins}m\` : \`\${hours}h \${mins}m\`;
        } else {
          countdownText = "已重置";
        }
        
        if (pct <= 0 && diff > 0) {
          isModelCooldown = true;
          resetBadge = \`<span class="quota-tag" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);font-weight:600;">⏳ \${countdownText} 后解封</span>\`;
          resetInfoText = \`<span style="color:#ef4444;font-weight:600;">⚠️ 配额已耗尽 · 等待云端重置</span>\`;
        } else {
          resetBadge = \`<span class="quota-tag" style="background:rgba(59,130,246,0.12);color:#3b82f6;border:1px solid rgba(59,130,246,0.25);">⚡ 实时倒计时: \${countdownText}</span>\`;
          resetInfoText = \`<span style="color:var(--text-dim);">实时云端重置时间：\${dDate.toLocaleString()}</span>\`;
        }
      } else {
        if (m.series === "Claude" || m.id.includes("claude")) {
          if (typeof isClaudeInCooldown !== 'undefined' && isClaudeInCooldown) {
            isModelCooldown = true;
            pct = 0; 
            resetBadge = \`<span class="quota-tag" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);font-weight:600;">⏳ \${claudeCooldownH}h \${claudeCooldownM}m 重置</span>\`;
            resetInfoText = \`<span style="color:#ef4444;font-weight:600;">⚠️ 配额已耗尽 · \${claudeCooldownH}小时\${claudeCooldownM}分后解封</span>\`;
          } else {
            resetBadge = \`<span class="quota-tag" style="background:rgba(168,85,247,0.12);color:#c084fc;border:1px solid rgba(168,85,247,0.25);">⚡ 5h 滚动 + 每周旗舰</span>\`;
            resetInfoText = \`<span style="color:var(--text-dim);">双重机制：5h 交互频次 · 每周旗舰算力池</span>\`;
          }
        } else if (m.series === "GPT" || m.id.includes("gpt") || m.id.includes("oss")) {
          resetBadge = \`<span class="quota-tag" style="background:rgba(59,130,246,0.12);color:#3b82f6;border:1px solid rgba(59,130,246,0.25);">⚡ 5h 滚动重置</span>\`;
          resetInfoText = \`<span style="color:var(--text-dim);">重置周期：5小时滚动 · 开源算力池</span>\`;
        } else if (m.series === "Gemini" || m.id.includes("gemini")) {
          resetBadge = \`<span class="quota-tag" style="background:rgba(16,185,129,0.08);color:#10b981;border:1px solid rgba(16,185,129,0.2);">⚡ 5h 滚动重置</span>\`;
          resetInfoText = \`<span style="color:var(--text-dim);">重置周期：5小时滚动 · 原生算力池</span>\`;
        }
      }`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  
  // Also fix the unlimited bug where 0% might show 100% Pro
  code = code.replace(
`      const statusBadge = isModelCooldown
        ? \`<span class="quota-tag" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);font-weight:600;">0% · 冷却冻结</span>\`
        : isLimited 
        ? \`<span class="quota-tag limited">\${pct}% · 受限/按需</span>\`
        : isUnlimited 
        ? \`<span class="quota-tag unlimited">100% · Pro 无限额度</span>\`
        : isPro
        ? \`<span class="quota-tag pro">\${pct}% · Pro 尊享</span>\`
        : \`<span class="quota-tag standard">\${pct}% · 标准配额</span>\`;`,
`      const statusBadge = isModelCooldown || pct <= 0
        ? \`<span class="quota-tag" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);font-weight:600;">0% · 冷却冻结</span>\`
        : isLimited 
        ? \`<span class="quota-tag limited">\${pct}% · 受限/按需</span>\`
        : isUnlimited 
        ? \`<span class="quota-tag unlimited">\${pct}% · Pro 无限额度</span>\`
        : isPro
        ? \`<span class="quota-tag pro">\${pct}% · Pro 尊享</span>\`
        : \`<span class="quota-tag standard">\${pct}% · 标准配额</span>\`;`
  );

  fs.writeFileSync('public/app.js', code);
  console.log("Patched app.js successfully!");
} else {
  console.log("Could not find target in app.js");
}
