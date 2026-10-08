import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

// Hjelpefunksjon for å transpilere og laste TypeScript-moduler dynamisk
function loadTsModule(relPath) {
  const fullPath = path.resolve(appRoot, relPath);
  const code = fs.readFileSync(fullPath, 'utf-8');
  const codeCleaned = code
    .replace(/import\s+type\s+.*?from\s+['"].*?['"];?/g, '')
    .replace(/import\s+\{[\s\S]*?\}\s+from\s+['"]\.\/types['"];?/g, '');
  
  // Transpiler case-search og sensor-adapter sammen hvis nødvendig
  const transpiled = ts.transpileModule(codeCleaned, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', 'require', transpiled.outputText);
  
  const customRequire = (id) => {
    if (id === './case-search') {
      return loadTsModule('src/lib/case-search.ts');
    }
    return {};
  };
  
  fn(mod, mod.exports, customRequire);
  return mod.exports;
}

const caseSearch = loadTsModule('src/lib/case-search.ts');
const sensorAdapter = loadTsModule('src/lib/sensor-adapter.ts');

const {
  finnDomene,
  tellTreff,
  rangerCaser
} = caseSearch;

const {
  FORBUDTE_ORD,
  SENSOR_SYSTEM_PROMPT,
  rensOgParseJson,
  byggBrukerMelding,
  lokalSensorFallback,
  evaluerSensor,
  lagKiPrompt,
  opprettInnlimtResultat
} = sensorAdapter;

// 1. Test Prompt-bygger og systeminstruks
test('Prompt-bygger: Systemprompt og kontekstpayload', () => {
  // Sjekk at forbudte ord er med i listen og instruksen
  assert.ok(FORBUDTE_ORD.includes('spennende'));
  assert.ok(FORBUDTE_ORD.includes('robust'));
  assert.ok(FORBUDTE_ORD.includes('innovativ'));
  assert.ok(SENSOR_SYSTEM_PROMPT.includes('nådeløs, jordnær innovasjonsrevisor'));
  assert.ok(SENSOR_SYSTEM_PROMPT.includes('EVIDENSBASERT FASIT'));

  // Test at brukerpayload serialiseres med alle felter
  const input = {
    dagensSituasjon: 'Etterkontroll av 4000 enheter per skift tar 6 timer.',
    foreslaattLosning: 'Bildegjenkjenning av overflateavvik med manuell godkjenning.',
    eierSektorEffekt: 'Produksjonssjef er prosesseier med budsjettansvar.',
    svar: { eier: 'ja', baseline: 'ja', ikkeKi: 'nei', data: 'ja', kontroll: 'ja', juss: 'vet_ikke', test: 'ja' },
    caser: [
      { tittel: 'Optisk kontroll', organisasjon: 'Scania', oppnaaddResultat: '35% reduksjon', evidens: 'E3' }
    ]
  };

  const jsonStr = byggBrukerMelding(input);
  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.domene, 'industri og produksjon');
  assert.strictEqual(parsed.svar.eier, 'ja');
  assert.strictEqual(parsed.svar.juss, 'vet_ikke');
  assert.strictEqual(parsed.referanseCaser.length, 1);
  assert.strictEqual(parsed.referanseCaser[0].tittel, 'Optisk kontroll');
});

// 2. Test Defensiv JSON-parser (vasker vekk markdown code fences)
test('Defensiv JSON-parser: tåler markdown fences og uren formatering', () => {
  const gyldigObj = {
    konklusjon: 'Gjennomfør en 14 dagers test.',
    styrker: ['Punkt 1', 'Punkt 2'],
    gap: ['Gap 1', 'Gap 2'],
    testoppsett: ['Test 1', 'Måling', 'Stoppregel']
  };

  // Ren JSON
  const renJson = JSON.stringify(gyldigObj);
  assert.deepStrictEqual(rensOgParseJson(renJson), gyldigObj);

  // Markdown code fence med ```json
  const fencedJson = `\`\`\`json\n${renJson}\n\`\`\``;
  assert.deepStrictEqual(rensOgParseJson(fencedJson), gyldigObj);

  // Markdown code fence med bare ```
  const simpleFence = `\`\`\`\n${renJson}\n\`\`\``;
  assert.deepStrictEqual(rensOgParseJson(simpleFence), gyldigObj);

  // Whitespace rundt
  const messy = `   \n\t${renJson} \n  `;
  assert.deepStrictEqual(rensOgParseJson(messy), gyldigObj);

  // Ugyldig JSON skal kaste SensorAdapterFeil
  assert.throws(() => rensOgParseJson('Dette er ikke json'), /Ugyldig JSON/);
  assert.throws(() => rensOgParseJson(''), /tomt svar/);
});

// 3. Test OpenAI Seam og vellykket adapter-kall (Mock HTTP)
test('OpenAI Adapter: Vellykket evaluering via mock-klient', async () => {
  const input = {
    dagensSituasjon: '500 henvendelser per uke, svartid 3 dager.',
    foreslaattLosning: 'Triagering av henvendelser med saksbehandlerkontroll.',
    eierSektorEffekt: 'Kundesentersjefen eier prosessen.',
    svar: { eier: 'ja', baseline: 'ja', ikkeKi: 'ja', data: 'ja', kontroll: 'ja', juss: 'ja', test: 'ja' }
  };

  const mockResponsData = {
    konklusjon: 'Gjennomfør 14 dagers manuell pilot på 10 henvendelser.',
    styrker: ['Prosesseier og baseline er målt', 'Saksbehandler beholder full kontroll'],
    gap: ['Ingen tekniske integrasjoner er spesifisert'],
    testoppsett: [
      'Omfang: 10 henvendelser simulert manuelt',
      'Måling: Svartid og presisjon mot 3 dagers baseline',
      'Stoppregel: Avbryt hvis kvaliteten faller under dagens nivå'
    ]
  };

  let mottokHeaders = {};
  let mottokBody = null;

  const mockPoster = async (url, opts) => {
    mottokHeaders = opts.headers;
    mottokBody = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(mockResponsData) } }] }),
      json: async () => ({ choices: [{ message: { content: JSON.stringify(mockResponsData) } }] })
    };
  };

  const resultat = await evaluerSensor({
    input,
    apiKey: 'sk-test-12345',
    httpPoster: mockPoster
  });

  assert.strictEqual(resultat.kilde, 'openai');
  assert.strictEqual(resultat.konklusjon, mockResponsData.konklusjon);
  assert.strictEqual(resultat.styrker.length, 2);
  assert.strictEqual(resultat.testoppsett.length, 3);
  assert.strictEqual(mottokHeaders.Authorization, 'Bearer sk-test-12345');
  assert.strictEqual(mottokBody.model, 'gpt-4o-mini');
  assert.strictEqual(mottokBody.response_format.type, 'json_schema');
});

