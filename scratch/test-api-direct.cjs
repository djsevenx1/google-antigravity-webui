const http = require('http');

http.get('http://127.0.0.1:3100/api/usage', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log("windows object:", JSON.stringify(json.windows, null, 2));
    } catch(e) {
      console.log("Raw response:", data);
    }
  });
});
