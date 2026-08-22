const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf-8');

code = code.replace(
`      const statusBadge = isModelCooldown || pct <= 0
        ? \`<span class="quota-tag" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);font-weight:600;">0% · 冷却冻结</span>\`
        : isLimited 
        ? \`<span class="quota-tag limited">\${pct}% · 受限/按需</span>\`
        : isUnlimited 
        ? \`<span class="quota-tag unlimited">\${pct}% · Pro 无限额度</span>\`
        : isPro
        ? \`<span class="quota-tag pro">\${pct}% · Pro 尊享</span>\`
        : \`<span class="quota-tag standard">\${pct}% · 标准配额</span>\`;`,
`      const statusBadge = isModelCooldown || pct <= 0
        ? \`<span class="quota-tag" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);font-weight:600;">剩余 0% · 冷却冻结</span>\`
        : isLimited 
        ? \`<span class="quota-tag limited">剩余 \${pct}% · 受限/按需</span>\`
        : isUnlimited 
        ? \`<span class="quota-tag unlimited">剩余 \${pct}% · Pro 无限额度</span>\`
        : isPro
        ? \`<span class="quota-tag pro">剩余 \${pct}% · Pro 尊享</span>\`
        : \`<span class="quota-tag standard">剩余 \${pct}% · 标准配额</span>\`;`
);

fs.writeFileSync('public/app.js', code);
