const fs = require('fs');

let appJs = fs.readFileSync('public/app.js', 'utf-8');

const startMarker = `    // Fill Models Quota List with Progress Bars`;
const endMarker = `    refreshIcons();`;

const startIndex = appJs.indexOf(startMarker);
const endIndex = appJs.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find markers");
  process.exit(1);
}

const replacement = `    // Fill Models Quota List with Progress Bars
    const models = d.modelsQuota || [];
    const listEl = $("#usage-models-list");
    listEl.innerHTML = "";

    models.forEach((m) => {
      const baseId = m.id.replace(/-(low|medium|high)$/i, "");
      const isCurrent = state.selectedModel === m.id || state.selectedModel === baseId || (state.selectedModel || "").startsWith(m.id.split("-")[0]);
      const card = el("div", "quota-model-row" + (isCurrent ? " is-current" : ""));
      card.style.cursor = "pointer";
      card.title = \`点击切换为此模型: \${m.name}\`;
      card.onclick = () => {
        const sel = $("#model-select");
        if (sel) {
          const option = Array.from(sel.options).find(o => o.value === baseId || o.value === m.id);
          if (option) {
            sel.value = option.value;
            state.selectedModel = option.value;
            try { localStorage.setItem("agy-model", state.selectedModel); } catch (_) {}
          }
        }
        const effMatch = m.id.match(/-(low|medium|high)$/i);
        if (effMatch && $("#effort")) {
          $("#effort").value = effMatch[1].toLowerCase();
        }
        toast(\`已选择模型: \${m.name}\`);
        showUsageModal();
      };

      const isUnlimited = (m.quota || "").includes("无限");
      const isPro = (m.quota || "").includes("Pro");
      const isLimited = m.status === "limited";
      let pct = m.percent != null ? m.percent : 100;
      let isModelCooldown = false;

      let resetBadge = "";
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
        resetBadge = \`<span class="quota-tag" style="background:rgba(59,130,246,0.12);color:#3b82f6;border:1px solid rgba(59,130,246,0.25);">⚡ \${countdownText} 后重置</span>\`;
        resetInfoText = \`<span style="color:var(--text-dim);">云端重置时间：\${dDate.toLocaleString()}</span>\`;
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
      }

      const barColor = isModelCooldown ? "#ef4444" : pct > 80 ? "#10b981" : pct > 40 ? "#3b82f6" : "#f59e0b";

      const statusBadge = isModelCooldown
        ? \`<span class="quota-tag" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);font-weight:600;">0% · 冷却冻结</span>\`
        : isLimited 
        ? \`<span class="quota-tag limited">\${pct}% · 受限/按需</span>\`
        : isUnlimited 
        ? \`<span class="quota-tag unlimited">\${pct}% · Pro 无限额度</span>\`
        : isPro
        ? \`<span class="quota-tag pro">\${pct}% · Pro 尊享</span>\`
        : \`<span class="quota-tag standard">\${pct}% · 标准配额</span>\`;

      card.innerHTML = \`
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="series-pill \${escapeHtml((m.series || 'other').toLowerCase())}">\${escapeHtml(m.series || 'Other')}</span>
            <strong style="font-size:13px;">\${escapeHtml(m.name)}</strong>
            \${isCurrent ? '<span class="current-pill">当前生效</span>' : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            \${resetBadge}
            \${statusBadge}
          </div>
        </div>
        <div class="quota-bar-wrap">
          <div class="quota-bar-fill" style="width:\${pct}%;background:\${barColor};"></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;font-size:11.5px;color:var(--text-dim);">
          <span>窗口：\${escapeHtml(m.context || '1M tokens')} · 速度：\${escapeHtml(m.speed || '~100 tok/s')}</span>
          <div style="text-align:right;">
            \${resetInfoText ? \`\${resetInfoText} · \` : ''}
            <span style="color:var(--text-muted);">\${escapeHtml(m.statusText || '')}</span>
          </div>
        </div>
      \`;
      listEl.append(card);
    });

`;

const newAppJs = appJs.slice(0, startIndex) + replacement + appJs.slice(endIndex);
fs.writeFileSync('public/app.js', newAppJs);
console.log("Reverted UI successfully");
