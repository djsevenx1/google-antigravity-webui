const fs = require('fs');
const transcriptPath = '/vol5/@apphome/claude code/.gemini/antigravity-cli/brain/30d79688-5aaa-4a33-9702-85ea39020f70/.system_generated/logs/transcript.jsonl';
const sessionPath = 'data/sessions/c_mt30rt69e1yv.json';

const transcriptLines = fs.readFileSync(transcriptPath, 'utf-8').trim().split('\n');
const session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));

let turns = [];
let current = null;
for(const line of transcriptLines) {
  try {
    const step = JSON.parse(line);
    if(step.type === 'USER_INPUT') {
      let text = step.content || '';
      const match = text.match(/<USER_REQUEST>\n([\s\S]*?)\n<\/USER_REQUEST>/);
      if(match) text = match[1].trim();
      turns.push({ role: 'user', content: text, ts: step.created_at });
      current = { role: 'assistant', content: '', tools: [], ts: step.created_at };
      turns.push(current);
    } else if (step.type === 'PLANNER_RESPONSE' && current) {
      if(step.content) current.content = step.content;
      if(step.tool_calls && step.tool_calls.length > 0) {
        for (const tc of step.tool_calls) {
          const tName = tc.name;
          const toolMap = {
            run_command: '正在执行命令...',
            view_file: '正在读取文件...',
            write_to_file: '正在写入文件...',
            replace_file_content: '正在修改文件...',
            multi_replace_file_content: '正在批量修改代码...',
            list_dir: '正在浏览目录...',
            manage_task: '正在管理后台任务...',
            invoke_subagent: '正在调度子 Agent...',
            ask_question: '正在等待确认...',
          };
          const tip = toolMap[tName.replace(/^default_api:/, '')] || `正在调用工具 (${tName})...`;
          current.tools.push({
            tool: tName.replace(/^default_api:/, ''),
            stepType: 'tool',
            tip: tip,
            waited: 1
          });
        }
      }
    }
  } catch(e) {}
}

turns = turns.filter(t => t.content.trim() !== '' || (t.tools && t.tools.length > 0));

session.messages = turns.map(t => { 
  const res = { role: t.role, content: t.content };
  if (t.tools && t.tools.length > 0) res.tools = t.tools;
  return res;
});
fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
console.log('Rebuilt session with ' + session.messages.length + ' messages and restored tools');
