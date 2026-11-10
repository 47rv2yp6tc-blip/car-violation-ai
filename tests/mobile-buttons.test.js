import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../mobile-app.css', import.meta.url), 'utf8');

test('mobile buttons use a consistent 50px target and 12px radius', () => {
  assert.match(css, /--app-button-height:\s*50px/);
  assert.match(css, /--app-button-radius:\s*12px/);
  assert.match(css, /white-space:\s*nowrap/);
});

test('mobile photo actions keep analysis primary and supporting actions grouped', () => {
  assert.match(css, /\.button-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.button-row #startAnalysisBtn,[\s\S]*?grid-column:\s*1\s*\/\s*-1/);
});

test('mobile controls expose focus, disabled, danger, and safe-area navigation treatments', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /button:disabled/);
  assert.match(css, /data-button-variant="danger"/);
  assert.match(css, /padding:\s*6px 8px calc\(6px \+ var\(--app-safe-bottom\)\)/);
});
