import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSafely } from '../core/answer.mjs';
import { animation } from './fixtures/html-animation.mjs';

const question = { type: 'html', prompt: 'Make an SVG animation.', expected: '', mode: 'auto' };

test('HTML generation extracts a complete SVG document without a fixed answer', async () => {
  const result = await evaluateSafely(animation, question);
  assert.equal(result.status, 'generated');
  assert.equal(result.answer, '');
  assert.equal(result.html, animation);
});

test('HTML generation removes the Markdown fence and surrounding explanation', async () => {
  const result = await evaluateSafely(`Here is the page:\n\`\`\`html\n${animation}\n\`\`\`\nSave as HTML.`, question);
  assert.equal(result.status, 'generated');
  assert.equal(result.html, animation);
});

for (const [before, after] of [
  ['Here is the complete `<html>` document:\n', ''],
  ['', '\nSave this `<html>` document as animation.html.'],
]) {
  test('an explanatory inline HTML tag is not an additional fenced document', async () => {
    const result = await evaluateSafely(`${before}\`\`\`html\n${animation}\n\`\`\`${after}`, question);
    assert.equal(result.status, 'generated');
    assert.equal(result.html, animation);
  });
}

test('raw HTML may have surrounding prose and script strings containing closing tags', async () => {
  const html = animation.replace('document.body.dataset.ready="yes";', 'const label="</html>"; document.body.dataset.ready="yes";');
  const result = await evaluateSafely(`The following is the page:\n${html}\nThat is the complete page.`, question);
  assert.equal(result.status, 'generated');
  assert.equal(result.html, html);
});

for (const [name, input] of [
  ['missing SVG', '<!doctype html><html><head><title>Empty</title></head><body>No drawing</body></html>'],
  ['SVG mentioned only in a script', '<!doctype html><html><head></head><body><script>const text="<svg></svg>";</script></body></html>'],
  ['truncated document', animation.replace('</body></html>', '')],
  ['truncated SVG', animation.replace('</svg>', '')],
  ['two documents', animation + animation],
  ['multiple fenced pages', `\`\`\`html\n${animation}\n\`\`\`\n\`\`\`html\n${animation}\n\`\`\``],
  ['a fenced page followed by a raw page', `\`\`\`html\n${animation}\n\`\`\`\nAnother page:\n${animation}`],
  ['a raw page followed by a fenced page', `${animation}\nAnother page:\n\`\`\`html\n${animation}\n\`\`\``],
  ['non-HTML response', 'I cannot create that animation.'],
  ['oversized page', animation.replace('</body>', '<!--' + 'x'.repeat(262144) + '--></body>')],
]) {
  test(`HTML generation does not expose an artifact for ${name}`, async () => {
    const result = await evaluateSafely(input, question);
    assert.equal(result.status, 'insufficient');
    assert.equal(result.html || '', '');
  });
}
