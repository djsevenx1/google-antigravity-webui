import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let _proxyServer = null;
let _proxyPort = null;
let _proxyUrl = null;

function detectDefaultGateway() {
  if (process.env.AGY_DNS_GATEWAY) {
    return process.env.AGY_DNS_GATEWAY;
  }
  try {
    const out = execSync("ip route show default | awk '{print $3}'", { encoding: 'utf8', timeout: 2000 }).trim();
    if (out && net.isIP(out)) {
      return out;
    }
  } catch (_) {}
  return '192.168.1.197';
}

export function startLocalProxy(desiredPort = 18080) {
  if (_proxyServer && _proxyPort) {
    return { port: _proxyPort, url: _proxyUrl };
  }

  const gateway = detectDefaultGateway();
  const resolver = new dns.Resolver();
  try {
    resolver.setServers([gateway, '192.168.1.197']);
  } catch (err) {
    console.warn('[proxy] resolver setServers failed, using default DNS:', err.message);
  }

  const resolveHost = (host, callback) => {
    // 如果已经是 IP 则无需解析
    if (net.isIP(host)) {
      return callback(host);
    }
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        callback(host); // 超时直接回退原域名
      }
    }, 2000);

    resolver.resolve4(host, (err, addresses) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        if (!err && addresses && addresses.length > 0) {
          callback(addresses[0]);
        } else {
          callback(host);
        }
      }
    });
  };

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url);
      const port = url.port || 80;
      resolveHost(url.hostname, (targetHost) => {
        const proxyReq = http.request({
          host: targetHost,
          port,
          method: req.method,
          path: url.pathname + url.search,
          headers: { ...req.headers, host: url.host }
        }, (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res);
        });

        proxyReq.on('error', () => {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
          }
          res.end('Bad Gateway');
        });

        req.pipe(proxyReq);
      });
    } catch (_) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
    }
  });

  // HTTPS CONNECT 隧道 (核心：Gemini API / CloudCode 全走 HTTPS 流式通道)
  server.on('connect', (req, clientSocket, head) => {
    const parts = req.url.split(':');
    const host = parts[0];
    const port = parseInt(parts[1] || '443', 10);

    resolveHost(host, (targetHost) => {
      const serverSocket = net.connect(port, targetHost, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length > 0) {
          serverSocket.write(head);
        }
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
      });

      serverSocket.setKeepAlive(true, 10000);
      serverSocket.setNoDelay(true);
      clientSocket.setKeepAlive(true, 10000);
      clientSocket.setNoDelay(true);

      serverSocket.on('error', () => {
        try { clientSocket.destroy(); } catch (_) {}
      });
      clientSocket.on('error', () => {
        try { serverSocket.destroy(); } catch (_) {}
      });
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[proxy] 端口 ${desiredPort} 已被监听，直接复用或切换`);
      if (!_proxyPort) _proxyPort = desiredPort;
    } else {
      console.error('[proxy] 服务端异常:', err);
    }
  });

  try {
    server.listen(desiredPort, '127.0.0.1', () => {
      const addr = server.address();
      _proxyPort = typeof addr === 'object' && addr ? addr.port : desiredPort;
      _proxyUrl = `http://127.0.0.1:${_proxyPort}`;
      _proxyServer = server;

      applyProxyEnvironment(_proxyUrl);
      console.log(`[proxy] ✅ 本地旁路由 Fake-IP 代理桥已启动: ${_proxyUrl} (DNS网关: ${gateway})`);
    });
  } catch (_) {}

  // 默认立即准备环境变量
  _proxyPort = desiredPort;
  _proxyUrl = `http://127.0.0.1:${desiredPort}`;
  applyProxyEnvironment(_proxyUrl);

  return {
    getPort: () => _proxyPort,
    getUrl: () => _proxyUrl
  };
}

function applyProxyEnvironment(url) {
  process.env.HTTP_PROXY = url;
  process.env.HTTPS_PROXY = url;
  process.env.http_proxy = url;
  process.env.https_proxy = url;
  process.env.ALL_PROXY = url;
  process.env.all_proxy = url;

  try {
    const { setGlobalDispatcher, ProxyAgent } = require('undici');
    if (setGlobalDispatcher && ProxyAgent) {
      setGlobalDispatcher(new ProxyAgent(url));
    }
  } catch (_) {}
}

export function getProxyUrl() {
  return _proxyUrl || (process.env.HTTPS_PROXY || process.env.https_proxy || 'http://127.0.0.1:18080');
}

// 模块加载即自动启动单例
startLocalProxy(18080);
