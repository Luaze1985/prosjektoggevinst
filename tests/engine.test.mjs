import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

// Dynamisk kompilering og import av den ekte engine.ts implementasjonen
function loadRealEngine() {
  const enginePath = path.resolve(appRoot, 'src/lib/engine.ts');
  const code = fs.readFileSync(enginePath, 'utf-8');
  // Fjern type-imports siden types.ts er type-only i TypeScript
  const codeCleaned = code
    .replace(/import\s+type\s+.*?from\s+['"].*?['"];?/g, '')
    .replace(/import\s+\{[\s\S]*?\}\s+from\s+['"]\.\/types['"];?/g, '')
    .replace(/import\.meta/g, '({ env: {} })');
  const transpiled = ts.transpileModule(codeCleaned, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', 'require', transpiled.outputText);
  fn(mod, mod.exports, () => ({}));
  return mod.exports;
}

const realEngine = loadRealEngine();
const {
  beregnDfoGevinst,
  validerPortvakter,
  evaluerStudentCase,
  kobleTilBackendLLM,
  STANDARD_AARSVERK_KR
} = realEngine;

// 1. Test DFØ Gevinstberegning på ekte funksjon fra engine.ts
test('DFØ Matematikk: standard eksempler og grenseverdier (ekte engine.ts)', () => {
  // 40 t/uke, 50% -> 20 t/uke, 920 t/år, 0.5 årsverk, 425 000 kr (Kapasitetsgevinst)
  const case1 = beregnDfoGevinst({ timerPerUke: 40, kuttProsent: 50 });
  assert.strictEqual(case1.timerFrigjortPerUke, 20);
  assert.strictEqual(case1.timerFrigjortPerAar, 920);
  assert.strictEqual(case1.aarsverkFrigjort, 0.5);
  assert.strictEqual(case1.aarligKapasitetsverdiKr, 425000);
  assert.strictEqual(case1.gevinstkategori, 'Kapasitetsgevinst');
  assert.strictEqual(case1.timerFrigjortUke, 20);
  assert.strictEqual(case1.verdiKr, 425000);

  // 80 t/uke, 50% -> 40 t/uke, 1840 t/år, 1.1 årsverk, 935 000 kr
  const case2 = beregnDfoGevinst({ timerPerUke: 80, kuttProsent: 50 });
  assert.strictEqual(case2.timerFrigjortPerUke, 40);
  assert.strictEqual(case2.timerFrigjortPerAar, 1840);
  assert.strictEqual(case2.aarsverkFrigjort, 1.1);
  assert.strictEqual(case2.aarligKapasitetsverdiKr, 935000);
  assert.strictEqual(case2.gevinstkategori, 'Kapasitetsgevinst');

  // 20 t/uke, 25% -> 5 t/uke, 230 t/år, 0.1 årsverk, 85 000 kr (Tidsgevinst)
  const case3 = beregnDfoGevinst({ timerPerUke: 20, kuttProsent: 25 });
  assert.strictEqual(case3.timerFrigjortPerUke, 5);
  assert.strictEqual(case3.timerFrigjortPerAar, 230);
  assert.strictEqual(case3.aarsverkFrigjort, 0.1);
  assert.strictEqual(case3.aarligKapasitetsverdiKr, 85000);
  assert.strictEqual(case3.gevinstkategori, 'Tidsgevinst');

  // Grenseverdi: 0 t/uke -> 0 kr (mangler baseline)
  const case0 = beregnDfoGevinst({ timerPerUke: 0, kuttProsent: 50 });
  assert.strictEqual(case0.timerFrigjortPerUke, 0);
  assert.strictEqual(case0.timerFrigjortPerAar, 0);
  assert.strictEqual(case0.aarsverkFrigjort, 0);
  assert.strictEqual(case0.aarligKapasitetsverdiKr, 0);
  assert.strictEqual(case0.gevinstkategori, 'Tidsgevinst');

  // Maksgrense: 200 t/uke, 90% -> 180 t/uke, 8280 t/år, 4.7 årsverk, 3 995 000 kr
  const caseMax = beregnDfoGevinst({ timerPerUke: 200, kuttProsent: 90 });
  assert.strictEqual(caseMax.timerFrigjortPerUke, 180);
  assert.strictEqual(caseMax.timerFrigjortPerAar, 8280);
  assert.strictEqual(caseMax.aarsverkFrigjort, 4.7);
  assert.strictEqual(caseMax.aarligKapasitetsverdiKr, 3995000);
  assert.strictEqual(caseMax.gevinstkategori, 'Kapasitetsgevinst');

  // NaN og ugyldige verdier håndteres feilsikkert
  const caseNan = beregnDfoGevinst({ timerPerUke: NaN, kuttProsent: NaN });
  assert.ok(Number.isFinite(caseNan.timerFrigjortPerUke));
  assert.ok(Number.isFinite(caseNan.aarligKapasitetsverdiKr));
});

// 2. Test Portvakt-validering på ekte funksjon fra engine.ts
test('Portvakt-validering: 4 ufravikelige regler med prompt-gjenkjenning (ekte engine.ts)', () => {
  // Bare studentinntak (kun timer satt til 40, ingen tekst eller flagg)
  const barePortvakter = validerPortvakter({ prompt: '', timerPerUke: 40 });
  assert.strictEqual(barePortvakter[0].passert, false);
  assert.strictEqual(barePortvakter[0].status, 'MÅ AVKLARES');
  assert.strictEqual(barePortvakter[1].passert, true); // Baseline dokumentert!
  assert.strictEqual(barePortvakter[1].status, 'DOKUMENTERT');
  assert.strictEqual(barePortvakter[2].passert, false);
  assert.strictEqual(barePortvakter[2].status, 'MÅ VURDERES');
  assert.strictEqual(barePortvakter[3].passert, false);
  assert.strictEqual(barePortvakter[3].status, 'HITL KRAV');

  // Nullalternativ mangler (0 timer/uke) -> Portvakt 2 må stoppe!
  const nullAltPortvakter = validerPortvakter({ prompt: '', timerPerUke: 0 });
  assert.strictEqual(nullAltPortvakter[1].passert, false);
  assert.strictEqual(nullAltPortvakter[1].status, 'MANGLER');
  assert.ok(nullAltPortvakter[1].begrunnelse.includes('STOPP: Mangler nullalternativ'));

  // Studentidé med forankring, ikke-KI og HITL nevnt i prompten
  const rikTekstPortvakter = validerPortvakter({
    prompt: 'Vi har forankret løsningen hos avdelingsleder i helse. Saksbehandlere skal alltid overprøve og godkjenne resultatene (HITL). Vi har vurdert enklere maler og regler først.',
    timerPerUke: 40
  });
  assert.strictEqual(rikTekstPortvakter[0].passert, true, 'Prosesseier må gjenkjennes fra avdelingsleder');
  assert.strictEqual(rikTekstPortvakter[0].status, 'AVKLART');
  assert.strictEqual(rikTekstPortvakter[1].passert, true);
  assert.strictEqual(rikTekstPortvakter[2].passert, true, 'Ikke-KI må gjenkjennes fra maler');
  assert.strictEqual(rikTekstPortvakter[2].status, 'VURDERT');
  assert.strictEqual(rikTekstPortvakter[3].passert, true, 'HITL må gjenkjennes fra saksbehandlere godkjenner');
  assert.strictEqual(rikTekstPortvakter[3].status, 'SIKRET');
  assert.ok(rikTekstPortvakter.every(p => p.passert));

  // Utvidet nøkkelordgjenkjenning (prosjekteier, ledelsen, enklere løsninger, alternativer vurdert, kvalitetssikring)
  const utvidetPortvakter = validerPortvakter({
    prompt: 'Prosjektet er forankret hos prosjekteier og ledelsen. Enklere løsninger og alternativer vurdert før vi vurderer KI. Saksbehandler kvalitetssikrer alle svar manuelt.',
    timerPerUke: 30
  });
  assert.strictEqual(utvidetPortvakter[0].passert, true, 'Prosesseier må gjenkjenne prosjekteier/ledelsen');
  assert.strictEqual(utvidetPortvakter[2].passert, true, 'Ikke-KI må gjenkjenne enklere løsninger/alternativer vurdert');
  assert.strictEqual(utvidetPortvakter[3].passert, true, 'HITL må gjenkjenne saksbehandler kvalitetssikrer');

  // Eksplisitte flagg har presedens
  const eksplisittNei = validerPortvakter({
    prompt: 'Forankret hos leder',
    harProsesseier: 'nei',
    timerPerUke: 40
  });
  assert.strictEqual(eksplisittNei[0].passert, false, 'Eksplisitt nei må overstyre nøkkelord');
});

// 3. Test Student Case Evaluering og modenhetsberegning
test('Student Case Evaluering: scoring og modenhetstrinn (ekte engine.ts)', () => {
  // Komplett forslag: alle portvakter passert, fyldig prompt -> Trinn 3 (Pilotklar)
  const fullEval = evaluerStudentCase({
    prompt: 'Vi har forankret løsningen hos avdelingsleder for saksbehandling. Saksbehandler godkjenner alle utkast før sending (HITL). Vi vurderte enklere maler og standardbrev først.',
    timerPerUke: 40,
    kuttProsent: 50
  });

  assert.strictEqual(fullEval.allePortvakterPassert, true);
  assert.strictEqual(fullEval.totalscore, 100);
  assert.strictEqual(fullEval.modenhetstrinn, 3);
  assert.strictEqual(fullEval.modenhetNavn, 'Pilotklar / Smidig FoU (Trinn 3)');
  assert.strictEqual(fullEval.mvpPlan.length, 3);
  assert.strictEqual(fullEval.referanseCaser.length, 3);

  // Mangelfullt forslag: Portvakter feiler -> Trinn 1 (Idéstadium)
  const uferdigEval = evaluerStudentCase({
    prompt: 'Bruk AI til rapporter.',
    timerPerUke: 40,
    kuttProsent: 50
  });

  assert.strictEqual(uferdigEval.allePortvakterPassert, false);
  assert.ok(uferdigEval.totalscore < 75);
  assert.strictEqual(uferdigEval.modenhetstrinn, 1);
  assert.strictEqual(uferdigEval.modenhetNavn, 'Innledende Idéfase (Trinn 1)');
});

// 4. Test Datagrunnlag og filstørrelser (< 100 MB, intakt)
test('Datagrunnlag i public/data og supabase/data', () => {
  // cases_seed.csv er tracket i git og er obligatorisk
  const seedPath = path.join(appRoot, 'supabase/data/cases_seed.csv');
  assert.ok(fs.existsSync(seedPath), `Filen ${seedPath} må eksistere.`);
  const seedStats = fs.statSync(seedPath);
  const seedMb = seedStats.size / (1024 * 1024);
  assert.ok(seedMb > 0, 'cases_seed.csv kan ikke være tom.');
  assert.ok(seedMb < 100, 'cases_seed.csv overskrider 100 MB.');

  // Sjekk lokale rådatafiler dersom de er til stede (ekskludert fra git pga. 90 MB størrelse)
  const optionalLocalFiles = [
    { p: path.join(appRoot, 'public/data/cases.csv'), maxMb: 100 },
    { p: path.join(appRoot, 'public/data/cases.jsonl'), maxMb: 100 },
    { p: path.join(appRoot, 'public/data/evidenskart.csv'), maxMb: 100 },
  ];
  for (const f of optionalLocalFiles) {
    if (fs.existsSync(f.p)) {
      const stats = fs.statSync(f.p);
      const sizeMb = stats.size / (1024 * 1024);
      assert.ok(sizeMb > 0, `Filen ${f.p} kan ikke være tom.`);
      assert.ok(sizeMb < f.maxMb, `Filen ${f.p} er ${sizeMb.toFixed(2)} MB, som overskrider grensen på ${f.maxMb} MB.`);
    }
  }

  // Sjekk antall linjer og nøyaktig 18 kolonner i cases_seed.csv
  const seedContent = fs.readFileSync(path.join(appRoot, 'supabase/data/cases_seed.csv'), 'utf-8');
  const lines = seedContent.trim().split(/\r?\n/);
  assert.ok(lines.length >= 3169, `cases_seed.csv må ha minst 3 169 linjer (faktisk: ${lines.length}).`);

  const headers = lines[0].split(',');
  assert.strictEqual(headers.length, 18, `cases_seed.csv må ha nøyaktig 18 kolonner for matching mot public.cases (faktisk: ${headers.length}).`);
});

// 5. Test Datakontrakt-integritet mellom frontend, Edge Function og backend
test('Datakontrakt: Feltnavn samsvarer på tvers av frontend, Edge Function og Python-backend', () => {
  const engineTs = fs.readFileSync(path.join(appRoot, 'src/lib/engine.ts'), 'utf-8');
  const typesTs = fs.readFileSync(path.join(appRoot, 'src/lib/types.ts'), 'utf-8');
  const edgeIndexTs = fs.readFileSync(path.join(appRoot, 'supabase/functions/evaluate/index.ts'), 'utf-8');
  const serverPy = fs.readFileSync(path.join(appRoot, 'api/server.py'), 'utf-8');
  const promptMd = fs.readFileSync(path.join(appRoot, 'LOVABLE_PROMPT.md'), 'utf-8');

  // Sjekk at kanoniske nøkler finnes i alle implementasjoner
  const expectedKeys = [
    'timerFrigjortPerUke',
    'timerFrigjortPerAar',
    'aarsverkFrigjort',
    'aarligKapasitetsverdiKr',
    'gevinstkategori',
    'oppnaaddResultat',
    'allePortvakterPassert',
    'totalscore',
    'modenhetstrinn',
    'modenhetNavn',
    'mvpPlan'
  ];

  for (const key of expectedKeys) {
    assert.ok(engineTs.includes(key), `engine.ts mangler nøkkel: ${key}`);
    assert.ok(typesTs.includes(key), `types.ts mangler nøkkel: ${key}`);
    assert.ok(edgeIndexTs.includes(key), `supabase/functions/evaluate/index.ts mangler nøkkel: ${key}`);
    assert.ok(serverPy.includes(key), `api/server.py mangler nøkkel: ${key}`);
    assert.ok(promptMd.includes(key), `LOVABLE_PROMPT.md mangler nøkkel: ${key}`);
  }
});

// 6. Test Pluggbar Backend Adapter fallback
test('kobleTilBackendLLM: trygg lokal fallback når server ikke er oppe', async () => {
  const res = await kobleTilBackendLLM('Test idé for saksbehandling forankret hos leder', 40, 50);
  assert.ok(res.gevinst, 'Gevinst må returneres');
  assert.strictEqual(res.gevinst.timerFrigjortPerUke, 20);
  assert.strictEqual(res.gevinst.aarsverkFrigjort, 0.5);
  assert.strictEqual(res.status, 'lokal_deterministisk');
  assert.ok(Array.isArray(res.portvakter));
  assert.strictEqual(typeof res.allePortvakterPassert, 'boolean');
  assert.strictEqual(typeof res.totalscore, 'number');
  assert.strictEqual(typeof res.modenhetstrinn, 'number');
  assert.ok(typeof res.modenhetNavn === 'string' && res.modenhetNavn.length > 0);
  assert.ok(Array.isArray(res.mvpPlan) && res.mvpPlan.length > 0);
  assert.ok(res.referanseCaser && res.referanseCaser.length > 0);
});
