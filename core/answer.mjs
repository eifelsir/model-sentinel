import { Worker } from 'node:worker_threads';
import { extractHtml } from './html.mjs';
export function finalText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?\s*>/gi, '').replace(/<think(?:ing)?\b[^>]*>[\s\S]*$/gi, '').trim();
}
function normalize(value) {
  return value.normalize('NFKC')
    .replace(/```(?:[a-z]+)?\s*([\s\S]*?)```/gi, '$1')
    .replace(/(\*\*|__)([\s\S]+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(^|\s)([*_])([^*_]+)\2(?=$|\s|[.,!?])/g, '$1$3')
    .replace(/\s+/g, ' ').trim();
}
const insufficient = reason => ({ status: 'insufficient', answer: '', reason });
function numeric(value) {
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!match || value.length > 10000) return null;
  const fraction = match[3] || match[4] || '';
  let digits = ((match[2] || '0') + fraction).replace(/^0+/, '');
  if (!digits) return '0';
  let exponent = BigInt(match[5] || 0) - BigInt(fraction.length);
  const zeros = /0+$/.exec(digits)?.[0].length || 0;
  if (zeros) { digits = digits.slice(0, -zeros); exponent += BigInt(zeros); }
  return `${match[1] === '-' ? '-' : ''}${digits}e${exponent}`;
}
function compare(answer, expected) {
  const actual = normalize(answer), desired = normalize(expected);
  const a = numeric(actual), b = numeric(desired);
  const equal = a !== null && b !== null ? a === b : actual === desired;
  return { status: equal ? 'normal' : 'degraded', answer: actual, reason: equal ? 'Answer matches' : 'Answer differs' };
}
function trailingCandidate(line) {
  const correction = /^(?:不是[\s\S]+?[，,]\s*(?:而?是)\s*|(?:no\b|actually\b|correction\b|rather\b)[,，:]?\s*)(.+)$/i.exec(line);
  if (correction) return correction[1].replace(/[。.!]+$/, '').trim();
  const value = line.replace(/[。.!]+$/, '').trim();
  if (numeric(value) !== null) return value;
  if (/^(?:because\b|since\b|this\b|that\b|the\b|it\b|I\b|we\b|thus\b|therefore\b|explanation\b|see\b|note\b|因为|由于|这|计算|说明|根据|因此|所以|其中|可以|按)/i.test(value)) return null;
  return value.length <= 80 && value.split(/\s+/).length <= 4 && /^[\p{L}\p{N}][\p{L}\p{N}' -]*$/u.test(value) ? value : null;
}
const ambiguous = /(?:可能|也许|或者|或是|不确定|\b(?:maybe|perhaps|either|uncertain|possibly|might|could|may be)\b|(?:或|\bor\b)\s*[+-]?(?:\d|\.\d))/i;
const marker = /(?:final answer|answer|result|最终答案|最后答案|答案|结果)\s*(?:is|是|为|[:：=]|(?:might|could|may)\s+be)\s*/gi;
const quantityMarker = /(?:最(?:少|多)(?:(?:需要|需|要)\s*(?:取出|取|拿出|拿|抽出|抽|摸出|摸)?|取出|取|拿出|拿|抽出|抽|摸出|摸|为|是)|(?:the\s+)?(?:average|mean|minimum|maximum|total|final)\s+[\p{L} ]{1,60}?\s+(?:is|equals))\s*(.+)$/iu;
const explanation = /[,，]\s*(?:because\b|since\b|accounting for\b|因为|由于)/i;
const selfDoubt = /(?:\bI(?:\s+am|'m)\s+(?:not sure|uncertain|unsure)\b|我(?:仍然|仍)?(?:不确定|不能确定))/i;

function boxes(text) {
  const values = [], pattern = /\\boxed\s*\{/g;
  let match;
  while ((match = pattern.exec(text))) {
    // Bound candidate work before scanning context or rewriting nested LaTeX.
    if (values.length >= 64) return null;
    const start = pattern.lastIndex;
    let depth = 1, end = start;
    for (; end < text.length && depth; end++) {
      if (text[end] === '\\' && /[{}\\]/.test(text[end + 1] || '')) { end++; continue; }
      if (text[end] === '{') depth++;
      if (text[end] === '}') depth--;
    }
    if (depth) return null;
    values.push({ value: text.slice(start, end - 1), index: match.index, end });
    pattern.lastIndex = end;
  }
  return values;
}
function quantityText(value) {
  const found = boxes(value);
  if (!found) return '';
  for (const box of found.reverse()) value = value.slice(0, box.index) + box.value + value.slice(box.end);
  return normalize(value
    .replace(/\\(?:text|mathrm|textrm|operatorname)\s*\{([^{}]*)\}/g, ' $1 ')
    .replace(/\\(?:[,!;:]|quad\b|qquad\b)/g, ' ')
    .replace(/\\[()[\]]|\$/g, ''))
    .replace(/[。.!]+$/, '').trim();
}
function answerScope(clause, index) {
  const prefix = clause.slice(0, index);
  const start = Math.max(prefix.lastIndexOf(','), prefix.lastIndexOf('，')) + 1;
  if (/^(?:maybe\b|perhaps\b|possibly\b|可能|也许)/i.test(prefix)) return clause.split(explanation)[0];
  return clause.slice(start).split(explanation)[0];
}
function numericCandidate(value) {
  const text = quantityText(value);
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?=$|[\s,，。;；.!?）)\]]|颗|个|只|件|次|人|枚|本|条|米|厘米|毫米|千米|克|千克|秒|分钟|小时|岁|英寸|英尺|元|%)/.exec(text);
  if (!match) return insufficient('Unable to extract a complete numeric answer');
  const suffix = text.slice(match[0].length).replace(/^\s*(?:颗|个|只|件|次|人|枚|本|条|厘米|毫米|千米|米|千克|克|秒|分钟|小时|岁|英寸|英尺|元|%|\b(?:inches|inch|feet|foot|cm|mm|km|m|kg|g|seconds?|minutes?|hours?|candies|items?)\b)/i, '');
  if (/^\s*(?:[+\-*/^=×÷]|\\(?:times|div|frac|cdot)\b)/.test(suffix)) return insufficient('Unresolved numeric expression');
  if (/^\s*(?:[/,，]|\band\b|和|与)?\s*[+-]?(?:\d|\.\d)/i.test(suffix)) return insufficient('Multiple numeric answers');
  if (suffix.trim() && !/^[.,。!?）)\]]+$/.test(suffix.trim()) && explanation.exec(suffix.trim())?.index !== 0 && !/^\s*(?:because\b|since\b|因为|由于)/i.test(suffix)) {
    return insufficient('Unable to extract a complete numeric answer');
  }
  return { answer: match[1] };
}
export function evaluateRegexInWorker(text, test) {
  try {
    const match = new RegExp(test.pattern, 'u').exec(finalText(text));
    if (!match) return insufficient('Pattern did not match');
    return compare(match[1] ?? match[0], String(test.expected ?? ''));
  } catch { return insufficient('Invalid regular expression'); }
}
export function evaluateAnswer(text, test = {}) {
  if (typeof text === 'string' && text.length > 1000000) return insufficient('Response exceeds answer evaluation limit');
  const clean = finalText(text);
  if (!clean) return insufficient('No final answer text');
  if (/(?:\b(?:I (?:cannot|can't|am unable to)|unable to comply|cannot (?:answer|assist)|sorry[, ]+I)\b|无法回答|不能回答|拒绝回答|无法提供)/i.test(clean)) return insufficient('Response is a refusal');
  if (test.mode === 'regex') return insufficient('Regex evaluation requires worker isolation');
  const expected = String(test.expected ?? '');
  if (!expected.trim()) return insufficient('Expected answer is empty');
  if (test.mode === 'exact') return compare(clean, expected);
  const wantsNumber = numeric(normalize(expected)) !== null;
  if (!wantsNumber && ambiguous.test(clean)) return insufficient('Ambiguous answer');
  const lines = clean.split(/\r?\n|[;；]|(?<=[。!?！？])|(?<=\.)\s+/).map(line => normalize(line)).filter(Boolean);
  const markers = [];
  for (const line of lines) {
    if (selfDoubt.test(line)) return insufficient('Ambiguous answer');
    const found = boxes(line);
    if (!found) return insufficient('Unable to extract an unambiguous final answer');
    for (const box of found) markers.push({ raw: box.value, scope: answerScope(line, box.index) });
    const declarations = [];
    for (const match of line.matchAll(marker)) {
      if (declarations.length >= 64) return insufficient('Unable to extract an unambiguous final answer');
      declarations.push(match);
    }
    for (const [index, match] of declarations.entries()) {
      markers.push({ raw: line.slice(match.index + match[0].length, declarations[index + 1]?.index), scope: answerScope(line, match.index) });
    }
    const match = !declarations.length && wantsNumber ? quantityMarker.exec(line) : null;
    if (match) markers.push({ raw: match[1], scope: answerScope(line, match.index) });
    const correction = markers.length && (
      /(?:^|[,，]\s*)(?:(?:but|however)\s+)?(?:actually\b|correction\b|rather\b|instead\b|不对|更正)\s*[:,，]?\s*(.+)$/i.exec(line)
      || (wantsNumber && /^(?:(?:but|however)[,，]?\s+)?(?:it|that|this)\s+(?:is|should be|must be|equals)\s+([+-]?(?:\d|\.\d).*)$/i.exec(line))
    );
    if (correction) markers.push({ raw: correction[1], scope: correction[0] });
    else if (!match && !declarations.length && !found.length && markers.length) {
      const candidate = trailingCandidate(line);
      if (candidate !== null && (!wantsNumber || numeric(candidate) !== null || /^(?:不是|no\b|actually\b|correction\b|rather\b)/i.test(line))) {
        markers.push({ raw: candidate, scope: line });
      }
      if (/\b(?:it|that|this)\s+(?:could|might|may)\s+(?:also\s+)?be\b/i.test(line)) return insufficient('Ambiguous answer');
    }
    if (markers.length > 128) return insufficient('Unable to extract an unambiguous final answer');
  }
  const answers = [];
  for (const candidate of markers) {
    if (ambiguous.test(candidate.scope)) return insufficient('Ambiguous answer');
    if (wantsNumber) {
      const parsed = numericCandidate(candidate.raw);
      if (parsed.status) return parsed;
      answers.push(parsed.answer);
    } else {
      answers.push(quantityText(candidate.raw));
    }
  }
  if (new Set(answers.map(v => numeric(v) ?? v)).size > 1) return insufficient('Contradictory final answers');
  if (answers.length) return compare(answers.at(-1), expected);
  if (ambiguous.test(clean)) return insufficient('Ambiguous answer');
  const correction = /不是[\s\S]+[，,]\s*(?:而?是)\s*(.+)$/.exec(clean);
  if (correction) return compare(correction[1].replace(/[。.!]+$/, ''), expected);
  const last = lines.at(-1).replace(/[。!]+$/, '').trim();
  if (numeric(last) !== null) return compare(last, expected);
  if (numeric(normalize(expected)) === null && lines.length === 1 && last.length <= 500 && !/[，,。;；?:：]/.test(last)) return compare(last, expected);
  if (normalize(last) === normalize(expected)) return compare(last, expected);
  return insufficient('Unable to extract an unambiguous final answer');
}
export async function evaluateSafely(text, test = {}) {
  if (test.type === 'html') return extractHtml(text);
  if (test.mode !== 'regex') return evaluateAnswer(text, test);
  const preliminary = evaluateAnswer(text, { ...test, mode: 'exact' });
  if (preliminary.status === 'insufficient') return preliminary;
  return new Promise(resolve => {
    const worker = new Worker(new URL('./judge-worker.mjs', import.meta.url), { workerData: { text: String(text).slice(0, 1000000), test }, resourceLimits: { maxOldGenerationSizeMb: 32 } });
    let settled = false;
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); void worker.terminate(); resolve(result); };
    const timer = setTimeout(() => finish(insufficient('Regex execution timed out')), 250);
    worker.once('message', finish);
    worker.once('error', () => finish(insufficient('Regex worker failed')));
    worker.once('exit', () => finish(insufficient('Regex worker exited')));
  });
}
