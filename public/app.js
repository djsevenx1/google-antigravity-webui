// Google Antigravity Web UI - Modernized Frontend Application

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// Global App State
const state = {
  status: null,
  models: [],
  selectedModel: null,
  conversations: [],     // [{id, title, messages:[{role, content}], convId, createdAt}]
  activeId: null,
  streaming: false,
  pendingQueue: [],
  searchQuery: "",
  codeFile: null
};

const CONV_KEY = "agy-convs-v2";
const ACTIVE_KEY = "agy-active-conv-v2";

// Configure Marked & Highlight.js
if (typeof marked !== "undefined") {
  marked.setOptions({
    highlight: function(code, lang) {
      if (typeof hljs !== "undefined" && lang && hljs.getLanguage(lang)) {
        try { return hljs.highlight(code, { language: lang }).value; } catch (_) {}
      }
      if (typeof hljs !== "undefined") {
        try { return hljs.highlightAuto(code).value; } catch (_) {}
      }
      return code;
    },
    breaks: true,
    gfm: true
  });
}

function refreshIcons() {
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons();
  }
}

function activeConv() {
  return state.conversations.find((c) => c.id === state.activeId) || null;
}

let _saveTimeout = null;
function saveConversations(immediate = false) {
  try {
    const slim = state.conversations.map((c) => ({
      id: c.id,
      title: c.title,
      messages: c.messages,
      convId: c.convId,
      createdAt: c.createdAt || Date.now(),
      updatedAt: c.updatedAt || Date.now()
    }));
    // 本地缓存备份（离线保护）
    localStorage.setItem(CONV_KEY, JSON.stringify(slim));
    localStorage.setItem(ACTIVE_KEY, state.activeId || "");
  } catch (_) {}

  const conv = activeConv();
  if (!conv) return;

  const doSync = async () => {
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: conv.id,
          title: conv.title,
          messages: conv.messages,
          convId: conv.convId,
          createdAt: conv.createdAt,
          updatedAt: Date.now()
        })
      });
    } catch (_) {}
  };

  if (immediate) {
    if (_saveTimeout) clearTimeout(_saveTimeout);
    doSync();
  } else {
    if (_saveTimeout) clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(doSync, 500);
  }
}

async function loadConversations() {
  // 1. 先尝试读取本地缓存以达到 0 延迟秒开页面
  try {
    const raw = localStorage.getItem(CONV_KEY) || localStorage.getItem("agy-convs");
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) state.conversations = arr;
    }
    const last = localStorage.getItem(ACTIVE_KEY) || localStorage.getItem("agy-active-conv") || "";
    if (last && state.conversations.some((c) => c.id === last)) {
      state.activeId = last;
    } else if (state.conversations.length) {
      state.activeId = state.conversations[0].id;
    }
  } catch (_) {}

  // 2. 从服务端（文件数据库）拉取完整会话历史并同步
  try {
    const res = await fetch("/api/sessions");
    const data = await res.json();
    if (data && data.ok && Array.isArray(data.sessions) && data.sessions.length > 0) {
      state.conversations = data.sessions;
      if (!state.activeId || !state.conversations.some((c) => c.id === state.activeId)) {
        state.activeId = state.conversations[0].id;
      }
      renderConvList();
      paintActiveConv();
    } else {
      // 服务端为空时，把当前本地可能存在的会话自动迁移上传到服务端
      const localRaw = localStorage.getItem(CONV_KEY) || localStorage.getItem("agy-convs");
      if (localRaw) {
        const localArr = JSON.parse(localRaw);
        if (Array.isArray(localArr) && localArr.length > 0) {
          await fetch("/api/sessions/migrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessions: localArr })
          });
        }
      }
    }
  } catch (_) {}

  if (!state.conversations.length) {
    newChat(true);
  } else {
    renderConvList();
    paintActiveConv();
  }
}

// Toast Notifications
let toastTimer = null;
function toast(msg, ms = 2800) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
}

// Modal Control
function openModal(title, bodyHTML, isLarge = false) {
  $("#modal-title").innerHTML = title;
  $("#modal-body").innerHTML = bodyHTML;
  const dialog = $("#modal-dialog");
  dialog.classList.toggle("large", isLarge);
  $("#modal-root").classList.remove("hidden");
  refreshIcons();
}

function closeModal() {
  $("#modal-root").classList.add("hidden");
  $("#modal-dialog").classList.remove("large");
}

$("#modal-close").addEventListener("click", closeModal);
$("#modal-root").addEventListener("click", (e) => {
  if (e.target === $("#modal-root")) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#modal-root").classList.contains("hidden")) {
    closeModal();
  }
  // Ctrl+K / Cmd+K for new chat
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    newChat();
  }
});

// Escape HTML
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Theme Toggle
function applyTheme(t) {
  const root = document.documentElement;
  root.setAttribute("data-theme", t);
  const icon = $("#theme-icon");
  if (icon) {
    icon.setAttribute("data-lucide", t === "dark" ? "sun" : "moon");
    refreshIcons();
  }
  const hljsTheme = $("#hljs-theme");
  if (hljsTheme) {
    hljsTheme.href = t === "dark"
      ? "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css"
      : "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css";
  }
  try { localStorage.setItem("agy-theme", t); } catch (_) {}
}

function initTheme() {
  let t = "dark";
  try { t = localStorage.getItem("agy-theme") || "dark"; } catch (_) {}
  applyTheme(t);
}

// Render Sidebar & Usage Summary
function updateUsageSummary(quotaData = null) {
  const badgeEl = $("#usage-sidebar-badge");
  if (!badgeEl) return;
  if (quotaData && quotaData.windows && quotaData.windows.fiveHour) {
    const w = quotaData.windows.fiveHour;
    badgeEl.textContent = `5h: ${w.percent}%`;
    badgeEl.title = `5小时配额: ${w.percent}% (${w.resetsIn}后重置)`;
  } else {
    // 异步拉取最新 5小时配额更新侧边栏胶囊
    fetch("/api/usage").then((r) => r.json()).then((d) => {
      if (d && d.windows && d.windows.fiveHour) {
        const w = d.windows.fiveHour;
        badgeEl.textContent = `5h: ${w.percent}%`;
        badgeEl.title = `5小时配额: ${w.percent}% (${w.resetsIn}后重置)`;
      }
    }).catch(() => {});
  }
}

function renderLoginArea() {
  const area = $("#login-area");
  area.innerHTML = "";
  const st = state.status;
  const authed = Boolean(st && st.cli && st.cli.installed && st.cli.authenticated);

  updateUsageSummary();

  const googleAcc = st && st.googleAccount;
  if (googleAcc) {
    const userWrap = el("div", "flex items-center gap-2");
    userWrap.style.cssText = "cursor:pointer;padding:2px 8px 2px 3px;border-radius:18px;background:var(--bg-secondary);border:1px solid var(--border-color);display:inline-flex;align-items:center;";
    userWrap.title = `Google 授权账号: ${googleAcc.name || ''} (${googleAcc.email})\n点击打开模型用量与配额中心`;
    userWrap.onclick = () => showUsageModal();
    if (googleAcc.picture) {
      const img = el("img", "avatar");
      img.src = googleAcc.picture;
      img.style.cssText = "width:22px;height:22px;border-radius:50%;object-fit:cover;";
      userWrap.append(img);
    }
    const nameSpan = el("span", "", googleAcc.name || googleAcc.email);
    nameSpan.style.cssText = "font-size:12px;color:var(--text-primary);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;";
    userWrap.append(nameSpan);
    area.append(userWrap);
    refreshIcons();
    return;
  }

  if (st && st.user) {
    const userWrap = el("div", "flex items-center gap-2");
    if (st.user.picture) {
      const img = el("img", "avatar");
      img.src = st.user.picture;
      img.style.cssText = "width:26px;height:26px;border-radius:50%;object-fit:cover;";
      userWrap.append(img);
    }
    const nameSpan = el("span", "", st.user.name || st.user.email);
    nameSpan.style.cssText = "font-size:12px;color:var(--text-muted);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    userWrap.append(nameSpan);

    const logoutBtn = el("button", "btn btn-ghost btn-icon");
    logoutBtn.title = "退出登录";
    logoutBtn.innerHTML = `<i data-lucide="log-out" style="width:15px;height:15px;"></i>`;
    logoutBtn.onclick = async () => {
      await fetch("/auth/logout", { method: "POST" });
      location.reload();
    };
    userWrap.append(logoutBtn);
    area.append(userWrap);
    refreshIcons();
    return;
  }

  if (st && st.cli && st.cli.installed) {
    const connectBtn = el("button", "btn " + (authed ? "btn-ghost" : "btn-primary"));
    connectBtn.style.padding = "4px 10px";
    connectBtn.style.fontSize = "12px";
    connectBtn.innerHTML = authed
      ? `<i data-lucide="shield-check" style="width:14px;height:14px;color:var(--success);"></i><span>已认证</span>`
      : `<i data-lucide="key-round" style="width:14px;height:14px;"></i><span>Google 登录</span>`;
    connectBtn.onclick = () => showCliLogin();
    area.append(connectBtn);
    refreshIcons();
    return;
  }

  const oauthBtn = el("button", "btn btn-primary");
  oauthBtn.textContent = "Google 登录";
  oauthBtn.onclick = () => {
    if (!state.status || !state.status.oauthConfigured) {
      toast("请先安装 Antigravity CLI 或配置 clientId");
      return;
    }
    location.href = "/auth/login";
  };
  area.append(oauthBtn);
}

