const COUNT_KEY = 'roadlens:page_views';

function sendJson(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) {
    return sendJson(res, 503, { error: 'Visitor counter is not configured' });
  }

  try {
    const baseUrl = redisUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/incr/${encodeURIComponent(COUNT_KEY)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Number.isSafeInteger(payload.result) || payload.result < 1) {
      console.error('Visitor counter storage request failed', { status: response.status });
      return sendJson(res, 502, { error: 'Visitor count is temporarily unavailable' });
    }
    return sendJson(res, 200, { count: payload.result });
  } catch (error) {
    console.error('Visitor counter error', { name: error?.name });
    return sendJson(res, 502, { error: 'Visitor count is temporarily unavailable' });
  }
}
