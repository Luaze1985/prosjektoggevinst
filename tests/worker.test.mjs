import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../proxy/worker.js';

const input = {
  dagensSituasjon: 'Leger bruker 40 timer ukentlig på pasientjournaler og epikriser.',
  foreslaattLosning: 'Utkast til epikriser med legekontroll.',
  eierSektorEffekt: 'Avdelingsleder eier arbeidet.',
  timerPerUke: 40, kuttProsent: 25,
  svar: { eier: 'ja', baseline: 'ja', ikkeKi: 'ja', data: 'ja', kontroll: 'ja', juss: 'ja', test: 'ja' },
  caser: [{ caseId: 'FALSKE-TALL', tittel: 'Uverifisert', oppnaaddResultat: '99% innsparing' }]
};

test('Worker søker betrodd casebank og sender kilder og anslag til modellen', async () => {
  const originalFetch = globalThis.fetch;
  let context;
  globalThis.fetch = async (_url, opts) => {
    const request = JSON.parse(opts.body);
    context = JSON.parse(request.messages[1].content);
    const refs = context.referanseCaser || [];
    return Response.json({ choices: [{ message: { content: JSON.stringify({
      konklusjon: 'Test manuelt først.', styrker: ['Legekontroll'], gap: ['Mål kvalitet'],
      testoppsett: ['Test 5 saker', 'Mål tid', 'Stopp ved flere feil'],
      evidens: refs.map(c => ({ caseId: c.caseId, relevans: 'Lignende journalprosess', begrensning: 'Lokal tidsgevinst må måles' }))
    }) } }] });
  };
  try {
    const response = await worker.fetch(new Request('https://worker.test', {
      method: 'POST', body: JSON.stringify(input), headers: { 'cf-connecting-ip': 'test-1' }
    }), { OPENAI_API_KEY: 'test-only' });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(context.anslag.timerPerUke, 40);
    assert.equal(context.anslag.kuttProsent, 25);
    assert.ok(context.referanseCaser.length > 0);
    assert.ok(context.referanseCaser.every(c => c.caseId !== 'FALSKE-TALL' && c.kildeUrl));
    assert.equal(result.datagrunnlag.kilde, 'lokal_casebank');
    assert.ok(result.datagrunnlag.antallCaser > 300);
    assert.ok(result.evidens[0].kildeUrl);
  } finally { globalThis.fetch = originalFetch; }
});

test('Worker kjører to sekvensielle LLM-kall (Revisor -> Arkitekt)', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, opts) => {
    const request = JSON.parse(opts.body);
    calls.push(request);
    if (calls.length === 1) {
      // Kall 1: Revisor
      return Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              dom: 'klar_for_pilot',
              begrunnelse: 'God forankring hos avdelingsleder.',
              styrker: ['Forankret i linjen', 'HITL sikret'],
              gap: ['Baseline må måles mer presist'],
              evidens: [{
                caseId: 'ATRS-OFF-001',
                relevans: 'Lignende journalprosess i helse/omsorg',
                begrensning: 'Lokal tidsgevinst må dokumenteres i egen pilot'
              }]
            })
          }
        }]
      });
    } else {
      // Kall 2: Arkitekt
      return Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              hovedkonklusjon: 'Gjennomfør en 14-dagers manuell pilot på 10 journalnotater.',
              testoppsett: [
                'Omfang: Simuler løsningen manuelt på 10 journalnotater.',
                'Måling: Mål tidsbruk og avvik mot dagens etablerte baseline.',
                'Stoppregel: Avbryt hvis feilraten øker eller manuell tidsbruk overstiger dagens nivå.'
              ]
            })
          }
        }]
      });
    }
  };

  try {
    const response = await worker.fetch(new Request('https://worker.test', {
      method: 'POST', body: JSON.stringify(input), headers: { 'cf-connecting-ip': 'test-dual' }
    }), { OPENAI_API_KEY: 'test-only' });

    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(calls.length, 2, 'Forventer nøyaktig to LLM-kall (Revisor og Arkitekt)');
    assert.equal(result.steg, 2, 'Resultat må bekrefte at 2-stegs revisjon er fullført');
    assert.equal(result.styrker.length, 2);
    assert.equal(result.testoppsett.length, 3);
    assert.ok(result.konklusjon.includes('14-dagers'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