// Conversation List
function renderConvList() {
  const list = $("#conv-list");
  list.innerHTML = "";
  const query = state.searchQuery.trim().toLowerCase();

  const filtered = state.conversations.filter((c) => {
    if (!query) return true;
    return (c.title || "").toLowerCase().includes(query) ||
           (c.messages || []).some(m => String(m.content || "").toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    const empty = el("div", "", query ? "无匹配会话" : "暂无历史会话");
    empty.style.cssText = "padding:20px;text-align:center;color:var(--text-dim);font-size:12px;";
    list.append(empty);
    return;
  }

  filtered.forEach((c) => {
    const item = el("div", "session-item" + (c.id === state.activeId ? " active" : ""));
    
    const titleSpan = el("span", "session-title", c.title || "新对话");
    titleSpan.title = c.title || "新对话";

    const actions = el("div", "session-actions");
    
    // Rename button
    const renameBtn = el("button", "session-action-btn");
    renameBtn.title = "重命名";
    renameBtn.innerHTML = `<i data-lucide="edit-3" style="width:13px;height:13px;"></i>`;
    renameBtn.onclick = (e) => {
      e.stopPropagation();
      promptRenameConv(c.id);
    };

    // Delete button
    const delBtn = el("button", "session-action-btn");
    delBtn.title = "删除会话";
    delBtn.innerHTML = `<i data-lucide="trash-2" style="width:13px;height:13px;"></i>`;
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteConv(c.id);
    };

    actions.append(renameBtn);
    actions.append(delBtn);

    item.append(titleSpan);
    item.append(actions);

    item.onclick = () => selectConv(c.id);
    list.append(item);
  });
  refreshIcons();
}

function promptRenameConv(id) {
  const c = state.conversations.find((x) => x.id === id);
  if (!c) return;
  const newName = prompt("请输入会话新名称：", c.title);
  if (newName && newName.trim()) {
    c.title = newName.trim();
    saveConversations(true);
    renderConvList();
  }
}

function selectConv(id) {
  if (state.streaming) return toast("正在生成中，请等待完成或停止");
  state.activeId = id;
  renderConvList();
  paintActiveConv();
  closeSidebar();
}

async function deleteConv(id) {
  if (state.streaming && id === state.activeId) return toast("正在生成中，请先停止");
  const idx = state.conversations.findIndex((c) => c.id === id);
  if (idx === -1) return;
  state.conversations.splice(idx, 1);
  if (state.activeId === id) {
    const next = state.conversations[idx] || state.conversations[idx - 1];
    state.activeId = next ? next.id : null;
  }
  try {
    await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (_) {}
  saveConversations(true);
  renderConvList();
  paintActiveConv();
}

function newChat(silent = false) {
  if (state.streaming && !silent) return toast("正在生成中，请先停止");
  const c = {
    id: "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: "新对话",
    messages: [],
    convId: "",
    createdAt: Date.now()
  };
  state.conversations.unshift(c);
  state.activeId = c.id;
  saveConversations();
  renderConvList();
  paintActiveConv();
  if (!silent) closeSidebar();
  $("#input").focus();
}

// Sidebar Drawer (Mobile)
function openSidebar() {
  $("#sidebar").classList.add("open");
  $("#sidebar-backdrop").classList.remove("hidden");
}
function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#sidebar-backdrop").classList.add("hidden");
}

$("#btn-menu").addEventListener("click", () => {
  const s = $("#sidebar");
  s.classList.contains("open") ? closeSidebar() : openSidebar();
});
$("#sidebar-backdrop").addEventListener("click", closeSidebar);

// Session search
$("#session-search").addEventListener("input", (e) => {
  state.searchQuery = e.target.value;
  renderConvList();
});

// Markdown & Code Highlighting Parser with Continuous Streaming Thinking Support
function formatMarkdown(text, isStreaming = false) {
  if (!text) return "";
  let processed = text.replace(/\u200b/g, "");
  
  // 1. Handle complete <thought>...</thought> blocks
  processed = processed.replace(/<thought>([\s\S]*?)<\/thought>/gi, (match, p1) => {
    return `<details class="thinking-block"><summary class="thinking-summary"><span style="display:flex;align-items:center;gap:6px;"><span>💭</span><span>思考过程 (已完成)</span></span><span style="font-size:11px;opacity:0.6;">▾</span></summary><div class="thinking-content">${escapeHtml(p1.trim())}</div></details>`;
  });

  // 2. Handle ACTIVE / UNCLOSED <thought> during streaming (Model is actively thinking!)
  let activeThinkingHtml = "";
  if (processed.includes("<thought>")) {
    const parts = processed.split("<thought>");
    const beforeThought = parts[0];
    const currentThought = parts.slice(1).join("<thought>");
    
    activeThinkingHtml = `<details class="thinking-block active" open><summary class="thinking-summary"><span style="display:flex;align-items:center;gap:6px;"><span class="thinking-dots"><i></i><i></i><i></i></span><span style="color:var(--accent);font-weight:500;">正在深度思考中...</span></span><span style="font-size:11px;opacity:0.6;">▾</span></summary><div class="thinking-content">${escapeHtml(currentThought)}<span class="streaming-cursor"></span></div></details>`;
    processed = beforeThought;
  }

  let finalHtml = "";
  if (processed.trim()) {
    if (typeof marked !== "undefined") {
      try {
        let rawHtml = marked.parse(processed);
        // Wrap code blocks
        rawHtml = rawHtml.replace(/<pre><code class="language-([^">]+)">([\s\S]*?)<\/code><\/pre>/gi, (match, lang, code) => {
          return `<div class="code-block-wrapper"><div class="code-block-header"><span>${escapeHtml(lang)}</span><button class="copy-code-btn" onclick="copyCodeFromBlock(this)"><i data-lucide="copy" style="width:12px;height:12px;"></i> 复制</button></div><pre><code class="language-${lang}">${code}</code></pre></div>`;
        });
        rawHtml = rawHtml.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi, (match, code) => {
          return `<div class="code-block-wrapper"><div class="code-block-header"><span>CODE</span><button class="copy-code-btn" onclick="copyCodeFromBlock(this)"><i data-lucide="copy" style="width:12px;height:12px;"></i> 复制</button></div><pre><code>${code}</code></pre></div>`;
        });
        finalHtml = rawHtml;
      } catch (_) {
        finalHtml = escapeHtml(processed).replace(/\n/g, "<br/>");
      }
    } else {
      finalHtml = escapeHtml(processed).replace(/\n/g, "<br/>");
    }
  }

  let result = activeThinkingHtml ? (activeThinkingHtml + finalHtml) : finalHtml;
  if (isStreaming && !activeThinkingHtml && result) {
    result += `<span class="streaming-cursor"></span>`;
  }
  return result || (isStreaming ? `<div class="thinking-active-indicator" style="display:inline-flex;align-items:center;gap:6px;"><span class="thinking-dots"><i></i><i></i><i></i></span><span style="font-size:12.5px;color:var(--text-muted);">正在思考中...</span></div>` : "");
}

