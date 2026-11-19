import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { ApiError, generatePriorities } from './priorities.mjs';
import { generateDecisionPriorities } from './decision-priorities.mjs';
import { generateDecisionPlan } from './decision-plan.mjs';
import { aiStatus } from './ai-provider.mjs';

export function createApi({ generate = generatePriorities, generateDecision = generateDecisionPriorities, generatePlan = generateDecisionPlan, allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8081,http://localhost:8082,http://localhost:8083,http://127.0.0.1:8081').split(',') } = {}) {
  const requests = new Map();
  return http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const send = (status, body) => { res.writeHead(status); res.end(JSON.stringify(body)); };
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) return send(403, { error: 'This origin is not allowed.' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.url === '/health' && req.method === 'GET') return send(200, { ok: true, ...aiStatus() });
    const generateRequest = req.url === '/api/priorities' ? generate : req.url === '/api/decision-priorities' ? generateDecision : req.url === '/api/decision-plan' ? generatePlan : null;
    if (!generateRequest) return send(404, { error: 'Not found.' });
    if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Use application/json.' });
    const now = Date.now();
    for (const [ip, entry] of requests) if (entry.reset <= now) requests.delete(ip);
    const ip = req.socket.remoteAddress;
    const entry = requests.get(ip) || { count: 0, reset: now + 60000 };
    if (++entry.count > 10) { res.setHeader('Retry-After', '60'); return send(429, { error: 'Please wait a minute before asking again.' }); }
    requests.set(ip, entry);
    try {
      const chunks = []; let size = 0;
      // Decision context can contain thousands of multi-byte characters.
      const bodyLimit = req.url === '/api/decision-plan' ? 49152 : 16384;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > bodyLimit) throw new ApiError(413, 'The request is too large.');
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new ApiError(400, 'Send valid JSON.'); }
      const controller = new AbortController();
      const cancel = () => { if (!res.writableEnded) controller.abort(); };
      res.once('close', cancel);
      try {
        const result = await generateRequest(body, { signal: controller.signal });
        if (!res.destroyed) send(200, result);
      } finally { res.removeListener('close', cancel); }
    } catch (error) { if (!res.destroyed && !res.headersSent) send(error instanceof ApiError ? error.status : 500, { error: error instanceof ApiError ? error.message : 'Something went wrong. Please try again.' }); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.API_HOST || '127.0.0.1';
  const port = Number(process.env.API_PORT || 8787);
  const server = createApi();
  server.requestTimeout = 110000;
  server.listen(port, host, () => {
    console.log(`Claro AI service: http://${host}:${port}`);
    const status = aiStatus();
    console.log(status.configured ? `${status.provider} configured (${status.model}).` : 'No AI provider key configured. Add OPENAI_API_KEY or GROQ_API_KEY to the server environment.');
  });
}