// 4. Test OpenAI Feilhåndtering og sømløs fallback (401, 429, 500)
test('OpenAI Adapter: Feilhåndtering og lokal fallback ved API-problemer', async () => {
  const input = {
    dagensSituasjon: 'Avvik i produksjon tar 10 timer.',
    foreslaattLosning: 'Optisk kontroll.',
    eierSektorEffekt: 'Fabrikksjef har budsjett.',
    svar: { eier: 'ja', baseline: 'ja' }
  };

  // Test 401 Ugyldig nøkkel
  const mock401 = async () => ({
    ok: false,
    status: 401,
    text: async () => 'Invalid authentication',
    json: async () => ({})
  });

  const res401 = await evaluerSensor({ input, apiKey: 'feil-nøkkel', httpPoster: mock401 });
  assert.strictEqual(res401.kilde, 'lokal');
  assert.ok(res401.fallbackGrunn.includes('401'));

  // Test 429 Rate Limit
  const mock429 = async () => ({
    ok: false,
    status: 429,
    text: async () => 'Rate limit exceeded',
    json: async () => ({})
  });

  const res429 = await evaluerSensor({ input, apiKey: 'sk-test', httpPoster: mock429 });
  assert.strictEqual(res429.kilde, 'lokal');
  assert.ok(res429.fallbackGrunn.includes('429'));

  // Test nettverkskrasj (throw)
  const mockCrash = async () => {
    throw new Error('ECONNRESET');
  };

  const resCrash = await evaluerSensor({ input, apiKey: 'sk-test', httpPoster: mockCrash });
  assert.strictEqual(resCrash.kilde, 'lokal');
  assert.ok(resCrash.fallbackGrunn.includes('ECONNRESET'));
});