window.copyCodeFromBlock = function(btn) {
  const wrapper = btn.closest(".code-block-wrapper");
  if (!wrapper) return;
  const code = wrapper.querySelector("code");
  if (!code) return;
  const text = code.innerText || code.textContent;
  navigator.clipboard.writeText(text).then(() => {
    btn.innerHTML = `<i data-lucide="check" style="width:12px;height:12px;color:var(--success);"></i> 已复制`;
    refreshIcons();
    setTimeout(() => {
      btn.innerHTML = `<i data-lucide="copy" style="width:12px;height:12px;"></i> 复制`;
      refreshIcons();
    }, 2000);
  }).catch(() => toast("复制失败"));
};

// Paint Active Conversation
function paintActiveConv() {
  const c = activeConv();
  const feed = $("#chat-feed");
  const empty = $("#chat-empty");
  feed.innerHTML = "";

  if (!c || !c.messages || c.messages.length === 0) {
    empty.classList.remove("hidden");
    feed.classList.add("hidden");
    return;
  }

  empty.classList.add("hidden");
  feed.classList.remove("hidden");

  c.messages.forEach((m) => {
    appendMsgRow(m.role, m.content, false, m.meta, m.tools);
  });
  feed.scrollTop = feed.scrollHeight;
  refreshIcons();
}

function appendMsgRow(role, content, isStreaming = false, meta = null, tools = null) {
  const feed = $("#chat-feed");
  const row = el("div", "message-row " + role + (isStreaming ? " streaming" : ""));
  
  const avatar = el("div", "message-avatar");
  if (role === "user") {
    avatar.innerHTML = `<i data-lucide="user" style="width:16px;height:16px;"></i>`;
  } else if (role === "error") {
    avatar.innerHTML = `<i data-lucide="alert-triangle" style="width:16px;height:16px;"></i>`;
  } else {
    avatar.innerHTML = `◇`;
  }

  const contentCol = el("div", "message-content");
  
  const header = el("div", "message-header");
  header.textContent = role === "user" ? "You" : (state.selectedModel || "Antigravity Agent");
  contentCol.append(header);

  let bubble;
  if (role === "assistant") {
    bubble = el("div", "message-bubble markdown-body");
    // 渲染工具执行事件（刷新后从 localStorage 恢复）
    if (tools && tools.length) {
      const toolHtml = tools.map(t => {
        const icon = t.tool === 'run_command' ? '▶' : (t.tool === 'view_file' ? '📄' : '🔧');
        const label = t.tool === 'run_command' ? '执行命令' : (t.tool === 'view_file' ? '查看文件' : (t.tool || '工具'));
        return `<details class="tool-event-box"><summary><span class="tool-icon">${icon}</span> <span class="tool-label">${escapeHtml(label)}</span> <span class="tool-step">${escapeHtml(t.stepType || '')}</span></summary><div class="tool-detail">${escapeHtml(t.tip || '')}</div></details>`;
      }).join('');
      bubble.innerHTML = toolHtml;
    }
    const clean = String(content || "").replace(/[\u200b\s]/g, "");
    if (isStreaming && !clean) {
      bubble.innerHTML = `<div class="thinking-active-indicator" style="display:inline-flex;align-items:center;gap:6px;"><span class="thinking-dots"><i></i><i></i><i></i></span><span style="font-size:12.5px;color:var(--text-muted);">正在思考中...</span></div>`;
    } else {
      bubble.innerHTML = formatMarkdown(content);
      if (!isStreaming && clean) {
        const durText = meta?.duration ? `${meta.duration}s` : '';
        const tokens = meta?.tokens || Math.max(1, Math.round(clean.length / 3.2));
        const modelName = formatModelShortName(meta?.model || state.selectedModel);
        bubble.innerHTML += `
          <div class="msg-usage-pill" title="模型用量与生成统计">
            <i data-lucide="zap" style="width:11px;height:11px;color:var(--accent);"></i>
            <span>${escapeHtml(modelName)}</span>
            <span>·</span>
            <span>${tokens} tokens</span>
            ${durText ? `<span>·</span><span>${escapeHtml(durText)}</span>` : ''}
          </div>
        `;
      }
    }
  } else {
    bubble = el("div", "message-bubble");
    bubble.textContent = content;
  }
  contentCol.append(bubble);

  row.append(avatar);
  row.append(contentCol);
  feed.append(row);
  feed.scrollTop = feed.scrollHeight;
  refreshIcons();

  return { row, bubble };
}

// Models & Controls
async function refreshModels() {
  try {
    const r = await fetch("/api/models");
    const data = await r.json();
    state.models = data.models || [];
    renderModelSelect();
  } catch (_) {
    state.models = [];
  }
}

function formatModelDisplayName(m) {
  if (!m) return "";
  if (m.startsWith("gemini-3.7-flash")) return "Gemini 3.7 Flash";
  if (m.startsWith("gemini-3.6-flash")) return "Gemini 3.6 Flash";
  if (m.startsWith("gemini-3.5-flash")) return "Gemini 3.5 Flash";
  if (m.startsWith("gemini-3.1-pro")) return "Gemini 3.1 Pro";
  if (m.includes("claude-sonnet")) return "Claude Sonnet 4.6";
  if (m.includes("claude-opus")) return "Claude Opus 4.6 (Thinking)";
  if (m.includes("gpt-oss")) return "GPT-OSS 120B";
  return m;
}

function formatModelShortName(m) {
  if (!m) return "";
  if (m.startsWith("gemini-3.7")) return "Gemini 3.7";
  if (m.startsWith("gemini-3.6")) return "Gemini 3.6";
  if (m.startsWith("gemini-3.5")) return "Gemini 3.5";
  if (m.startsWith("gemini-3.1")) return "Gemini 3.1 Pro";
  if (m.includes("claude-sonnet")) return "Claude Sonnet";
  if (m.includes("claude-opus")) return "Claude Opus";
  if (m.includes("gpt-oss")) return "GPT-OSS";
  return m;
}

