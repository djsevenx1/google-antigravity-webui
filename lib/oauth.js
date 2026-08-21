import { Router } from 'express';
import crypto from 'node:crypto';
import config from './config.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
].join(' ');

function buildAuthUrl(state) {
  const qs = new URLSearchParams({
    client_id: config.oauth.clientId,
    redirect_uri: config.oauth.redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPES,
    state,
    access_type: 'offline',
    prompt: 'consent'
  });
  return `${GOOGLE_AUTH_URL}?${qs.toString()}`;
}

async function exchangeCode(code) {
  const params = new URLSearchParams({
    code,
    client_id: config.oauth.clientId,
    client_secret: config.oauth.clientSecret,
    redirect_uri: config.oauth.redirectUri,
    grant_type: 'authorization_code'
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

async function fetchUserInfo(accessToken) {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Google userinfo failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

export function oauthRouter() {
  const router = Router();

  // Start the OAuth flow.
  router.get('/login', (req, res) => {
    if (!config.oauthConfigured) {
      return res.status(503).json({ error: 'OAUTH_NOT_CONFIGURED' });
    }
    const state = crypto.randomBytes(24).toString('hex');
    req.session.oauthState = state;
    res.redirect(buildAuthUrl(state));
  });

  // OAuth redirect target.
  router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`/?auth_error=${encodeURIComponent(String(error))}`);
    }
    if (!code || state !== req.session.oauthState) {
      return res.redirect('/?auth_error=Invalid%20state');
    }
    delete req.session.oauthState;

    try {
      const tokens = await exchangeCode(code);
      const user = await fetchUserInfo(tokens.access_token);
      // Persist credentials on the session (server-side).
      req.session.user = {
        email: user.email,
        name: user.name || user.given_name || user.email,
        picture: user.picture || '',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || '',
        idToken: tokens.id_token || '',
        expiry: Date.now() + (tokens.expires_in || 3600) * 1000
      };
      res.redirect('/');
    } catch (e) {
      console.error('[oauth] callback error:', e.message);
      res.redirect(`/?auth_error=${encodeURIComponent(e.message)}`);
    }
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });

  return router;
}