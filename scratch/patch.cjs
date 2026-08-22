const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf-8');

code = code.replace(/console\.error\("加载用量失败", e\);/g, 'console.error("加载用量失败", e); document.getElementById("usage-models-list").innerHTML = "<div style=\'color:red;padding:20px;\'>" + e.message + "<br>" + e.stack + "</div>";');

fs.writeFileSync('public/app.js', code);
