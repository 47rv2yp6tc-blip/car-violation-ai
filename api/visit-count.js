import { createHash } from 'node:crypto';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL_SECONDS = 30 * 60;

function jsonResponse(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function getClientKey(req) {
  const rawIp = String(
    req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || req.socket?.remoteAddress || 'unknown'
  ).split(',')[0].trim();
  const userAgent = String(req.headers['user-agent'] || 'unknown');
  const seed = `${rawIp}|${userAgent}`;
  return createHash('sha256').update(seed).digest('hex');
}

async function redisRequest(path, init = {}) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return { ok: false, status: 503, payload: null };
  }

  const response = await fetch(`${REDIS_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { ok: response.ok, status: response.status, payload };
}

function parseRedisNumber(payload) {
  if (payload && typeof payload === 'object') {
    if (typeof payload.result === 'number') return payload.result;
    if (payload.result != null && !Number.isNaN(Number(payload.result))) return Number(payload.result);
  }
  if (typeof payload === 'number') return payload;
  if (typeof payload === 'string') return Number(payload) || 0;
  return 0;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  if (!REDIS_URL || !REDIS_TOKEN) {
    return jsonResponse(res, 200, { total: 0, unavailable: true });
  }

  const clientKey = getClientKey(req);
  const totalKey = 'roadlens:visits:total';
  const bucketKey = `roadlens:visit:bucket:${clientKey}`;

  try {
    const bucketResult = await redisRequest(`/get/${encodeURIComponent(bucketKey)}`);
    const hasRecentVisit = bucketResult.ok && bucketResult.payload && bucketResult.payload.result != null;

    if (!hasRecentVisit) {
      const setResult = await redisRequest(`/set/${encodeURIComponent(bucketKey)}/1?EX=${TTL_SECONDS}`);
      if (!setResult.ok) {
        return jsonResponse(res, 200, { total: 0, unavailable: true });
      }

      await redisRequest(`/incr/${encodeURIComponent(totalKey)}`);
    }

    const totalResult = await redisRequest(`/get/${encodeURIComponent(totalKey)}`);
    const total = parseRedisNumber(totalResult.payload);
    return jsonResponse(res, 200, { total, unavailable: false });
  } catch (error) {
    return jsonResponse(res, 200, { total: 0, unavailable: true });
  }
}
