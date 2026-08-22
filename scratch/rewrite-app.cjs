const fs = require('fs');

let appJs = fs.readFileSync('public/app.js', 'utf-8');

// We need to replace the entire models.forEach block inside updateUsageModal
const startMarker = `    models.forEach((m) => {`;
const endMarker = `    $("#metrics-overview").innerHTML = \``;

const startIndex = appJs.indexOf(startMarker);
const endIndex = appJs.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find markers");
  process.exit(1);
}

const replacement = `
    listEl.innerHTML = \`<div id="usage-models-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;"></div>\`;
    const gridEl = listEl.querySelector("#usage-models-grid");

    models.forEach((m) => {
      const baseId = m.id.replace(/-(low|medium|high)$/i, "");
      const isCurrent = state.selectedModel === m.id || state.selectedModel === baseId || (state.selectedModel || "").startsWith(m.id.split("-")[0]);
      
      const card = el("div", "quota-grid-card");
      card.style.background = "var(--bg-sub, #1e1e1e)";
      card.style.border = isCurrent ? "1px solid #3b82f6" : "1px solid var(--border-color, #333)";
      card.style.borderRadius = "8px";
      card.style.padding = "16px";
      card.style.cursor = "pointer";
      card.style.transition = "all 0.2s ease";
      card.title = \`点击切换为此模型: \${m.name}\`;
      
      card.onmouseover = () => card.style.borderColor = "#60a5fa";
      card.onmouseout = () => card.style.borderColor = isCurrent ? "#3b82f6" : "var(--border-color, #333)";
      
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
        toast(\`已切换模型: \${m.name}\`);
        showUsageModal();
      };

      let pct = m.percent != null ? m.percent : 100;
      let isModelCooldown = false;
      if ((m.series === "Claude" || m.id.includes("claude")) && typeof isClaudeInCooldown !== 'undefined' && isClaudeInCooldown) {
        isModelCooldown = true;
        pct = 0;
      }
      
      const circleColor = isModelCooldown ? "#ef4444" : pct >= 40 ? "#4ade80" : pct >= 20 ? "#facc15" : "#ef4444";
      const statusText = isModelCooldown ? "冷却中" : pct >= 40 ? "健康" : pct >= 20 ? "警告" : "危急";
      
      let countdownText = "-";
      let resetDateText = "-";
      if (m.resetTime) {
        const d = new Date(m.resetTime);
        const now = new Date();
        const diff = d - now;
        if (diff > 0) {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
          const mins = Math.floor((diff / (1000 * 60)) % 60);
          countdownText = days > 0 ? \`\${days}d \${hours}h \${mins}m\` : \`\${hours}h \${mins}m\`;
          
          const pad = n => n.toString().padStart(2, '0');
          resetDateText = \`\${d.getFullYear()}/\${pad(d.getMonth()+1)}/\${pad(d.getDate())} \${pad(d.getHours())}:\${pad(d.getMinutes())}\`;
        } else {
          countdownText = "已重置";
          resetDateText = d.toLocaleString();
        }
      } else {
        countdownText = m.resetsIn || "-";
        resetDateText = "-";
      }

      const r = 40;
      const c = 2 * Math.PI * r;
      const offset = c * (1 - pct / 100);

      card.innerHTML = \`
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="font-size:11px;font-weight:600;color:var(--text-dim, #888);display:flex;align-items:center;gap:6px;">
            <span style="font-size:14px;color:\${circleColor}">∷</span> \${escapeHtml(m.name)}
          </div>
          <!-- Toggle switch mock -->
          <div style="width:24px;height:12px;border-radius:12px;background:\${isCurrent ? '#3b82f6' : '#444'};position:relative;">
            <div style="width:10px;height:10px;border-radius:50%;background:#fff;position:absolute;top:1px;\${isCurrent ? 'right:1px;' : 'left:1px;'}"></div>
          </div>
        </div>
        
        <div style="display:flex;justify-content:center;margin-bottom:20px;">
          <div style="position:relative;width:100px;height:100px;">
            <svg width="100" height="100" style="transform:rotate(-90deg);">
              <circle cx="50" cy="50" r="\${r}" fill="none" stroke="#333" stroke-width="8"></circle>
              <circle cx="50" cy="50" r="\${r}" fill="none" stroke="\${circleColor}" stroke-width="8" stroke-dasharray="\${c}" stroke-dashoffset="\${offset}" stroke-linecap="round"></circle>
            </svg>
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:bold;color:#fff;">
              \${pct.toFixed(2)}%
            </div>
          </div>
        </div>
        
        <div style="display:flex;flex-direction:column;gap:8px;font-size:12px;">
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--text-dim, #888);">重置倒计时</span>
            <span style="color:#eee;font-family:monospace;">\${countdownText}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--text-dim, #888);">重置时间</span>
            <span style="color:#eee;font-family:monospace;">\${resetDateText}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--text-dim, #888);">状态</span>
            <span style="color:\${circleColor};font-weight:bold;">\${statusText}</span>
          </div>
        </div>
      \`;
      
      gridEl.appendChild(card);
    });

`;

const newAppJs = appJs.slice(0, startIndex) + replacement + appJs.slice(endIndex);
fs.writeFileSync('public/app.js', newAppJs);
console.log("Successfully replaced rendering logic!");