function getBaseModels(rawModels) {
  const cleanList = [];
  const seen = new Set();
  
  const predefined = [
    { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
    { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 (Thinking)" },
    { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B" }
  ];

  predefined.forEach((p) => {
    const matched = (rawModels || []).some((m) => m.startsWith(p.id) || m === p.id);
    if (matched || !rawModels || rawModels.length === 0) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        cleanList.push(p);
      }
    }
  });

  // 加入其他 CLI 发现的模型
  (rawModels || []).forEach((m) => {
    const baseId = m.replace(/-(low|medium|high)$/i, "");
    if (!seen.has(baseId)) {
      seen.add(baseId);
      cleanList.push({ id: baseId, label: formatModelDisplayName(baseId) });
    }
  });

  return cleanList;
}

function resolveActualModelName(baseModel, effort) {
  if (!baseModel) return "gemini-3.7-flash-high";
  const eff = String(effort || "").trim().toLowerCase();
  
  if (baseModel.startsWith("gemini-3.7-flash")) {
    if (eff === "high") return "gemini-3.7-flash-high";
    if (eff === "medium") return "gemini-3.7-flash-medium";
    if (eff === "low") return "gemini-3.7-flash-low";
    if (eff === "off") return "gemini-3.7-flash-low";
    return "gemini-3.7-flash-high";
  }
  if (baseModel.startsWith("gemini-3.6-flash")) {
    if (eff === "low") return "gemini-3.6-flash-low";
    return "gemini-3.6-flash-high";
  }
  if (baseModel.startsWith("gemini-3.5-flash")) {
    if (eff === "low") return "gemini-3.5-flash-low";
    return "gemini-3.5-flash-high";
  }
  if (baseModel.startsWith("gemini-3.1-pro")) {
    if (eff === "low") return "gemini-3.1-pro-low";
    return "gemini-3.1-pro-high";
  }
  return baseModel;
}

function renderModelSelect() {
  const sel = $("#model-select");
  sel.innerHTML = "";
  const baseModels = getBaseModels(state.models);
  
  if (!baseModels.length) {
    const o = el("option", "", "无可用模型");
    o.value = "";
    sel.append(o);
    return;
  }
  
  baseModels.forEach((m) => {
    const o = el("option", "", m.label);
    o.value = m.id;
    sel.append(o);
  });

  let saved = localStorage.getItem("agy-model") || state.selectedModel;
  if (saved) {
    saved = saved.replace(/-(low|medium|high)$/i, "");
  }
  if (!saved || !baseModels.some((m) => m.id === saved)) {
    saved = baseModels[0].id;
  }
  state.selectedModel = saved;
  sel.value = saved;
}

$("#model-select").addEventListener("change", (e) => {
  state.selectedModel = e.target.value;
  try { localStorage.setItem("agy-model", state.selectedModel); } catch (_) {}
});

// Auto-grow Input
const inputArea = $("#input");
function autoResizeInput() {
  inputArea.style.height = "auto";
  inputArea.style.height = Math.min(inputArea.scrollHeight, 160) + "px";
}
inputArea.addEventListener("input", autoResizeInput);

inputArea.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

// Starter Prompts Click
$$(".starter-card").forEach((card) => {
  card.addEventListener("click", () => {
    const p = card.getAttribute("data-prompt");
    if (p) {
      inputArea.value = p;
      autoResizeInput();
      handleSend();
    }
  });
});

let abortCtrl = null;
let currentWs = null;
function updateSendButton() {
  const btn = $("#btn-send");
  const icon = $("#send-icon");
  if (state.streaming) {
    btn.classList.add("stop");
    btn.title = "停止生成";
    icon.setAttribute("data-lucide", "square");
    btn.disabled = false;
  } else {
    btn.classList.remove("stop");
    btn.title = "发送 (Enter)";
    icon.setAttribute("data-lucide", "arrow-up");
    btn.disabled = !state.selectedModel;
  }
  refreshIcons();
}

function stopGenerating() {
  if (currentWs) { try { currentWs.close(); } catch (_) {} currentWs = null; }
  if (abortCtrl) {
    abortCtrl.abort();
  }
  const conv = activeConv();
  if (conv) {
    fetch("/api/chat/abort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationKey: conv.id, conversationId: conv.convId })
    }).catch(() => {});
  }
}

async function handleSend() {
  if (state.streaming) {
    stopGenerating();
    return;
  }
  const text = inputArea.value.trim();
  if (!text) return;
  if (!state.selectedModel) return toast("请先选择模型");

  inputArea.value = "";
  autoResizeInput();

  let conv = activeConv();
  if (!conv) {
    newChat(true);
    conv = activeConv();
  }

  // Auto Title
  if (conv.title === "新对话") {
    conv.title = text.slice(0, 20) + (text.length > 20 ? "..." : "");
    renderConvList();
  }

  await runConversationTurn(text, true);
}

async function runConversationTurn(text, appendUserMsg = true) {
  const conv = activeConv();
  if (!conv) return;

  if (appendUserMsg) {
    conv.messages.push({ role: "user", content: text });
    saveConversations();
  }

  paintActiveConv();
  const asstNode = appendMsgRow("assistant", "", true);

  state.streaming = true;
  abortCtrl = new AbortController();
  updateSendButton();

  let acc = "";
  let newConvId = null;
  let toolEvents = []; // 收集工具执行事件，刷新后可恢复

  let hasError = false;
  let wakeLock = null;
  try {
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then((wl) => { wakeLock = wl; }).catch(() => {});
    }
  } catch (_) {}

  const MAX_NET_RETRIES = 15;
  let netRetryCount = 0;

  try {
    while (true) {
      let streamError = null;
      let needsPerm = false;
      let permMsg = "";
      let receivedDone = false;

    try {
      // ── WebSocket 替代 SSE：解决反向代理对长连接 HTTP 响应的缓冲/超时掐断 ──
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${location.host}/ws/chat`;
      const ws = new WebSocket(wsUrl);
      currentWs = ws;

      await new Promise((resolve, reject) => {
        let settled = false;
        const done = (fn) => { if (!settled) { settled = true; fn(); } };

        ws.onopen = () => {
          acc = ""; // 每次连接重放时从头构建，防止重连造成文本重复叠加
          const effortVal = $("#effort")?.value || "";
          const actualModel = resolveActualModelName(state.selectedModel, effortVal);
          ws.send(JSON.stringify({
            model: actualModel,
            messages: conv.messages,
            effort: effortVal,
            permissions: $("#permissions")?.value || "",
            conversationKey: conv.id,
            conversationId: conv.convId || newConvId || undefined
          }));
        };

        ws.onmessage = (event) => {
          let data;
          try { data = JSON.parse(event.data); } catch (_) { return; }
          if (data.meta && data.meta.needsPermission) { needsPerm = true; permMsg = data.error || "CLI 需要授权"; return; }
          if (data.meta && data.meta.quotaExceeded) { streamError = Object.assign(new Error(data.error || "模型配额已用尽"), { quotaExceeded: true }); done(() => reject(streamError)); return; }
          if (data.error) { streamError = new Error(data.error); done(() => reject(streamError)); return; }
          if (data.progress) {
            const tipText = data.tip || "正在思考…";
            const waitText = data.waited ? ` (${data.waited}s)` : "";
            // 收集工具执行事件
            if (data.toolName) {
              toolEvents.push({ tool: data.toolName, stepType: data.stepType || '', tip: tipText, waited: data.waited || 0 });
            }
            const cleanAcc = (acc || "").replace(/​/g, "").trim();
            if (!cleanAcc) {
              asstNode.bubble.innerHTML = `<div class="thinking-active-indicator" style="display:inline-flex;align-items:center;gap:8px;padding:4px 0;"><span class="thinking-dots"><i></i><i></i><i></i></span><span style="font-size:13px;color:var(--accent);font-weight:500;">${escapeHtml(tipText)}</span><span style="font-size:11px;color:var(--text-dim);">${escapeHtml(waitText)}</span></div>`;
            }
            return;
          }
          if (data.delta != null) {
            acc += data.delta;
            asstNode.bubble.innerHTML = formatMarkdown(acc, true);
            refreshIcons();
            $("#chat-feed").scrollTop = $("#chat-feed").scrollHeight;
          }
          if (data.conversationId) {
            newConvId = data.conversationId;
            conv.convId = data.conversationId;
            saveConversations();
          }
          if (data.done) { receivedDone = true; done(() => resolve()); }
        };

        ws.onerror = () => { done(() => reject(new Error('network error'))); };
        ws.onclose = () => {
          // 借鉴 CloudCLI：onclose 不放弃，自动重连。
          // 浏览器切后台会杀 WebSocket，但后端 Run Registry 一直在跑——重连后回放所有错过的事件。
          if (receivedDone) { done(() => resolve()); return; }
          if (streamError) { done(() => reject(streamError)); return; }
          if (needsPerm) { done(() => reject(Object.assign(new Error(permMsg), { needsPermission: true }))); return; }
          // 没收到 done = 后台还在跑，浏览器把连接杀了 → 当 network error 触发重试
          done(() => reject(new Error('network error')));
        };
      });

      currentWs = null;
      if (streamError) throw streamError;
      if (needsPerm) throw Object.assign(new Error(permMsg), { needsPermission: true });
      break;
    } catch (e) {
      const isAbort = e && e.name === "AbortError";
      const errMsg = (e && e.message) || "请求失败（未知错误）";
      const isNetErr = /network error|failed to fetch|load failed/i.test(errMsg);

      if (isNetErr && !isAbort && netRetryCount < MAX_NET_RETRIES) {
        netRetryCount++;
        const cleanAcc = (acc || "").replace(/​/g, "").trim();
        const tip = `网络连接抖动，正在自动续接 (第 ${netRetryCount}/${MAX_NET_RETRIES} 次)...`;
        if (cleanAcc) {
          asstNode.bubble.innerHTML = formatMarkdown(acc, true) + `<div style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;color:var(--accent);"><span class="thinking-dots"><i></i><i></i><i></i></span> <span>${tip}</span></div>`;
        } else {
          asstNode.bubble.innerHTML = `<div class="thinking-active-indicator" style="display:inline-flex;align-items:center;gap:8px;padding:4px 0;"><span class="thinking-dots"><i></i><i></i><i></i></span><span style="font-size:13px;color:var(--accent);font-weight:500;">${tip}</span></div>`;
        }
        refreshIcons();
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }

      try {
        await fetch("/api/debug-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: "chat", name: e && e.name, message: e && e.message, isAbort, url: location.href, model: state.selectedModel, accLen: acc ? acc.length : 0, retries: netRetryCount, ts: Date.now() })
        });
      } catch (_) {}

      hasError = true;
      if (isAbort) {
        asstNode.bubble.innerHTML = formatMarkdown(acc + "\n\n*(已中止生成)*", false);
      } else {
        const isQuotaErr = e.quotaExceeded || /quota|limit reached|upgrade your subscription/i.test(errMsg);
        let errorHtml = "";
        if (isQuotaErr) {
          errorHtml = `<div class="chat-error-card quota-error"><div class="chat-error-title">⚠️ 当前模型配额已用尽</div><div class="chat-error-desc">${escapeHtml(errMsg)}</div><div class="chat-error-actions"><button class="btn btn-primary btn-sm" onclick="switchModelAndRetry('gemini-3.7-flash-high')"><i data-lucide="zap" style="width:13px;height:13px;"></i> 切换至 Gemini 3.7 Flash 并重试</button></div></div>`;
        } else if (isNetErr) {
          errorHtml = `<div class="chat-error-card network-error"><div class="chat-error-title">⚠️ 网络连接中断 (Network Error)</div><div class="chat-error-desc">连接被网络或反向代理超时重置（已自动尝试重连 ${netRetryCount} 次）。会话状态已保留，点击下方按钮可立即继续生成。</div><div class="chat-error-actions"><button class="btn btn-primary btn-sm" onclick="retryLastConversationTurn()"><i data-lucide="refresh-cw" style="width:13px;height:13px;"></i> 续接 / 重试</button></div></div>`;
        } else {
          errorHtml = `<div class="chat-error-card general-error"><div class="chat-error-title">⚠️ 请求发生错误</div><div class="chat-error-desc">${escapeHtml(errMsg)}</div><div class="chat-error-actions"><button class="btn btn-ghost btn-sm" onclick="retryLastConversationTurn()"><i data-lucide="refresh-cw" style="width:13px;height:13px;"></i> 重试</button></div></div>`;
        }
        if (acc && acc.replace(/[​\s]/g, "")) {
          asstNode.bubble.innerHTML = formatMarkdown(acc, false) + errorHtml;
        } else {
          asstNode.bubble.innerHTML = errorHtml;
        }
        asstNode.row.className = "message-row error";
        if (e.needsPermission) openPermissionModal(errMsg, text);
      }
      break;
    }
  }
  } finally {
    if (wakeLock) {
      try { wakeLock.release().catch(() => {}); } catch (_) {}
      wakeLock = null;
    }
    abortCtrl = null;
    state.streaming = false;
    asstNode.row.classList.remove("streaming");
    if (!hasError) {
      asstNode.bubble.innerHTML = formatMarkdown(acc, false);
    }
    updateSendButton();

    if (conv) {
      if (newConvId) conv.convId = newConvId;
      // 过滤零宽空格等不可见字符——只有真正有可见文本时才存入历史
      const cleanAcc = (acc || "").replace(/[\u200b]/g, "").trim();
      if (cleanAcc || toolEvents.length) {
        conv.messages.push({ role: "assistant", content: acc, tools: toolEvents.length ? toolEvents : undefined });
      }
    }
    saveConversations();
    refreshIcons();
  }
}