// 5. Test Lokal Deterministisk Fallback (0 tokens)
test('Lokal Fallback: Produserer komplett gyldig skjema med stoppregel', () => {
  const uferdigInput = {
    dagensSituasjon: 'Manuell registrering.',
    foreslaattLosning: 'Bruk KI til alt.',
    eierSektorEffekt: 'Uklart eierskap.',
    svar: { eier: 'nei', baseline: 'nei', juss: 'vet_ikke' }
  };

  const resUferdig = lokalSensorFallback(uferdigInput);
  assert.strictEqual(resUferdig.kilde, 'lokal');
  assert.ok(resUferdig.konklusjon.includes('Stopp videre utvikling inntil prosesseier'));
  assert.ok(resUferdig.gap.some(g => g.includes('Prosesseier mangler')));
  assert.ok(resUferdig.gap.some(g => g.includes('Nullalternativ mangler')));
  assert.ok(resUferdig.testoppsett.some(t => t.includes('Stoppregel:')));

  // Moden input
  const modenInput = {
    dagensSituasjon: 'Kvalitetsavvik i produksjon tar 6 timer per skift.',
    foreslaattLosning: 'Bildegjenkjenning med operatørkontroll.',
    eierSektorEffekt: 'Produksjonssjef eier gevinsten.',
    svar: { eier: 'ja', baseline: 'ja', ikkeKi: 'ja', kontroll: 'ja' }
  };

  const resModen = lokalSensorFallback(modenInput);
  assert.ok(resModen.konklusjon.includes('Gjennomfør en 14 dagers manuell pilot'));
  assert.ok(resModen.styrker.some(s => s.includes('Prosesseier')));
});

// 6. Test Case-søk og domenematching (0 tokens, /determ)
test('Case-søk: Riktig domenematching og ranking over referansecaser', () => {
  const caser = [
    { tittel: 'Industri-syn', organisasjon: 'Fabrikk A', oppnaaddResultat: 'Kvalitetsavvik redusert' },
    { tittel: 'Helseassistent', organisasjon: 'Sykehus B', oppnaaddResultat: 'Epikriser og pasientjournaler' },
    { tittel: 'Fakturarobot', organisasjon: 'Økonomi C', oppnaaddResultat: 'Fakturabehandling og bilag' }
  ];

  // Test industri-tekst
  const industriTekst = 'Vi vil bruke bildegjenkjenning på produksjonslinje for å oppdage kvalitetsavvik på fabrikk.';
  const domene = finnDomene(industriTekst);
  assert.strictEqual(domene.id, 'produksjon');
  assert.strictEqual(tellTreff(industriTekst, caser), 1);

  const rangert = rangerCaser(industriTekst, caser);
  assert.strictEqual(rangert[0].tittel, 'Industri-syn');

  // Test helse-tekst
  const helseTekst = 'Leger og sykepleiere på sykehus bruker for mye tid på pasientjournaler.';
  const helseDomene = finnDomene(helseTekst);
  assert.strictEqual(helseDomene.id, 'helse');
  const helseRangert = rangerCaser(helseTekst, caser);
  assert.strictEqual(helseRangert[0].tittel, 'Helseassistent');
});

// 7. Test Handoff-prompt generator (Kopier som KI-prompt)
test('Handoff-prompt: Genererer eksekverbar Markdown-rigg med 3 artefakter', () => {
  const pakke = {
    input: {
      dagensSituasjon: '6 timer avvik ukentlig.',
      foreslaattLosning: 'Bildegjenkjenning med operatørgodkjenning.',
      eierSektorEffekt: 'Produksjonssjef eier gevinsten.'
    },
    svar: {
      eier: 'ja',
      baseline: 'ja',
      ikkeKi: 'ja',
      data: 'ja',
      kontroll: 'ja',
      juss: 'vet_ikke',
      test: 'ja'
    },
    dom: {
      antallJa: 6,
      niva: 'betinget',
      tittel: 'Godt på vei'
    },
    sensor: {
      kilde: 'openai',
      konklusjon: 'Gjennomfør en 14 dagers pilot.',
      styrker: ['Forankring i linjen', 'Baseline målt'],
      gap: ['Personvern uavklart'],
      testoppsett: ['Test på 10 enheter', 'Måling mot 6 timer', 'Stoppregel ved økt feilrate']
    },
    ukeoppgaver: [
      { id: '1', tittel: 'Forankring', tekst: 'Møte med leder' }
    ]
  };

  const prompt = lagKiPrompt(pakke);

  // Verifiser at nøkkelkomponenter finnes i prompten
  assert.ok(prompt.includes('SYSTEMINSTRUKS: OPERATIV OPPFØLGING'));
  assert.ok(prompt.includes('Dagens situasjon: 6 timer avvik ukentlig.'));
  assert.ok(prompt.includes('Juridisk og personvern: vet_ikke'));
  assert.ok(prompt.includes('ARTEFAKT 1: Testprotokoll'));
  assert.ok(prompt.includes('ARTEFAKT 2: Handlingsplan'));
  assert.ok(prompt.includes('ARTEFAKT 3: 150-ords beslutningsnotat'));
  assert.ok(prompt.includes('Stoppregel ved økt feilrate'));
});

