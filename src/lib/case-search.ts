// case-search.ts - Deterministisk søk og domenematching over erfaringsbasen (3 168 case)
// Bygget etter codebase-design (dyp modul, lite grensesnitt) og determ (0 tokens)
import type { ReferanseCase } from './types';

export interface DomeneDefinisjon {
  id: string;
  navn: string;
  ord: RegExp;
  enheter: string;
  maaling: string;
}

export const DOMENER: DomeneDefinisjon[] = [
  {
    id: 'produksjon',
    navn: 'industri og produksjon',
    ord: /produksjon|kvalitetskontroll|kvalitetsavvik|produksjonslinje|operatør|kassasjon|fabrikk|bildegjenkjenning|etterarbeid/i,
    enheter: '10 enheter fra linjen',
    maaling: 'kvalitetsavvik og etterarbeid'
  },
  {
    id: 'vedlikehold',
    navn: 'drift og vedlikehold',
    ord: /vedlikehold|nedetid|maskinpark|sensordata|sensorovervåking|prediktiv|driftsstans/i,
    enheter: '10 driftshendelser',
    maaling: 'nedetid og planlagt vedlikehold'
  },
  {
    id: 'byggesak',
    navn: 'byggesak og plan',
    ord: /byggesak|byggesøknad|reguler|plan- og bygg|dispensasjon/i,
    enheter: '5 byggesøknader',
    maaling: 'behandlingstid og faglig kvalitet'
  },
  {
    id: 'helse',
    navn: 'helse og omsorg',
    ord: /helse|pasient|sykehus|omsorg|journal|lege|epikrise/i,
    enheter: '5 journalnotater',
    maaling: 'tidsbruk og faglig kvalitet'
  },
  {
    id: 'skole',
    navn: 'skole og utdanning',
    ord: /skole|elev|lærer|undervisning|student|barnehage/i,
    enheter: '5 elevsaker',
    maaling: 'tidsbruk og kvalitet'
  },
  {
    id: 'velferd',
    navn: 'velferd og ytelsesforvaltning',
    ord: /nav|sosialhjelp|stønad|ytelse|dagpenger|bruker/i,
    enheter: '5 stønadssaker',
    maaling: 'behandlingstid og vedtakskvalitet'
  },
  {
    id: 'kundeservice',
    navn: 'kunde- og innbyggerservice',
    ord: /kunde|innbygger|henvendelse|kundesenter|servicetorg|chat|e-post/i,
    enheter: '5 henvendelser',
    maaling: 'svartid og svar-kvalitet'
  },
  {
    id: 'okonomi',
    navn: 'økonomi og innkjøp',
    ord: /faktura|økonomi|regnskap|innkjøp|anskaffelse|budsjett|bilag/i,
    enheter: '5 bilag',
    maaling: 'behandlingstid og feilrate'
  }
];

const STANDARD_DOMENE: DomeneDefinisjon = {
  id: 'generell',
  navn: 'arbeidsprosessen',
  ord: /$^/,
  enheter: '5 representative saker',
  maaling: 'tidsbruk og kvalitet'
};

/**
 * Finner best matchende domene basert på regex-treff
 */
export function finnDomene(tekst: string): DomeneDefinisjon {
  if (!tekst || typeof tekst !== 'string') return STANDARD_DOMENE;
  let best = STANDARD_DOMENE;
  let flestTreff = 0;

  for (const domene of DOMENER) {
    const matches = tekst.match(new RegExp(domene.ord.source, 'gi'));
    const antall = matches ? matches.length : 0;
    if (antall > flestTreff) {
      best = domene;
      flestTreff = antall;
    }
  }

  return best;
}

/**
 * Teller antall relevante treff i caselisten
 */
export function tellTreff(tekst: string, caser: ReferanseCase[]): number {
  if (!tekst || !Array.isArray(caser) || caser.length === 0) return 0;
  const domene = finnDomene(tekst);
  if (domene.id === 'generell') return 0;

  return caser.filter((c) => {
    const samlet = `${c.organisasjon || ''} ${c.tittel || ''} ${c.bransje || ''} ${c.oppnaaddResultat || ''}`.toLowerCase();
    return domene.ord.test(samlet);
  }).length;
}

/**
 * Rangerer og returnerer de N mest relevante casene
 */
export function rangerCaser(
  tekst: string,
  caser: ReferanseCase[],
  maksAntall: number = 3
): ReferanseCase[] {
  if (!Array.isArray(caser) || caser.length === 0) return [];
  if (!tekst || typeof tekst !== 'string') return caser.slice(0, maksAntall);

  const ordListe = new Set(
    tekst
      .toLowerCase()
      .split(/[^a-zæøå0-9]+/)
      .filter((w) => w.length > 4)
  );
  const domene = finnDomene(tekst);

  const scoreCase = (c: ReferanseCase): number => {
    const innhold = `${c.organisasjon || ''} ${c.tittel || ''} ${c.bransje || ''} ${c.oppnaaddResultat || ''}`.toLowerCase();
    let score = domene.ord.test(innhold) ? 5 : 0;
    for (const ord of ordListe) {
      if (innhold.includes(ord)) score += 1;
    }
    return score;
  };

  return [...caser]
    .sort((a, b) => scoreCase(b) - scoreCase(a))
    .slice(0, maksAntall);
}
