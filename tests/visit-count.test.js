import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
process.env.NODE_ENV = 'test';

const { default: handler } = await import('../api/visit-count.js?test=' + Date.now());

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function makeRedisMock() {
  const buckets = new Set();
  let total = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://redis.example.test/');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    const command = JSON.parse(init.body);
    assert.equal(command[0], 'EVAL');
    assert.equal(command[2], '2');
    const bucket = command[4];
    const counted = !buckets.has(bucket);
    if (counted) {
      buckets.add(bucket);
      total += 1;
    }
    return { ok: true, json: async () => ({ result: [counted ? 1 : 0, total] }) };
  };
  return { buckets, getTotal: () => total };
}

test('new browser visit increments once and issues a short-lived HttpOnly cookie', async () => {
  const redis = makeRedisMock();
  const res = responseRecorder();
  await handler({ method: 'GET', headers: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { total: 1 });
  assert.match(res.headers['Set-Cookie'], /Max-Age=1800; HttpOnly; SameSite=Lax/);
  assert.equal(redis.getTotal(), 1);
});

test('same browser cookie is deduplicated and total remains global', async () => {
  const redis = makeRedisMock();
  const first = responseRecorder();
  await handler({ method: 'GET', headers: {} }, first);
  const cookie = first.headers['Set-Cookie'].split(';')[0];

  const refreshed = responseRecorder();
  await handler({ method: 'GET', headers: { cookie } }, refreshed);
  assert.deepEqual(refreshed.body, { total: 1 });
  assert.equal(refreshed.headers['Set-Cookie'], undefined);
  assert.equal(redis.getTotal(), 1);
});

test('different browser identifiers increment the shared site total', async () => {
  const redis = makeRedisMock();
  const first = responseRecorder();
  await handler({ method: 'GET', headers: {} }, first);
  const second = responseRecorder();
  await handler({ method: 'GET', headers: {} }, second);

  assert.deepEqual(second.body, { total: 2 });
  assert.equal(redis.getTotal(), 2);
});

test('unsupported methods are rejected without touching Redis', async () => {
  const res = responseRecorder();
  await handler({ method: 'POST', headers: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.body, { error: 'Method not allowed' });
});
