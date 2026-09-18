import test from 'node:test';
import assert from 'node:assert/strict';

const source = await import('../api/analyze.js?test=' + Date.now()).catch(() => null);

test('analyze module loads as an ES module', () => { assert.ok(source && typeof source.default === 'function'); });
test('repository does not expose a Gemini key in source files', async () => {
  const fs = await import('node:fs/promises');
  const files = ['../index.html', '../upload-fix.js', '../README.md'];
  for (const file of files) { const text = await fs.readFile(new URL(file, import.meta.url), 'utf8'); assert.doesNotMatch(text, /AIza[0-9A-Za-z_-]{20,}/); }
});
