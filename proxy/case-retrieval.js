import casebank from '../public/data/case-index.json' with { type: 'json' };

const stopwords = new Set('dette denne disse deres dere skal kan med for som fra har ved eller etter før bruker bruke ønsker timer tiden uke ikke'.split(' '));
const concepts = [
  [/pasient|journal|epikrise|sykehus|lege|helse/i, /patient|clinical|health|medical|care|hospital|record/i],
  [/byggesak|byggesøknad|reguler|dispensasjon/i, /planning|building|permit|construction/i],
  [/faktura|regnskap|bilag|økonomi/i, /invoice|accounting|finance|payment/i],
  [/produksjon|kvalitetsavvik|fabrikk|bildegjenkjenning/i, /manufactur|inspection|factory|quality|vision/i],
  [/vedlikehold|nedetid|driftsstans/i, /maintenance|downtime|predictive/i],
  [/skole|elev|undervisning|lærer/i, /education|school|student|teacher/i],
  [/kunde|henvendelse|innbygger/i, /customer|citizen|enquir|support/i]
];

export function searchCases(query, cases = casebank) {
  const words = [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length > 3 && !stopwords.has(w)))];
  const matchingConcepts = concepts.filter(([no]) => no.test(query));
  return cases.map(c => {
    const text = `${c.tittel} ${c.organisasjon} ${c.bransje} ${c.problem} ${c.resultat} ${c.alternativer}`.toLowerCase();
    const score = words.filter(w => text.includes(w)).length + matchingConcepts.filter(([, en]) => en.test(text)).length * 4;
    return { c, score };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.c.caseId.localeCompare(b.c.caseId))
    .slice(0, 3).map(({ c }) => c);
}

export async function retrieveCases(query, env) {
  let warning;
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/search_cases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
        body: JSON.stringify({ query_text: query, limit_count: 3 }), signal: AbortSignal.timeout(6000)
      });
      if (!response.ok) throw new Error('Databasesøk feilet.');
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('Ugyldig søkeresultat.');
      if (rows.length) return {
        cases: rows.map(c => ({ caseId: c.case_id, tittel: c.prosjektnavn, organisasjon: c.organisasjon,
          resultat: c.maalt_resultat || '', evidens: c.evidensstyrke, kilde: c.kilde, kildeUrl: c.kilde_url,
          mangler: 'Databasesøket returnerer ikke alle dokumentasjonsgap.' })),
        status: { kilde: 'supabase', antallTreff: rows.length }
      };
      warning = 'Databasesøket ga ingen treff; lokal casebank er brukt.';
    } catch { warning = 'Databasesøket er utilgjengelig; lokal casebank er brukt.'; }
  }
  const cases = searchCases(query);
  return { cases, status: { kilde: 'lokal_casebank', antallCaser: casebank.length, antallTreff: cases.length,
    ...(warning ? { merknad: warning } : {}) } };
}
