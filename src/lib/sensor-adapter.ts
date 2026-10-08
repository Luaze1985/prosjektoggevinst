// sensor-adapter.ts - Seam og Adapter for OpenAI gpt-4o-mini og lokal fallback
// Designet etter codebase-design (dyp modul, lite grensesnitt) og instruks-for-agenter
import { finnDomene } from './case-search';
import type { HandoffPakke, ReferanseCase, SensorInput, SensorResultat } from './types';

export class SensorAdapterFeil extends Error {}

export interface HttpClientResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<any>;
}

export type HttpPoster = (
  url: string,
  options: { method: string; headers: Record<string, string>; body: string }
) => Promise<HttpClientResponse>;

export const FORBUDTE_ORD = ['spennende', 'innovativ', 'robust', 'revolusjonerende', 'synergier', 'optimalisere', 'potensial'];

export const SENSOR_SYSTEM_PROMPT = `Rolle: Du er en nådeløs, jordnær innovasjonsrevisor for industri, næringsliv og offentlige etater. 
Tone: Nøktern, direkte, handlingsorientert på norsk bokmål.
Forbudte ord: ${FORBUDTE_ORD.map(w => `"${w}"`).join(', ')}.

Ufravikelige regler:
1. Sjekklistesvarene (ja / vet_ikke / nei) er EVIDENSBASERT FASIT og kan aldri overprøves.
2. Hvis prosesseier eller baseline mangler (nei/vet_ikke), er prosjektet automatisk BLOKKERT for videre koding.
3. Ingen innledninger, ingen høflighetsfraser, ingen rådgiver-floskler.
4. "testoppsett" MÅ inneholde en tallfestet stoppregel (f.eks. "Stopp hvis tidsbruk > dagens nivå, eller feilrate > 2 %").
5. Alle genererte kulepunkter skal være på MAKS én setning.
6. Svar KUN i gyldig JSON etter skjemaet.`;

