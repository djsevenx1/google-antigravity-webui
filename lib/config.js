import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

const DEFAULTS = {
  oauth: {
    clientId: '',
    clientSecret: '',
    redirectUri: 'http://localhost:3100/auth/callback'
  },
  auth: {
    enabled: true,
    username: 'admin',
    password: 'admin'
  },
  sessionSecret: '',
  port: 3100,
  genEndpoint: '',
  agyBin: '/usr/local/bin/antigravity'
};

function loadConfig() {
  let fileCfg = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      fileCfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (e) {
      console.error('[config] failed to parse config.json:', e.message);
    }
  }

  const cfg = {
    auth: {
      enabled: fileCfg.auth?.enabled !== false,
      username: process.env.WEB_AUTH_USER || fileCfg.auth?.username || DEFAULTS.auth.username,
      password: process.env.WEB_AUTH_PASSWORD || fileCfg.auth?.password || DEFAULTS.auth.password
    },
    oauth: {
      clientId: process.env.AGY_OAUTH_CLIENT_ID || fileCfg.oauth?.clientId || DEFAULTS.oauth.clientId,
      clientSecret: process.env.AGY_OAUTH_CLIENT_SECRET || fileCfg.oauth?.clientSecret || DEFAULTS.oauth.clientSecret,
      redirectUri: process.env.AGY_REDIRECT_URI || fileCfg.oauth?.redirectUri || DEFAULTS.oauth.redirectUri
    },
    sessionSecret: process.env.AGY_SESSION_SECRET || fileCfg.sessionSecret || 'dev-insecure-secret-antigravity',
    port: process.env.PORT ? Number(process.env.PORT) : (fileCfg.port || DEFAULTS.port),
    genEndpoint: process.env.AGY_CHAT_ENDPOINT || fileCfg.genEndpoint || DEFAULTS.genEndpoint,
    agyBin: process.env.AGY_BIN || fileCfg.agyBin || DEFAULTS.agyBin
  };

  // Derived: can we run the real OAuth / real chat?
  cfg.oauthConfigured = Boolean(cfg.oauth.clientId && cfg.oauth.clientSecret && cfg.oauth.redirectUri);

  return cfg;
}

const config = loadConfig();
export default config;