// 8. Test parsing av bruker-innlimt KI-vurdering fra ChatGPT / Claude
test('Bruker-innlimt resultat: parser råtekst til strukturert SensorResultat', () => {
  const raatekst = `Piloten bør godkjennes under forutsetning av at prosesseier signerer mandatet.
• Sterk forankring og målt baseline i drift
• Bruk av eksisterende data reduserer risiko
• Gap: Personvernvurdering mangler formell godkjenning
• Gap: Rutiner for manuell overprøving må dokumenteres
• Test på 5 henvendelser første uke
• Sammenlign tidsbruk mot baseline
• Stopp hvis feilrate overskrider 3 %`;

  const res = opprettInnlimtResultat(raatekst);
  assert.equal(res.kilde, 'bruker_innlimt');
  assert.ok(res.konklusjon.includes('Piloten bør godkjennes'));
  assert.equal(res.styrker.length, 2);
  assert.ok(res.styrker[0].includes('Sterk forankring'));
  assert.equal(res.gap.length, 2);
  assert.ok(res.gap[0].includes('Personvernvurdering'));
  assert.equal(res.testoppsett.length, 3);
  assert.equal(res.raatekst, raatekst);
});

// 9. Test Student-Proxy (Cloudflare Worker): Vellykket proxy-evaluering
test('Student-Proxy: Vellykket evaluering via proxyUrl', async () => {
  const input = {
    dagensSituasjon: 'Kommune bruker 40 t/uke på manuelle søknader.',
    foreslaattLosning: 'KI-assistert sortering med saksbehandlerkontroll.',
    eierSektorEffekt: 'Kommunesjefen er formell prosesseier.',
    svar: { eier: 'ja', baseline: 'ja', ikkeKi: 'ja', data: 'ja', kontroll: 'ja', juss: 'ja', test: 'ja' }
  };

  let kaltUrl = '';
  const mockPoster = async (url, opts) => {
    kaltUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        kilde: 'openai_proxy',
        konklusjon: 'Godkjenn 14 dagers manuell pilot i kommunen.',
        styrker: ['Forankret hos kommunesjef', 'HITL er sikret'],
        gap: ['Ingen tekniske gap identifisert'],
        testoppsett: ['Test 10 søknader', 'Mål avvik', 'Stopp hvis feilrate øker']
      }),
      text: async () => ''
    };
  };

  const res = await evaluerSensor({
    input,
    proxyUrl: 'https://prosjektoggevinst-proxy.test.workers.dev',
    httpPoster: mockPoster
  });

  assert.equal(kaltUrl, 'https://prosjektoggevinst-proxy.test.workers.dev');
  assert.equal(res.kilde, 'openai_proxy');
  assert.ok(res.konklusjon.includes('Godkjenn 14 dagers manuell pilot'));
  assert.equal(res.styrker.length, 2);
  assert.equal(res.gap.length, 1);
  assert.equal(res.testoppsett.length, 3);
});

// 10. Test Student-Proxy: Feilhåndtering og fallback ved rate limit eller proxy-feil
test('Student-Proxy: Fallback ved feil eller rate limit', async () => {
  const input = {
    dagensSituasjon: '40 timer manuell saksbehandling ukentlig.',
    foreslaattLosning: 'Språkmodell for automatisering.',
    eierSektorEffekt: 'IT-avdelingen tester verktøyet.',
    svar: { eier: 'nei', baseline: 'nei', ikkeKi: 'nei', data: 'vet_ikke', kontroll: 'vet_ikke', juss: 'vet_ikke', test: 'vet_ikke' }
  };

  const mockFeilPoster = async () => ({
    ok: false,
    status: 429,
    json: async () => ({ error: 'Rate limit overskredet' }),
    text: async () => 'Rate limit overskredet'
  });

  const res = await evaluerSensor({
    input,
    proxyUrl: 'https://prosjektoggevinst-proxy.test.workers.dev',
    httpPoster: mockFeilPoster
  });

  assert.equal(res.kilde, 'lokal');
  assert.ok(res.fallbackGrunn && res.fallbackGrunn.includes('Kapasitetsgrense nådd på student-proxy'));
  assert.ok(res.konklusjon.includes('Stopp videre utvikling'));
});


