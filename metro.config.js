// Metro (the dev server) config. Expo's defaults, plus one thing for the web preview:
//
// WEB PREVIEW PASS-THROUGH. Phones call https://sovrns.com directly, but a browser can't: the
// server refuses browser calls from localhost (CORS). So in the web preview the app calls
// /api/sovrns/<path> on this dev server, and this middleware sends it on to the real API and
// returns the answer unchanged. It only exists while developing (Metro never ships), and it
// forwards only the app's own API paths.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const UPSTREAM = (process.env.SOVRNS_API_URL || 'https://sovrns.com').replace(/\/+$/, '');
const PREFIX = '/api/sovrns/';
const ALLOWED = /^(ask|api\/v1\/[\w\-/]+)$/;
const FORWARDED_HEADERS = ['authorization', 'content-type', 'idempotency-key', 'accept'];

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function sovrnsPassThrough(req, res, next) {
  if (!req.url || !req.url.startsWith(PREFIX)) return next();
  const rest = req.url.slice(PREFIX.length);
  const path = rest.split('?')[0];
  if (!ALLOWED.test(path)) {
    return sendJson(res, 404, { error: { code: 'not_found', message: 'Not found' } });
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', async () => {
    const headers = {};
    for (const name of FORWARDED_HEADERS) {
      const value = req.headers[name];
      if (typeof value === 'string') headers[name] = value;
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    try {
      const upstream = await fetch(`${UPSTREAM}/${rest}`, {
        method: req.method,
        headers,
        body: hasBody ? Buffer.concat(chunks) : undefined,
      });
      const body = Buffer.from(await upstream.arrayBuffer());
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(body);
    } catch {
      sendJson(res, 502, {
        error: { code: 'upstream_unreachable', message: "Can't reach Sovrns." },
      });
    }
  });
}

const enhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (metroMiddleware, server) => {
  const inner = enhance ? enhance(metroMiddleware, server) : metroMiddleware;
  return (req, res, next) => sovrnsPassThrough(req, res, () => inner(req, res, next));
};

module.exports = config;
