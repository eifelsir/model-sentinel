import { parse, defaultTreeAdapter } from 'parse5';

export const HTML_LIMIT = 262144;
const insufficient = reason => ({ status: 'insufficient', answer: '', reason, html: '' });

function hasCompleteDocument(source) {
  const start = /<!doctype\s+html\b[^>]*>|<html\b/i.exec(source);
  if (!start) return false;
  const document = parse(source.slice(start.index), { sourceCodeLocationInfo: true });
  const html = document.childNodes.find(node => node.tagName === 'html');
  const body = html?.childNodes.find(node => node.tagName === 'body');
  return Boolean(html?.sourceCodeLocation?.startTag && html.sourceCodeLocation.endTag && body?.sourceCodeLocation?.endTag);
}

export function extractHtml(value) {
  if (typeof value !== 'string' || !value.trim()) return insufficient('No HTML document');
  if (value.length > 1000000) return insufficient('HTML document exceeds preview limit');
  const fences = [...value.matchAll(/```(?:html)?[ \t]*\r?\n([\s\S]*?)\r?\n```/gi)]
    .filter(match => /<html\b/i.test(match[1]));
  if (fences.length > 1) return insufficient('Multiple HTML documents');
  const fence = fences[0];
  // Check outside the fence for an actual document, not isolated tag mentions in prose.
  if (fence && hasCompleteDocument(value.slice(0, fence.index) + value.slice(fence.index + fence[0].length))) {
    return insufficient('Multiple HTML documents');
  }
  const source = fence?.[1] ?? value;
  const start = /<!doctype\s+html\b[^>]*>|<html\b/i.exec(source);
  if (!start) return insufficient('No HTML document');
  const candidate = source.slice(start.index);
  if (candidate.length > HTML_LIMIT) return insufficient('HTML document exceeds preview limit');
  let htmlCount = 0;
  const treeAdapter = {
    ...defaultTreeAdapter,
    createElement(name, ...args) {
      if (name === 'html') htmlCount++;
      return defaultTreeAdapter.createElement(name, ...args);
    },
    // Duplicate document tags are otherwise merged by the forgiving HTML parser.
    adoptAttributes(element, attributes) {
      if (element.tagName === 'html') htmlCount++;
      defaultTreeAdapter.adoptAttributes(element, attributes);
    },
  };
  const document = parse(candidate, { sourceCodeLocationInfo: true, treeAdapter });
  if (htmlCount !== 1) return insufficient('Multiple HTML documents');
  const html = document.childNodes.find(node => node.tagName === 'html');
  const body = html?.childNodes.find(node => node.tagName === 'body');
  if (!html?.sourceCodeLocation?.startTag || !html.sourceCodeLocation.endTag || !body?.sourceCodeLocation?.endTag) {
    return insufficient('Incomplete HTML document');
  }
  const stack = [html];
  let hasSvg = false;
  while (stack.length) {
    const node = stack.pop();
    if (node.tagName === 'svg' && node.namespaceURI === 'http://www.w3.org/2000/svg') {
      const location = node.sourceCodeLocation;
      if (!location?.endTag && !candidate.slice(location?.startOffset, location?.endOffset).trimEnd().endsWith('/>')) {
        return insufficient('Incomplete SVG document');
      }
      hasSvg = true;
    }
    if (node.childNodes) stack.push(...node.childNodes);
  }
  if (!hasSvg) return insufficient('HTML document has no SVG');
  return {
    status: 'generated', answer: '', reason: 'HTML generated',
    html: candidate.slice(0, html.sourceCodeLocation.endTag.endOffset).trim(),
  };
}
