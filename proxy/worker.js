import { retrieveCases } from './case-retrieval.js';
import {
  REVISOR_SYSTEM_PROMPT, REVISOR_JSON_SCHEMA, buildContext,
  ARKITEKT_SYSTEM_PROMPT, ARKITEKT_JSON_SCHEMA, buildArkitektContext,
  validateDualAssessment, validateAssessment
} from './evaluation-contract.js';

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

      // Steg 1 av 2: Revisor (Kilde- og gaprevisjon)
      const upstream1 = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(25000),
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.1,
          response_format: { type: 'json_schema', json_schema: { name: 'revisor_evaluering', strict: true, schema: REVISOR_JSON_SCHEMA } },
          messages: [
            { role: 'system', content: REVISOR_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(buildContext(input, retrieval.cases)) }
          ]
        })
      });
      if (!upstream1.ok) return reply({ error: 'Modellen svarte ikke i revisjonssteget. Prøv igjen senere.' }, upstream1.status === 429 ? 429 : 502);
      const envelope1 = await upstream1.json();
      const parsed1 = JSON.parse(envelope1?.choices?.[0]?.message?.content);

      // Bakoverkompatibel støtte for legacy single-shot kall
      if (parsed1.testoppsett && parsed1.konklusjon && !parsed1.dom) {
        const singleAssessment = validateAssessment(parsed1, input, retrieval.cases);
        return reply({ ...singleAssessment, versjon: 2, kilde: 'openai_proxy', datagrunnlag: retrieval.status });
      }

      // Steg 2 av 2: Smidig Arkitekt (Operativt testoppsett)
      const upstream2 = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(25000),
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.1,
          response_format: { type: 'json_schema', json_schema: { name: 'arkitekt_testoppsett', strict: true, schema: ARKITEKT_JSON_SCHEMA } },
          messages: [
            { role: 'system', content: ARKITEKT_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(buildArkitektContext(input, parsed1)) }
          ]
        })
      });
      if (!upstream2.ok) return reply({ error: 'Modellen svarte ikke i arkitektsteget. Prøv igjen senere.' }, upstream2.status === 429 ? 429 : 502);
      const envelope2 = await upstream2.json();
      const parsed2 = JSON.parse(envelope2?.choices?.[0]?.message?.content);

      const dualAssessment = validateDualAssessment(parsed1, parsed2, input, retrieval.cases);
      return reply({ ...dualAssessment, kilde: 'openai_proxy', datagrunnlag: retrieval.status });
    } catch {
      return reply({ error: 'Vurderingen kunne ikke kontrolleres. Prøv igjen senere.' }, 502);
    }
  }
};