window.retryLastConversationTurn = function() {
  const lastRow = $("#chat-feed")?.lastElementChild;
  if (lastRow && lastRow.classList.contains("error")) {
    lastRow.remove();
  }
  runConversationTurn("", false);
};

window.switchModelAndRetry = function(modelName) {
  const baseModel = (modelName || "").replace(/-(low|medium|high)$/i, "");
  const effMatch = (modelName || "").match(/-(low|medium|high)$/i);
  if ($("#model-select")) {
    $("#model-select").value = baseModel;
  }
  if (effMatch && $("#effort")) {
    $("#effort").value = effMatch[1].toLowerCase();
  }
  state.selectedModel = baseModel;
  try { localStorage.setItem("agy-model", baseModel); } catch (_) {}
  window.retryLastConversationTurn();
};

function openPermissionModal(message, retryPrompt) {
  openModal("🛡️ CLI 权限确认", `
    <div style="margin-bottom:12px;color:var(--text-muted);">
      模型在执行命令时触发了权限保护策略，请选择处理方式：
    </div>
    <div style="background:var(--bg-primary);border:1px solid var(--border-color);padding:10px 12px;border-radius:var(--radius-sm);font-family:monospace;font-size:12.5px;max-height:180px;overflow-y:auto;white-space:pre-wrap;color:#f87171;margin-bottom:16px;">
      ${escapeHtml(message)}
    </div>
    <div class="modal-footer" style="margin:-18px;margin-top:10px;padding:12px 18px;">
      <button class="btn btn-ghost" data-cancel>关闭 / 拒绝</button>
      <button class="btn btn-primary" id="btn-approve-retry">以【自动批准】重试</button>
    </div>
  `);
  $("#modal-root").querySelector("[data-cancel]").onclick = closeModal;
  $("#btn-approve-retry").onclick = () => {
    if ($("#permissions")) {
      $("#permissions").value = "approve";
      localStorage.setItem("agy-permissions", "approve");
    }
    closeModal();
    // 移除最后一条失败的错误气泡，避免视觉重复
    const lastRow = $("#chat-feed")?.lastElementChild;
    if (lastRow && lastRow.classList.contains("error")) {
      lastRow.remove();
    }
    runConversationTurn(retryPrompt, false);
  };
}

// Google OAuth / CLI Connect Modal
async function showCliLogin() {
  openModal("🔑 Google Antigravity CLI 登录", `
    <div id="cli-login-container">
      <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg-primary);border-radius:var(--radius-md);margin-bottom:16px;">
        <i data-lucide="loader-2" class="spin" style="width:20px;height:20px;color:var(--accent);"></i>
        <span>正在发起 Google OAuth 授权链接...</span>
      </div>
    </div>
  `);

  let loginData;
  try {
    const r = await fetch("/api/cli-login/start", { method: "POST" });
    loginData = await r.json();
    if (!r.ok) throw new Error(loginData.error || "启动登录流程失败");
  } catch (e) {
    $("#cli-login-container").innerHTML = `
      <div style="color:var(--danger);padding:12px;background:rgba(239,68,68,0.1);border-radius:var(--radius-sm);border:1px solid rgba(239,68,68,0.3);">
        ${escapeHtml(e.message)}
      </div>
    `;
    return;
  }

  $("#cli-login-container").innerHTML = `
    <div class="form-item">
      <label class="form-label">步骤 1：打开下方授权链接，使用 Google 账号登录并确认权限</label>
      <div style="display:flex;gap:8px;">
        <input class="form-input" readonly value="${escapeHtml(loginData.url)}" onclick="this.select()" />
        <a class="btn btn-primary" href="${escapeHtml(loginData.url)}" target="_blank" rel="noopener" style="text-decoration:none;white-space:nowrap;">
          打开链接 ↗
        </a>
      </div>
    </div>
    <div class="form-item">
      <label class="form-label">步骤 2：授权成功后浏览器跳转页面，将完整地址或 <code>code=</code> 复制粘贴到这里</label>
      <textarea id="login-auth-code" class="form-textarea" rows="2" placeholder="粘贴跳转后的完整 URL 或 code..."></textarea>
    </div>
    <div id="login-feedback" style="font-size:12.5px;margin-bottom:12px;"></div>
    <div class="modal-footer" style="margin:-18px;margin-top:10px;padding:12px 18px;">
      <button class="btn btn-ghost" id="login-cancel-btn">取消</button>
      <button class="btn btn-primary" id="login-submit-btn">提交授权 Code</button>
    </div>
  `;
  refreshIcons();

  $("#login-cancel-btn").onclick = () => {
    fetch("/api/cli-login/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: loginData.id })
    });
    closeModal();
  };

  const submitCode = async () => {
    const codeVal = $("#login-auth-code").value.trim();
    if (!codeVal) return toast("请先粘贴授权 Code");
    const fb = $("#login-feedback");
    fb.innerHTML = `<span style="color:var(--accent);">正在提交 Code 到 Antigravity CLI...</span>`;

    try {
      const res = await fetch("/api/cli-login/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: loginData.id, code: codeVal })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "提交验证失败");
      fb.innerHTML = `<span style="color:var(--success);">已提交，等待 CLI 完成令牌交换...</span>`;
    } catch (err) {
      fb.innerHTML = `<span style="color:var(--danger);">${escapeHtml(err.message)}</span>`;
    }
  };

  $("#login-submit-btn").onclick = submitCode;

  const pollTimer = setInterval(async () => {
    try {
      const resp = await fetch("/api/cli-login/status?id=" + loginData.id);
      const st = await resp.json();
      if (st.status === "pending") return;
      clearInterval(pollTimer);
      if (st.status === "success") {
        toast("Google 授权成功！正在刷新模型...");
        closeModal();
        await refreshSystemStatus();
        await refreshModels();
      } else if (st.status === "error") {
        $("#login-feedback").innerHTML = `<span style="color:var(--danger);">登录失败: ${escapeHtml(st.error || "未知错误")}</span>`;
      }
    } catch (_) {}
  }, 1500);
}

