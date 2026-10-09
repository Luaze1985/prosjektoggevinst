import { retrieveCases } from './case-retrieval.js';
import { SYSTEM_PROMPT, JSON_SCHEMA, buildContext, validateAssessment } from './evaluation-contract.js';

const origins = new Set(['https://luaze1985.github.io', 'http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000', 'http://127.0.0.1:5173']);
const limits = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', Vary: 'Origin' };
    if (origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (origin && !origins.has(origin)) return reply({ error: 'Denne nettsiden har ikke tilgang.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'Bruk POST.' }, 405);
    const now = Date.now();
    if (limits.size > 2000) for (const [key, value] of limits) if (value.until <= now) limits.delete(key);
    const ip = request.headers.get('cf-connecting-ip') || 'ukjent';
    const limit = limits.get(ip);
    const current = !limit || limit.until <= now ? { count: 0, until: now + 600000 } : limit;
    limits.set(ip, current);
    if (++current.count > 20) return reply({ error: 'Vent før du vurderer igjen (20 vurderinger per 10 minutter).' }, 429);
    let input;
    try {
      const body = await request.text();
      if (body.length > 50000) return reply({ error: 'Beskrivelsen er for lang.' }, 413);
      input = JSON.parse(body);
    } catch { return reply({ error: 'Ugyldig forespørsel.' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      ['dagensSituasjon', 'foreslaattLosning', 'eierSektorEffekt'].some(key => typeof input[key] !== 'string' || input[key].length > 10000) ||
      !input.dagensSituasjon.trim() || !input.foreslaattLosning.trim() ||
      (input.svar && (typeof input.svar !== 'object' || Array.isArray(input.svar)))) {
      return reply({ error: 'Beskriv dagens situasjon og løsningen.' }, 400);
    }
    for (const [key, max] of [['timerPerUke', 200], ['kuttProsent', 100]]) {
      if (input[key] !== undefined && (!Number.isFinite(input[key]) || input[key] < 0 || input[key] > max)) return reply({ error: 'Ugyldig tidsanslag.' }, 400);
    }
    if (!env.OPENAI_API_KEY) return reply({ error: 'Vurderingstjenesten mangler modelltilkobling.' }, 503);
    try {
      const retrieval = await retrieveCases([input.dagensSituasjon, input.foreslaattLosning, input.eierSektorEffekt].join(' '), env);
      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(25000),
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.1,
          response_format: { type: 'json_schema', json_schema: { name: 'sensor_evaluering', strict: true, schema: JSON_SCHEMA } },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(buildContext(input, retrieval.cases)) }
          ]
        })
      });
      if (!upstream.ok) return reply({ error: 'Modellen svarte ikke. Prøv igjen senere.' }, upstream.status === 429 ? 429 : 502);
      const envelope = await upstream.json();
      const assessment = validateAssessment(JSON.parse(envelope?.choices?.[0]?.message?.content), input, retrieval.cases);
      return reply({ ...assessment, versjon: 2, kilde: 'openai_proxy', datagrunnlag: retrieval.status });
    } catch {
      return reply({ error: 'Vurderingen kunne ikke kontrolleres. Prøv igjen senere.' }, 502);
    }
  }
};
