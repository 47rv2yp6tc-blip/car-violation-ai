# Visit counter deployment notes

The homepage visit statistic uses the `/api/visit-count` serverless endpoint and Upstash Redis. Configure these Vercel environment variables before deployment:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

The API uses an HttpOnly, SameSite=Lax browser cookie that expires after 30 minutes. Redis uses an atomic Lua script with a SHA-256 digest of that random cookie value as a short-lived deduplication key; the raw cookie value is not stored in Redis. The total is stored at `roadlens:visits:total`.

No GPS, name, license plate, or account identifier is collected. If Redis is not configured or unavailable, the endpoint responds with an error and the UI displays “暫不提供” without affecting traffic analysis.

The existing service worker injects the counter script into HTML navigations so the original homepage markup remains unchanged. Since the browser may need to activate the updated service worker, the statistic may appear after the next page load following deployment.
