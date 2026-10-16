import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeWithModel } from '../core/model-judge.mjs';

const conclusion = String.raw`因此，最少是 **\(\boxed{21}\) 个**。`;
export const evidenceCases = [
  {
    name: 'surrounding whitespace around a copied conclusion',
    source: conclusion, evidence: ` ${conclusion} \n`,
  },
  {
    name: 'screenshot-style unclosed emphasis and escaped punctuation',
    source: conclusion, evidence: String.raw`因此，最少是 **\(\boxed{21}\) 个\。 `,
  },
  {
    name: 'plain quotation of a boxed quantity',
    source: conclusion, evidence: '因此，最少是 21 个。',
  },
  {
    name: 'line wrapping inside evidence',
    source: 'You need a grand total of **21 pieces**.',
    evidence: 'You need a grand\n total of 21 pieces.',
  },
  {
    name: 'nested presentation commands and full-width numbers',
    source: String.raw`需要的总数为 \(\boxed{２１\text{ 个}}\)。`,
    evidence: '需要的总数为 21 个。',
  },
  {
    name: 'a unit directly following the number in a presentation command',
    source: String.raw`You need \(\boxed{21\text{pieces}}\).`,
    evidence: 'You need 21 pieces.',
  },
  {
    name: 'unclosed code quoting and escaped ASCII punctuation',
    source: 'You need `21 pieces`.',
    evidence: String.raw`You need ` + '`21 pieces\\.',
  },
  {
    name: 'a complete quantity followed by an explanatory breakdown',
    source: 'You need a grand total of 21 pieces (7 red and 14 blue).',
    evidence: 'You need a grand total of 21 pieces (7 red and 14 blue).',
  },
  {
    name: 'a complete quantity followed by a grouping explanation',
    source: 'You need a grand total of 21 pieces (3 groups of 7).',
    evidence: 'You need a grand total of 21 pieces (3 groups of 7).',
  },
];

function extraction(source, evidence, answer = '21', expected = '21') {
  return judgeWithModel({
    text: source, test: { prompt: 'original question', expected },
    connection: { id: 'c', name: 'Local', protocol: 'responses' },
    target: { id: 't', model: 'judge-model' },
    request: async () => ({
      text: JSON.stringify({ answer, evidence }),
      usage: { input_tokens: 10, output_tokens: 12 },
    }),
    localReason: 'Unable to extract a complete numeric answer',
  });
}

for (const sample of evidenceCases) {
  test(`auxiliary extraction accepts ${sample.name}`, async () => {
    const result = await extraction(sample.source, sample.evidence);
    assert.equal(result.status, 'normal');
    assert.equal(result.answer, '21');
    assert.equal(result.judgement.usage.totalTokens, 22);
  });
}

test('formatted evidence cannot turn an extracted 21 into the expected 22', async () => {
  const result = await extraction(conclusion, '因此，最少是 21 个。', '21', '22');
  assert.equal(result.status, 'degraded');
  assert.equal(result.answer, '21');
});

for (const source of [
  String.raw`总数为 \(\boxed{-21}\) 个。`,
  String.raw`总数为 \(\boxed{21\text{ 个}+2}\)。`,
  String.raw`总数为 \(\frac{\boxed{21}}{2}\)。`,
  String.raw`总数为 \(\sqrt{21}\)。`,
  String.raw`You need \(\frac{42}{21}\) pieces.`,
  String.raw`You need \(\frac{42}{(21)}\) pieces.`,
  String.raw`You need \(\frac{42}{\left(21\right)}\) pieces.`,
  String.raw`You need \(\dfrac{42}{21}\) pieces.`,
  String.raw`You need \(2^{21}\) pieces.`,
  String.raw`You need \(2^{(21)}\) pieces.`,
  String.raw`You need \(2_{21}\) pieces.`,
  String.raw`You need \(\sqrt[3]{21}\) pieces.`,
  'You need (21) * 2 items.',
  'You need 21 .5 items.',
  String.raw`You need \(2 \times 21\) pieces.`,
  String.raw`You need \(42 \div 21\) pieces.`,
  String.raw`You need \(2\left(21\right)\) pieces.`,
  'You need 21(2) pieces.',
  '需要2乘21个。',
  'You need 42 mod 21 pieces.',
  String.raw`You need \(\boxed{21\text{pieces}+2}\).`,
  'You need 21 * 2 items.',
  'You need 2 **21 items.',
  'You need x **21 items.',
  'You need 21 ** 2 items.',
  'You need 210 items.',
  'You need 2 1 items.',
]) {
  test(`evidence formatting cannot hide an incomplete quantity: ${source}`, async () => {
    const result = await extraction(source, '21');
    assert.equal(result.status, 'insufficient');
    assert.equal(result.answer, '');
  });
}

test('an invented quotation remains insufficient with an explicit explanation', async () => {
  const result = await extraction('The calculation includes 21, but no conclusion was reached.', 'Therefore you need 21.');
  assert.equal(result.status, 'insufficient');
  assert.equal(result.reason, 'Model judge evidence was not found in the reply');
});
