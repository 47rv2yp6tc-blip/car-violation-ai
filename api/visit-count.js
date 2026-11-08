import { createHash, randomUUID } from 'node:crypto';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL_SECONDS = 30 * 60;
const COOKIE_NAME = 'roadlens_visit_id';
const TOTAL_KEY = 'roadlens:visits:total';

const COUNT_VISIT_SCRIPT = `
local counted = redis.call('SET', KEYS[2], '1', 'NX', 'EX', ARGV[1])
if counted then
  return {1, redis.call('INCR', KEYS[1])}
end
return {0, tonumber(redis.call('GET', KEYS[1]) or '0')}
`;

function jsonResponse(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function readVisitId(cookieHeader) {
  const cookie = String(cookieHeader || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return null;
  const value = cookie.slice(COOKIE_NAME.length + 1);
  return /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

function hashVisitId(value) {
  return createHash('sha256').update(value).digest('hex');
}

function setVisitCookie(res, id) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${id}; Path=/; Max-Age=${TTL_SECONDS}; HttpOnly; SameSite=Lax${secure}`);
}

async function incrementOnce(bucketKey) {
  const response = await fetch(`${REDIS_URL.replace(/\/$/, '')}/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['EVAL', COUNT_VISIT_SCRIPT, '2', TOTAL_KEY, bucketKey, String(TTL_SECONDS)]),
  });

  if (!response.ok) throw new Error('Redis request failed');
  const payload = await response.json();
  if (payload?.error || !Array.isArray(payload?.result) || payload.result.length < 2) {
    throw new Error('Unexpected Redis response');
  }
  const total = Number(payload.result[1]);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid visit count');
  return total;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'Method not allowed' });
  if (!REDIS_URL || !REDIS_TOKEN) {
    return jsonResponse(res, 503, { error: 'Visit counter is not configured' });
  }

  let visitId = readVisitId(req.headers?.cookie);
  const isNewVisitId = !visitId;
  if (isNewVisitId) visitId = randomUUID();

  try {
    const total = await incrementOnce(`roadlens:visits:dedupe:${hashVisitId(visitId)}`);
    if (isNewVisitId) setVisitCookie(res, visitId);
    return jsonResponse(res, 200, { total });
  } catch (error) {
    return jsonResponse(res, 503, { error: 'Visit counter is temporarily unavailable' });
  }
}
