const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf-8');

const target = `  const usageData = {
    win: windows,
    models: modelsQuota
  };`;

const replacement = `  const geminiProModel = modelsQuota.find(m => m.id === 'gemini-3.1-pro-high');
  if (geminiProModel && geminiProModel.percent !== undefined) {
    windows.fiveHour.percent = geminiProModel.percent;
    windows.fiveHour.used = 100 - geminiProModel.percent;
    windows.fiveHour.status = geminiProModel.percent > 70 ? 'healthy' : 'warning';
    
    windows.weekly.percent = geminiProModel.percent;
    windows.weekly.used = 100 - geminiProModel.percent;
    windows.weekly.status = geminiProModel.percent > 70 ? 'healthy' : 'warning';
  }

  const claudeModel = modelsQuota.find(m => m.id === 'claude-sonnet-4-6');
  if (claudeModel && claudeModel.percent !== undefined) {
    windows.claude5h.percent = claudeModel.percent;
    windows.claude5h.used = 100 - claudeModel.percent;
    windows.claudeWeekly.percent = claudeModel.percent;
    windows.claudeWeekly.used = 100 - claudeModel.percent;
  }

  const usageData = {
    win: windows,
    models: modelsQuota
  };`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.js', code);
  console.log("Patched server.js grids successfully!");
} else {
  console.log("Target not found!");
}