export const SENSOR_JSON_SCHEMA = {
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

/**
 * Defensiv JSON-parser som vasker vekk Markdown-fences og unødvendig whitespace
 */
export function rensOgParseJson(raw: string): any {
  if (!raw || typeof raw !== 'string') {
    throw new SensorAdapterFeil('Mottok tomt svar fra modelltjenesten.');
  }

  // 1. Strip markdown fences som ```json ... ``` eller ``` ... ```
  let renset = raw.trim();
  if (renset.startsWith('```')) {
    renset = renset.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // 2. Parse JSON
  try {
    const parsed = JSON.parse(renset);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Ikke et JSON-objekt');
    }
    return parsed;
  } catch (err: any) {
    throw new SensorAdapterFeil(`Ugyldig JSON fra modelltjenesten: ${err.message}`);
  }
}

/**
 * Bygger brukermeldingen til OpenAI med strukturert kontekst
 */
export function byggBrukerMelding(input: SensorInput): string {
  const domene = finnDomene(`${input.dagensSituasjon} ${input.foreslaattLosning} ${input.eierSektorEffekt}`);
  return JSON.stringify({
    domene: domene.navn,
    dagensSituasjon: input.dagensSituasjon,
    foreslaattLosning: input.foreslaattLosning,
    eierSektorEffekt: input.eierSektorEffekt,
    svar: input.svar || {},
    referanseCaser: (input.caser || []).slice(0, 3).map((c) => ({
      tittel: c.tittel,
      organisasjon: c.organisasjon,
      resultat: c.oppnaaddResultat
    }))
  });
}

/**
 * Lokal deterministisk fallback (0 tokens, 100 % oppetid)
 */
export function lokalSensorFallback(input: SensorInput, fallbackGrunn?: string): SensorResultat {
  const domene = finnDomene(`${input.dagensSituasjon} ${input.foreslaattLosning} ${input.eierSektorEffekt}`);
  const svar = input.svar || {};

  const jaSvar: string[] = [];
  const gapSvar: string[] = [];

  if (svar.eier === 'ja') jaSvar.push('Prosesseier er forankret med mandat i linjen.');
  else gapSvar.push('Prosesseier mangler eller er uavklart i linjen.');

  if (svar.baseline === 'ja') jaSvar.push('Dagens situasjon er tallfestet og danner en målbar baseline.');
  else gapSvar.push('Nullalternativ mangler: dagens tidsbruk eller feilrate er ikke målt.');

  if (svar.ikkeKi === 'ja') jaSvar.push('Enklere digitale eller regelbaserte tiltak er vurdert før KI.');
  else if (svar.ikkeKi === 'nei' || svar.ikkeKi === 'vet_ikke') gapSvar.push('Enklere tiltak som sjekklister eller rutineendring må testes før KI.');

  if (svar.kontroll === 'ja') jaSvar.push('Menneskelig kontroll (HITL) er sikret før beslutninger fattes.');
  else if (svar.kontroll === 'nei' || svar.kontroll === 'vet_ikke') gapSvar.push('Fagperson må ha formell overprøving av modellens forslag.');

  if (svar.juss === 'vet_ikke' || svar.juss === 'nei') {
    gapSvar.push('Personvern (GDPR) og sikkerhet må avklares før reelle data benyttes.');
  }

  // Sikre 2-3 kuler
  if (jaSvar.length < 2) jaSvar.push(`Idéen innen ${domene.navn} har et definert problemområde.`);
  if (gapSvar.length < 2) gapSvar.push('Gjennomfør en formell forankringssamtale med prosesseier.');

  const styrker = jaSvar.slice(0, 3);
  const gap = gapSvar.slice(0, 3);

  const konklusjon = (svar.eier === 'ja' && svar.baseline === 'ja')
    ? `Gjennomfør en 14 dagers manuell pilot på ${domene.enheter}, men lukk de åpne gapene før koding starter.`
    : `Stopp videre utvikling inntil prosesseier og en målt baseline for ${domene.maaling} er på plass.`;

  const testoppsett = [
    `Omfang: Simuler løsningen manuelt på ${domene.enheter} uten å skrive kode.`,
    `Måling: Mål faktisk tidsbruk og avvik mot dagens etablerte baseline.`,
    `Stoppregel: Avbryt piloten hvis manuell tidsbruk overstiger dagens nivå eller feilraten øker.`
  ];

  return {
    kilde: 'lokal',
    domene: domene.navn,
    konklusjon,
    styrker,
    gap,
    testoppsett,
    ...(fallbackGrunn ? { fallbackGrunn } : {})
  };
}

/**
 * Hovedadapter for sensor-evaluering.
 * Aksepterer valgfri mock HttpClient for testbarhet (codebase-design).
 */
export async function evaluerSensor(params: {
  input: SensorInput;
  apiKey?: string;
  httpPoster?: HttpPoster;
}): Promise<SensorResultat> {
  const { input, apiKey, httpPoster } = params;

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return lokalSensorFallback(input, 'Ingen OpenAI API-nøkkel konfigurert.');
  }

  const poster: HttpPoster = httpPoster || (async (url, opts) => {
    const res = await fetch(url, opts);
    return {
      ok: res.ok,
      status: res.status,
      text: () => res.text(),
      json: () => res.json()
    };
  });

  try {
    const brukerJson = byggBrukerMelding(input);
    const res = await poster('https://api.openai.com/v1/chat/completions', {
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
          { role: 'user', content: brukerJson }
        ]
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const feilmelding = res.status === 401
        ? 'Ugyldig API-nøkkel (401)'
        : res.status === 429
        ? 'Kapasitetsbegrensning hos OpenAI (429 Rate Limit)'
        : `OpenAI feil (${res.status}): ${errText}`;
      return lokalSensorFallback(input, feilmelding);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    const parsed = rensOgParseJson(content);

    // Valider felter
    if (!parsed.konklusjon || !Array.isArray(parsed.styrker) || !Array.isArray(parsed.gap) || !Array.isArray(parsed.testoppsett)) {
      return lokalSensorFallback(input, 'Ufullstendig datastruktur fra OpenAI.');
    }

    const domene = finnDomene(`${input.dagensSituasjon} ${input.foreslaattLosning} ${input.eierSektorEffekt}`);

    return {
      kilde: 'openai',
      domene: domene.navn,
      konklusjon: parsed.konklusjon,
      styrker: parsed.styrker,
      gap: parsed.gap,
      testoppsett: parsed.testoppsett
    };
  } catch (err: any) {
    return lokalSensorFallback(input, `Nettverks- eller parsefeil: ${err.message}`);
  }
}

/**
 * Genererer en Markdown-rigget Handoff-prompt klar for ChatGPT/Claude
 */
export function lagKiPrompt(pakke: HandoffPakke): string {
  const { input, svar, dom, sensor } = pakke;

  return `# SYSTEMINSTRUKS: OPERATIV OPPFØLGING AV INNOVASJONS- OG KI-CASE

Du skal fungere som en senior teknisk prosjektleder og gevinstrealiseringsansvarlig.
Under finner du et ferdig screenet case med deterministiske fakta og sensordom.

## 1. DATA FRA SCREENINGEN
- Dagens situasjon: ${input.dagensSituasjon}
- Foreslått løsning: ${input.foreslaattLosning}
- Eier og effekt: ${input.eierSektorEffekt}
${pakke.gevinst ? `- DFØ-gevinst: ${pakke.gevinst.timerFrigjortPerUke} t/uke (${pakke.gevinst.aarsverkFrigjort} årsverk, ${pakke.gevinst.aarligKapasitetsverdiKr.toLocaleString('no-NO')} kr/år)` : ''}

## 2. FAGLIG STATUS (PORTVAKTER FRA SJEKKLISTE)
- Prosesseier i linjen: ${svar.eier || 'uavklart'}
- Nullalternativ (baseline målt): ${svar.baseline || 'uavklart'}
- Ikke-KI vurdert først: ${svar.ikkeKi || 'uavklart'}
- Datatilgang og kvalitet: ${svar.data || 'uavklart'}
- Menneskelig kontroll (HITL): ${svar.kontroll || 'uavklart'}
- Juridisk og personvern: ${svar.juss || 'uavklart'}
- Testbar hypotese (MVP 0): ${svar.test || 'uavklart'}
Resultat: ${dom.antallJa} av 7 avklart – ${dom.tittel}${pakke.modenhet ? ` | Modenhet: ${pakke.modenhet.navn} (${pakke.modenhet.score}/100 poeng)` : ''}

## 3. SENSORENS KONKLUSJON & GAP
- Konklusjon: ${sensor.konklusjon}
- Hovedstyrker:
${sensor.styrker.map(s => `  • ${s}`).join('\n')}
- Kritiske gap og fallgruver:
${sensor.gap.map(g => `  • ${g}`).join('\n')}
- Testoppsett og stoppregel:
${sensor.testoppsett.map(t => `  • ${t}`).join('\n')}

## 4. DITT OPPDRAG (LEVER DISSE 3 ARTEFAKTENE NÅ)
Ikke gi generelle råd. Produser nøyaktig disse tre konkrete arbeidsdokumentene:

### ARTEFAKT 1: Testprotokoll for 1-ukes manuell pilot (Tabell)
Sett opp en tabell for 5–10 testsaker med kolonner: [Sak # | Dagens manuelle metode (tid/feil) | Simulert løsning | Avvik | Menneskelig godkjenning (Ja/Nei)].

### ARTEFAKT 2: Handlingsplan for å lukke de åpne gapene
For hvert punkt som sto som "Nei" eller "Vet ikke" over: Gi en liste med nøyaktig hvem i organisasjonen som må kontaktes, hva som må etterspørres, og hva som er akseptabel dokumentasjon.

### ARTEFAKT 3: 150-ords beslutningsnotat til prosesseier
Et ultra-konsist notat klart til å sendes på e-post til linjelederen for å be om godkjenning av 1-ukes-piloten. Inkluder formål, tidsbruk, null kroner i lisenskostnader og den definerte stoppregelen.`;
}