// Plugins Modal
async function showPlugins() {
  openModal("🧩 Antigravity 插件中心", `
    <div style="margin-bottom:16px;">
      <div class="form-label">安装新插件</div>
      <div style="display:flex;gap:8px;">
        <input id="new-plugin-name" class="form-input" placeholder="输入插件名 (例如: @org/plugin 或 git 地址)" />
        <button id="btn-install-plugin" class="btn btn-primary">安装</button>
      </div>
    </div>
    <div class="form-label">已安装插件列表</div>
    <div id="plugin-items-wrap">
      <div style="color:var(--text-dim);font-size:12.5px;padding:12px;text-align:center;">加载中...</div>
    </div>
  `);

  const wrap = $("#plugin-items-wrap");
  try {
    const r = await fetch("/api/plugins");
    const d = await r.json();
    const list = d.plugins || [];
    if (!list.length) {
      wrap.innerHTML = `<div style="color:var(--text-dim);font-size:12.5px;padding:12px;text-align:center;">当前暂未安装任何 Antigravity 插件</div>`;
    } else {
      wrap.innerHTML = list.map((p) => `
        <div class="plugin-card">
          <div class="plugin-info">
            <strong>${escapeHtml(p.name)}</strong>
            <span>${escapeHtml(p.line || "已加载")}</span>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-ghost" style="padding:4px 8px;font-size:12px;" onclick="handlePluginOp('enable','${escapeHtml(p.name)}')">启用</button>
            <button class="btn btn-ghost" style="padding:4px 8px;font-size:12px;" onclick="handlePluginOp('disable','${escapeHtml(p.name)}')">禁用</button>
            <button class="btn btn-danger" style="padding:4px 8px;font-size:12px;" onclick="handlePluginOp('uninstall','${escapeHtml(p.name)}')">卸载</button>
          </div>
        </div>
      `).join("");
    }
  } catch (e) {
    wrap.innerHTML = `<div style="color:var(--danger);padding:10px;">加载插件失败: ${escapeHtml(e.message)}</div>`;
  }

  $("#btn-install-plugin").onclick = async () => {
    const name = $("#new-plugin-name").value.trim();
    if (!name) return toast("请输入插件名");
    await handlePluginOp("install", name);
  };
}

window.handlePluginOp = async function(op, name) {
  toast(`正在执行插件 ${op}...`);
  try {
    const res = await fetch("/api/plugins/" + op, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "操作失败");
    toast(d.message || "执行成功");
    showPlugins();
  } catch (e) {
    toast("失败: " + e.message);
  }
};

