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
