// proxy/worker.js - Cloudflare Worker for sikker OpenAI proxying til studenter
// Beskytter OPENAI_API_KEY mot eksponering i offentlig GitHub Pages frontend.
// Gratis drift på Cloudflare Workers (100 000 forespørsler/dag gratis).

const FORBUDTE_ORD = ['spennende', 'innovativ', 'robust', 'revolusjonerende', 'synergier', 'optimalisere', 'potensial'];

const SENSOR_SYSTEM_PROMPT = `Rolle: Du er en nådeløs, jordnær innovasjonsrevisor for industri, næringsliv og offentlige etater. 
Tone: Nøktern, direkte, handlingsorientert på norsk bokmål.
Forbudte ord: ${FORBUDTE_ORD.map(w => `"${w}"`).join(', ')}.

Ufravikelige regler:
1. Sjekklistesvarene (ja / vet_ikke / nei) er EVIDENSBASERT FASIT og kan aldri overprøves.
2. Hvis prosesseier eller baseline mangler (nei/vet_ikke), er prosjektet automatisk BLOKKERT for videre koding.
3. Ingen innledninger, ingen høflighetsfraser, ingen rådgiver-floskler.
4. "testoppsett" MÅ inneholde en tallfestet stoppregel (f.eks. "Stopp hvis tidsbruk > dagens nivå, eller feilrate > 2 %").
5. Alle genererte kulepunkter skal være på MAKS én setning.
6. Svar KUN i gyldig JSON etter skjemaet.`;

const SENSOR_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['konklusjon', 'styrker', 'gap', 'testoppsett'],
  properties: {
    konklusjon: { type: 'string', maxLength: 220 },
    styrker: {
      type: 'array',
      items: { type: 'string', maxLength: 160 },
      minItems: 2,
      maxItems: 3
    },
    gap: {
      type: 'array',
      items: { type: 'string', maxLength: 160 },
      minItems: 2,
      maxItems: 3
    },
    testoppsett: {
      type: 'array',
      items: { type: 'string', maxLength: 200 },
      minItems: 3,
      maxItems: 3
    }
  }
};

// Tillatte domener for CORS
const TILLATTE_ORIGINS = [
  'https://luaze1985.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000',
  'http://127.0.0.1:5173'
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const erTillatt = TILLATTE_ORIGINS.includes(origin) || origin.endsWith('.github.io');
  return {
    'Access-Control-Allow-Origin': erTillatt ? origin : 'https://luaze1985.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

// In-memory rate limiting per worker instans (maks 20 per IP per 10 minutter)
const rateLimitMap = new Map();

function erRateLimitOverskredet(ip) {
  const naa = Date.now();
  const vinduMs = 10 * 60 * 1000;
  const grense = 20;

  const data = rateLimitMap.get(ip) || { count: 0, resetTid: naa + vinduMs };
  if (naa > data.resetTid) {
    data.count = 1;
    data.resetTid = naa + vinduMs;
  } else {
    data.count += 1;
  }
  rateLimitMap.set(ip, data);

  // Periodisk opprydding
  if (rateLimitMap.size > 2000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (naa > v.resetTid) rateLimitMap.delete(k);
    }
  }

  return data.count > grense;
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(request);

    // 1. Preflight OPTIONS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Kun POST-forespørsler støttes.' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Sjekk rate-limit
    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'ukjent';
    if (erRateLimitOverskredet(clientIp)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit overskredet (maks 20 vurderinger per 10 minutter per bruker).' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Sjekk serverhemmelighet
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY er ikke konfigurert på proxy-serveren.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Les og valider input
    let input;
    try {
      input = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Ugyldig JSON-kropp i forespørselen.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { dagensSituasjon = '', foreslaattLosning = '', eierSektorEffekt = '', svar = {}, caser = [] } = input;
    if (!dagensSituasjon && !foreslaattLosning) {
      return new Response(JSON.stringify({ error: 'Mangler case-beskrivelse.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 5. Send videre til OpenAI gpt-4o-mini
    const brukerPayload = JSON.stringify({
      dagensSituasjon,
      foreslaattLosning,
      eierSektorEffekt,
      svar,
      referanseCaser: caser.slice(0, 3).map((c) => ({
        tittel: c.tittel,
        organisasjon: c.organisasjon,
        resultat: c.oppnaaddResultat || c.maaltResultat
      }))
    });

    try {
      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.1,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'sensor_evaluering',
              strict: true,
              schema: SENSOR_JSON_SCHEMA
            }
          },
          messages: [
            { role: 'system', content: SENSOR_SYSTEM_PROMPT },
            { role: 'user', content: brukerPayload }
          ]
        })
      });

      if (!openAiRes.ok) {
        const feilTxt = await openAiRes.text().catch(() => '');
        return new Response(
          JSON.stringify({ error: `OpenAI feil (${openAiRes.status}): ${feilTxt}` }),
          { status: openAiRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const openAiJson = await openAiRes.json();
      const content = openAiJson?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Tom respons fra OpenAI');
      }

      const parsed = JSON.parse(content);
      return new Response(
        JSON.stringify({
          kilde: 'openai_proxy',
          konklusjon: parsed.konklusjon,
          styrker: parsed.styrker,
          gap: parsed.gap,
          testoppsett: parsed.testoppsett
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Nettverks- eller modellfeil: ${err.message}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }
};