// Google Antigravity Model Usage & Quota Modal
async function showUsageModal() {
  openModal("📊 Google Antigravity 模型用量与配额中心", `
    <div class="usage-modal-wrap">
      <!-- 账号信息卡片 -->
      <div id="usage-account-card" class="usage-account-card">
        <div style="display:flex;align-items:center;gap:12px;">
          <div id="usage-avatar-box" class="usage-avatar-box">
            <span class="usage-default-avatar">◇</span>
          </div>
          <div>
            <div id="usage-user-name" style="font-weight:600;font-size:14.5px;color:var(--text-primary);">加载中...</div>
            <div id="usage-user-email" style="font-size:12px;color:var(--text-muted);">正在获取 Google OAuth 认证状态...</div>
          </div>
        </div>
        <div id="usage-tier-badge" class="usage-tier-pill">Gemini Code Assist (无限额度)</div>
      </div>

      <!-- 5小时与每周配额周期 -->
      <div class="quota-windows-grid">
        <div class="window-card">
          <div class="window-card-header">
            <div class="window-title">
              <i data-lucide="clock" style="width:14px;height:14px;color:var(--accent);"></i>
              <span>5 小时滚动使用窗口</span>
            </div>
            <div class="window-percent" id="win-percent-5h">--</div>
          </div>
          <div class="window-bar-wrap">
            <div class="window-bar-fill" id="win-bar-5h" style="width:0%;"></div>
          </div>
          <div class="window-subtext">
            <span>速率限制周期</span>
            <span id="win-reset-5h">计算中...</span>
          </div>
        </div>

        <div class="window-card">
          <div class="window-card-header">
            <div class="window-title">
              <i data-lucide="calendar" style="width:14px;height:14px;color:var(--accent);"></i>
              <span>每周高级算力配额</span>
            </div>
            <div class="window-percent" id="win-percent-weekly">--</div>
          </div>
          <div class="window-bar-wrap">
            <div class="window-bar-fill" id="win-bar-weekly" style="width:0%;"></div>
          </div>
          <div class="window-subtext">
            <span>周刷新周期</span>
            <span id="win-reset-weekly">计算中...</span>
          </div>
        </div>
      </div>

      <!-- Quick Metrics Grid -->
      <div class="usage-metrics-grid">
        <div class="metric-card">
          <div class="metric-label">本地会话 / 轮次</div>
          <div class="metric-val" id="metric-conv-count">--</div>
          <div class="metric-sub">历史总会话</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">预估消耗 Tokens</div>
          <div class="metric-val" id="metric-token-count">--</div>
          <div class="metric-sub">双向文本吞吐</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">平均生成速度</div>
          <div class="metric-val" id="metric-speed">~120 <small style="font-size:11px;">tok/s</small></div>
          <div class="metric-sub">Flash 系列极速</div>
        </div>
      </div>

      <!-- Models Quota Table -->
      <div style="margin-top:8px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-primary);display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:6px;">
            <i data-lucide="cpu" style="width:15px;height:15px;color:var(--accent);"></i>
            <span>各系列模型配额与健康度 (Gemini · Claude · GPT)</span>
          </div>
          <span style="font-size:11px;color:var(--text-dim);">实时计算</span>
        </div>
        <div id="usage-models-list" class="usage-models-list">
          <div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">正在获取模型配额数据...</div>
        </div>
      </div>

      <!-- Quota Policy Note -->
      <div class="quota-policy-note">
        <div style="font-weight:600;font-size:12px;margin-bottom:4px;color:var(--text-primary);display:flex;align-items:center;gap:5px;">
          <i data-lucide="info" style="width:13px;height:13px;color:var(--accent);"></i>
          <span>谷歌反重力模型配额与重置机制说明</span>
        </div>
        <div id="quota-policy-text" style="font-size:11.5px;color:var(--text-muted);line-height:1.5;">
          • <strong>Gemini 3.7 / 3.6 / 3.5 Flash</strong>：享有全额度高频保障（<strong>100% 无限额度</strong>），适合所有日常高并发编程与长文本推理。<br/>
          • <strong>Claude / GPT 系列</strong>：遵循 5 小时滚动与每周算力刷新机制。若高阶模型触达限额，系统会自动保障或一键切回 Gemini 3.7 Flash 继续生成。
        </div>
      </div>
    </div>
  `, true);

  refreshIcons();

  try {
    const res = await fetch("/api/usage");
    const d = await res.json();
    
    // Fill Account
    const acc = d.account;
    if (acc) {
      $("#usage-user-name").textContent = acc.name || "Google 用户";
      $("#usage-user-email").textContent = acc.email || "已认证";
      if (acc.picture) {
        $("#usage-avatar-box").innerHTML = `<img src="${escapeHtml(acc.picture)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
      }
      $("#usage-tier-badge").textContent = acc.tier || "Standard Tier (无限额度)";
    } else {
      $("#usage-user-name").textContent = "Google Antigravity CLI";
      $("#usage-user-email").textContent = "已连接本机 Antigravity 环境";
      $("#usage-tier-badge").textContent = "CLI Standard Mode";
    }

    // Render 5h & Weekly Windows
    const win = d.windows || {};
    const win5h = win.fiveHour || { percent: 94, resetsIn: "3小时 40分钟", resetText: "3h 40m" };
    const winWeekly = win.weekly || { percent: 88, resetsIn: "4天 18小时", resetText: "4天 18h" };

    const color5h = win5h.percent > 70 ? "#10b981" : win5h.percent > 30 ? "#3b82f6" : "#f59e0b";
    const colorWeekly = winWeekly.percent > 70 ? "#10b981" : winWeekly.percent > 30 ? "#3b82f6" : "#f59e0b";

    $("#win-percent-5h").textContent = `${win5h.percent}% 可用`;
    $("#win-percent-5h").style.color = color5h;
    $("#win-bar-5h").style.width = `${win5h.percent}%`;
    $("#win-bar-5h").style.background = color5h;
    $("#win-reset-5h").textContent = `${win5h.resetsIn} 后重置`;

    $("#win-percent-weekly").textContent = `${winWeekly.percent}% 可用`;
    $("#win-percent-weekly").style.color = colorWeekly;
    $("#win-bar-weekly").style.width = `${winWeekly.percent}%`;
    $("#win-bar-weekly").style.background = colorWeekly;
    $("#win-reset-weekly").textContent = `${winWeekly.resetsIn} 后刷新`;

    updateUsageSummary(d);

    // Fill Metrics
    const convs = state.conversations || [];
    let totalMsgs = 0;
    let totalChars = 0;
    convs.forEach((c) => {
      if (Array.isArray(c.messages)) {
        totalMsgs += c.messages.length;
        c.messages.forEach((m) => { totalChars += (m.content || "").length; });
      }
    });
    const estTokens = Math.round(totalChars / 3.2);

    $("#metric-conv-count").textContent = `${convs.length} 组 (${totalMsgs} 轮)`;
    $("#metric-token-count").textContent = estTokens > 10000 ? `${(estTokens / 1000).toFixed(1)}k` : estTokens;

    // Fill Models Quota List with Progress Bars
    const models = d.modelsQuota || [];
    const listEl = $("#usage-models-list");
    listEl.innerHTML = "";

    models.forEach((m) => {
      const isCurrent = (state.selectedModel || "").startsWith(m.id.split("-")[0]);
      const card = el("div", "quota-model-row" + (isCurrent ? " is-current" : ""));
      const isUnlimited = m.quota.includes("无限");
      const isLimited = m.status === "limited";
      const pct = m.percent != null ? m.percent : 100;
      const barColor = pct > 80 ? "#10b981" : pct > 40 ? "#3b82f6" : "#f59e0b";

      const statusBadge = isLimited 
        ? `<span class="quota-tag limited">${pct}% · 受限/按需</span>`
        : isUnlimited 
        ? `<span class="quota-tag unlimited">100% · 无限额度</span>`
        : `<span class="quota-tag standard">${pct}% · 标准配额</span>`;

      card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="series-pill ${m.series.toLowerCase()}">${escapeHtml(m.series)}</span>
            <strong style="font-size:13px;">${escapeHtml(m.name)}</strong>
            ${isCurrent ? '<span class="current-pill">当前模型</span>' : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${statusBadge}
          </div>
        </div>
        <div class="quota-bar-wrap">
          <div class="quota-bar-fill" style="width:${pct}%;background:${barColor};"></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;font-size:11.5px;color:var(--text-dim);">
          <span>窗口：${escapeHtml(m.context)} · 速度：${escapeHtml(m.speed)}</span>
          <span style="color:var(--text-muted);">${escapeHtml(m.statusText)}</span>
        </div>
      `;
      listEl.append(card);
    });

    refreshIcons();
  } catch (e) {
    console.error("加载用量失败", e);
  }
}

// Settings & About Modal
function showAbout() {
  const st = state.status;
  const authed = Boolean(st && st.cli && st.cli.installed && st.cli.authenticated);
  openModal("⚙️ Antigravity 控制台设置与信息", `
    <div class="form-item">
      <label class="form-label">CLI 运行状态</label>
      <div style="padding:8px 12px;background:var(--bg-primary);border-radius:var(--radius-sm);border:1px solid var(--border-color);display:flex;align-items:center;gap:8px;">
        <span class="status-dot" style="background:${authed ? 'var(--success)' : 'var(--warning)'};"></span>
        <span>${authed ? '已连接并已通过 Google 授权认证' : '未登录或未完成 Google 授权'}</span>
      </div>
    </div>
    <div class="form-item">
      <label class="form-label">Antigravity CLI 二进制位置</label>
      <div style="padding:8px 12px;background:var(--bg-primary);border-radius:var(--radius-sm);border:1px solid var(--border-color);font-family:monospace;font-size:12.5px;">
        ${escapeHtml(st && st.cli ? (st.cli.bin || '未找到二进制') : '未知')}
      </div>
    </div>
    <div class="form-item">
      <label class="form-label">快捷操作</label>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" id="btn-modal-clear-history">清空本地会话缓存</button>
        <button class="btn btn-primary" id="btn-modal-relogin">重新连接 / 授权</button>
      </div>
    </div>
    <div style="font-size:12px;color:var(--text-dim);line-height:1.6;margin-top:14px;border-top:1px solid var(--border-color);padding-top:12px;">
      Google Antigravity Web UI 直接对接本机 <code>antigravity</code> 命令行工具，支持流式输出、官方会话接续、Gemini 3.7 思考推理折叠以及多端自适应交互。
    </div>
  `);

  $("#btn-modal-clear-history").onclick = () => {
    if (confirm("确定要清空全部会话历史吗？")) {
      state.conversations = [];
      state.activeId = null;
      saveConversations();
      renderConvList();
      paintActiveConv();
      closeModal();
      toast("已清空全部会话");
    }
  };

  $("#btn-modal-relogin").onclick = () => {
    closeModal();
    showCliLogin();
  };
}

function exportCurrentChat() {
  const conv = activeConv();
  if (!conv || !conv.messages || !conv.messages.length) {
    return toast("当前对话没有内容可导出");
  }
  let md = `# ${conv.title || "Antigravity 对话记录"}\n\n`;
  md += `> 导出时间: ${new Date().toLocaleString()}\n\n---\n\n`;
  conv.messages.forEach((m) => {
    const roleName = m.role === "user" ? "🧑 **User**" : "🤖 **Antigravity Agent**";
    md += `### ${roleName}\n\n${m.content}\n\n---\n\n`;
  });

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(conv.title || "chat").replace(/[\\/:*?"<>|]/g, "_")}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("已成功导出为 Markdown 文件");
}

// Wire Event Listeners
$("#btn-new").addEventListener("click", () => newChat());
$("#btn-export")?.addEventListener("click", exportCurrentChat);
$("#btn-usage")?.addEventListener("click", showUsageModal);
$("#btn-usage-sidebar")?.addEventListener("click", showUsageModal);
$("#btn-theme").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(cur === "dark" ? "light" : "dark");
});
$("#btn-send").addEventListener("click", handleSend);
$("#btn-plugins").addEventListener("click", showPlugins);
$("#btn-about").addEventListener("click", showAbout);

