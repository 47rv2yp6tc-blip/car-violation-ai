export function createVisionProvider({ endpoint, apiKey, fetchImpl = fetch }) {
  return {
    async analyze({ contents, generationConfig, signal }) {
      const response = await fetchImpl(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig }),
        signal,
      });
      const raw = await response.json().catch(() => ({}));
      return { response, raw };
    },
  };
}
