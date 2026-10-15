import http from 'node:http';

export async function createMockServer({ textForRequest, usageForRequest, beforeReply } = {}) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && url.pathname.endsWith('/models')) {
      const ids = ['test-normal', 'test-wrong', 'test-incomplete', 'test-slow'];
      res.end(JSON.stringify({ data: ids.map(id => ({ id, object: 'model' })), models: ids.map(id => ({ name: `models/${id}`, supportedGenerationMethods: ['generateContent'] })), has_more: false }));
      return;
    }
    let content = '';
    for await (const chunk of req) content += chunk;
    let body;
    try { body = JSON.parse(content); } catch { res.writeHead(400); res.end('{}'); return; }
    requests.push({ path: url.pathname, body, authorization: req.headers.authorization });
    const model = body.model || decodeURIComponent(url.pathname.match(/models\/(.*):generateContent/)?.[1] || '');
    await beforeReply?.({ model, body, path: url.pathname });
    if (model.includes('slow')) await new Promise(resolve => setTimeout(resolve, 1500));
    const text = textForRequest?.({ model, body, path: url.pathname }) ?? (model.includes('echo-key') ? `最终答案：42\n服务回显 ${req.headers.authorization || ''}` : model.includes('wrong') ? '最终答案：43' : '经过计算，6 × 7 = 42。\n最终答案：42');
    const incomplete = model.includes('incomplete');
    const usage = usageForRequest ? usageForRequest({ model, body, path: url.pathname }) : url.pathname.endsWith('/responses') ? { input_tokens: 10, output_tokens: 12 } : undefined;
    if (url.pathname.endsWith('/responses')) {
      res.end(JSON.stringify({ id: 'resp-fixture', object: 'response', status: incomplete ? 'incomplete' : 'completed', output: [{ type: 'reasoning', summary: [{ type: 'summary_text', text: '999' }] }, { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }], usage }));
    } else if (url.pathname.endsWith(':generateContent')) {
      res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ thought: true, text: '999' }, { text }] }, finishReason: incomplete ? 'MAX_TOKENS' : 'STOP' }], usageMetadata: usage }));
    } else if (url.pathname.endsWith('/messages')) {
      res.end(JSON.stringify({ id: 'msg-fixture', type: 'message', role: 'assistant', content: [{ type: 'thinking', thinking: '999', signature: 'signature' }, { type: 'text', text }], stop_reason: incomplete ? 'max_tokens' : 'end_turn', usage }));
    } else {
      res.end(JSON.stringify({ id: 'chat-fixture', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: text, reasoning_content: '999' }, finish_reason: incomplete ? 'length' : 'stop' }], usage }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, requests, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