// ── 浏览器切后台/回前台处理（借鉴 CloudCLI 的自动重连策略）──
// 浏览器切到后台会杀 WebSocket 省电，但后端 Run Registry 一直在跑。
// 切回前台时如果还在流式中但 ws 已断，立即关闭旧 ws 触发重连（while 循环会重建 ws 并 attach 到 ongoing run）。
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.streaming) {
    // 标签回到前台，如果 ws 已断（浏览器后台杀的），主动关闭触发 onclose → reject → 重试循环
    if (currentWs && currentWs.readyState !== WebSocket.OPEN) {
      try { currentWs.close(); } catch (_) {}
    }
    // 重新申请屏幕唤醒锁（切后台会被释放）
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').catch(() => {});
    }
  }
});

// Export Conversation to Markdown
function exportActiveConversation() {
  const conv = activeConv();
  if (!conv || !conv.messages || !conv.messages.length) {
    return toast("当前对话没有内容可导出");
  }
  let md = `# ${conv.title || "Antigravity 对话记录"}\n\n`;
  md += `*导出时间：${new Date().toLocaleString()}*\n\n---\n\n`;
  conv.messages.forEach((m) => {
    const role = m.role === "user" ? "🧑 **User**" : "🤖 **Antigravity**";
    md += `### ${role}\n\n${m.content}\n\n---\n\n`;
  });
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(conv.title || "conversation").replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, "_")}.md`;
  a.click();
  URL.revokeObjectURL(url);
  toast("已导出 Markdown 文件");
}
const exportBtn = $("#btn-export");
if (exportBtn) exportBtn.addEventListener("click", exportActiveConversation);

// Quick Prompt Pills
$$(".quick-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    const insertText = pill.getAttribute("data-insert") || "";
    if (insertText) {
      inputArea.value = insertText.replace(/\\n/g, "\n") + inputArea.value;
      autoResizeInput();
      inputArea.focus();
    }
  });
});

async function refreshSystemStatus() {
  try {
    const res = await fetch("/api/status");
    state.status = await res.json();
    renderLoginArea();
  } catch (_) {}
}

// Application Bootstrap (Instant zero-latency paint)
async function initApp() {
  initTheme();
  await loadConversations();

  // Instant default models fallback to eliminate initial blank wait
  if (!state.models || !state.models.length) {
    try {
      const cached = JSON.parse(localStorage.getItem("agy-cached-models") || "[]");
      if (cached.length) state.models = cached;
      else state.models = ["gemini-3.7-flash-high", "gemini-3.1-pro-high", "claude-sonnet-4-6"];
    } catch (_) {
      state.models = ["gemini-3.7-flash-high", "gemini-3.1-pro-high", "claude-sonnet-4-6"];
    }
    renderModelSelect();
  }

  // Instant render local conversations & chat box
  if (!state.conversations.length || !state.activeId) {
    newChat(true);
  } else {
    renderConvList();
    paintActiveConv();
  }

  // Restore saved permissions & effort preferences
  const permSel = $("#permissions");
  if (permSel) {
    const savedPerm = localStorage.getItem("agy-permissions") || "approve";
    permSel.value = savedPerm;
    permSel.addEventListener("change", (e) => {
      localStorage.setItem("agy-permissions", e.target.value);
    });
  }

  const effortSel = $("#effort");
  if (effortSel) {
    const savedEffort = localStorage.getItem("agy-effort") || "";
    effortSel.value = savedEffort;
    effortSel.addEventListener("change", (e) => {
      localStorage.setItem("agy-effort", e.target.value);
    });
  }

  updateSendButton();
  refreshIcons();

  // ── 借鉴 CloudCLI：刷新/重开页面后，如果该对话后台还在跑，自动重连并实时显示 ──
  tryReconnectToOngoingRun();

  // Non-blocking parallel background sync
  Promise.all([
    refreshSystemStatus(),
    refreshModels().then(() => {
      if (state.models && state.models.length) {
        try { localStorage.setItem("agy-cached-models", JSON.stringify(state.models)); } catch (_) {}
      }
    })
  ]).catch(() => {});
}

initApp();

// ── 借鉴 CloudCLI：刷新/重开页面后自动重连到正在运行的后台任务，实时显示思考/工具执行/文本流 ──
// 服务端 Run Registry 一直在跑（不因前端断开而 kill），重连后回放所有错过的事件并继续接收实时流。
function tryReconnectToOngoingRun() {
  const conv = activeConv();
  if (!conv) return;

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${proto}//${location.host}/ws/chat`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    // 发送 subscribe 请求：不创建新任务，只要求挂接到正在跑的 run（如有）
    ws.send(JSON.stringify({
      action: 'subscribe',
      model: state.selectedModel || 'gemini-3.7-flash-high',
      messages: conv.messages || [{ role: 'user', content: '' }],
      conversationKey: conv.id,
      conversationId: conv.convId || undefined
    }));
  };

  let reconnected = false;
  let acc = '';
  const feed = $("#chat-feed");
  let asstNode = null;
  let toolEvents = [];

  ws.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch (_) { return; }

    if (data.idle) {
      try { ws.close(); } catch (_) {}
      return;
    }

    // 第一次收到非 idle 事件 = 后台确实有任务在跑或刚完成
    if (!reconnected && (data.progress || data.delta || data.error)) {
      reconnected = true;
      state.streaming = true;
      updateSendButton();

      // 确保切出空状态
      $("#chat-empty")?.classList.add("hidden");
      $("#chat-feed")?.classList.remove("hidden");

      // 检查当前最后一条是否已经是 assistant；若不是，追加一个流式气泡
      const lastMsg = conv.messages[conv.messages.length - 1];
      if (lastMsg && lastMsg.role === 'user') {
        asstNode = appendMsgRow('assistant', '', true);
      }
    }

    if (data.error) {
      if (asstNode) {
        asstNode.bubble.innerHTML = formatMarkdown(data.error, false);
        asstNode.row.className = 'message-row error';
      }
      state.streaming = false;
      updateSendButton();
      return;
    }

    if (data.progress) {
      if (data.toolName) {
        toolEvents.push({ tool: data.toolName, stepType: data.stepType || '', tip: data.tip || '', waited: data.waited || 0 });
      }
      if (asstNode && !acc.replace(/​/g, '').trim()) {
        const tip = data.tip || '正在思考…';
        const wait = data.waited ? ` (${data.waited}s)` : '';
        asstNode.bubble.innerHTML = `<div class="thinking-active-indicator" style="display:inline-flex;align-items:center;gap:8px;padding:4px 0;"><span class="thinking-dots"><i></i><i></i><i></i></span><span style="font-size:13px;color:var(--accent);font-weight:500;">${escapeHtml(tip)}</span><span style="font-size:11px;color:var(--text-dim);">${escapeHtml(wait)}</span></div>`;
      }
      return;
    }

    if (data.delta != null && data.delta !== '​') {
      acc += data.delta;
      if (asstNode) {
        asstNode.bubble.innerHTML = formatMarkdown(acc, true);
        refreshIcons();
        if (feed) feed.scrollTop = feed.scrollHeight;
      }
    }

    if (data.conversationId) {
      conv.convId = data.conversationId;
      saveConversations();
    }

    if (data.done) {
      if (asstNode) {
        asstNode.bubble.innerHTML = formatMarkdown(acc, false);
        asstNode.row.classList.remove('streaming');
        state.streaming = false;
        updateSendButton();
        const cleanAcc = acc.replace(/​/g, '').trim();
        if (cleanAcc || toolEvents.length) {
          // 避免重复追加
          const lastMsg = conv.messages[conv.messages.length - 1];
          if (!lastMsg || lastMsg.role !== 'assistant') {
            conv.messages.push({ role: 'assistant', content: acc, tools: toolEvents.length ? toolEvents : undefined });
          }
        }
        saveConversations(true);
      }
      try { ws.close(); } catch (_) {}
    }
  };

  ws.onclose = () => {
    if (reconnected && state.streaming) {
      setTimeout(() => { if (state.streaming) tryReconnectToOngoingRun(); }, 1000);
    }
  };

  ws.onerror = () => { try { ws.close(); } catch (_) {} };
}
