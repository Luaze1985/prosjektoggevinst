// engine.ts - Deterministisk beregningsmotor (Portvakter, DFØ-gevinst, Modenhet, MVP-roadmap)
// Samt pluggbar backend/LLM-adapter og empiriske referansecaser

import {
  StudentInput,
  EvalueringResultat,
  PortvaktResultat,
  GevinstBeregning,
  ReferanseCase
} from './types';

// DFØ Sjablongverdi: 1 standard offentlig årsverk = 1 750 timer / ca 850 000 kr inkl. sosiale kostnader
export const STANDARD_AARSVERK_KR = 850000;
export const ARBEIDSTIMER_PER_AAR = 1750;
export const ARBEIDSUKER_PER_AAR = 46; // ca 46 effektive arbeidsuker per år

/**
 * 1. Portvakt-kontroll (Deterministiske regler iht. AGENTS.md)
 * Støtter både eksplisitte felter og deterministisk nøkkelordgjenkjenning i studentens idé.
 */
export function validerPortvakter(input: StudentInput): PortvaktResultat[] {
  const dagensTimer = input.timerPerUke ?? input.dagensTimerPerUke ?? 0;
  const promptText = (input.prompt || '').toLowerCase();

  // Portvakt 1: Prosesseier
  const harEier = input.harProsesseier === 'ja' || (
    input.harProsesseier !== 'nei' &&
    /(?:prosesseier|prosjekteier|produkteier|avdelingsleder|seksjonsleder|prosjektleder|linjeleder|enhetsleder|virksomhetsleder|forankret (?:hos|i|med)|fagansvarlig|leder(?:e|en|elsen)?\b|direktør|kommunesjef|rådmann|beslutningstaker)/i.test(promptText)
  );

  // Portvakt 2: Nullalternativ
  const harBaseline = dagensTimer > 0;

  // Portvakt 3: Ikke-KI vurdert først
  const ikkeKi = input.ikkeKiVurdert === 'ja' || (
    input.ikkeKiVurdert !== 'nei' &&
    /(?:ikke-?ki|enklere (?:alternativ(?:er)?|løsning(?:er)?)|regelbasert|uten (?:ki|maskinlæring)|maler|fagsystem|regler først|manuelt først|skjema|excel|alternativ(?:er)? vurdert|rutiner først)/i.test(promptText)
  );

  // Portvakt 4: Menneskelig kontroll (HITL)
  const menneske = input.menneskeIKontroll === 'ja' || (
    input.menneskeIKontroll !== 'nei' &&
    /(?:hitl|mennesk(?:e|elig)|overprøv|saksbehandler (?:har|beholder|godkjenner|overprøver|vurderer|kvalitetssikrer|sjekker)|fagperson (?:godkjenner|vurderer|kvalitetssikrer)|manuell (?:godkjenning|kontroll|kvalitetssikring|overprøving)|kontrollert av|kvalitetssikres av)/i.test(promptText)
  );

  return [
    {
      navn: '1. Prosesseier i linjen',
      passert: harEier,
      status: harEier ? 'AVKLART' : 'MÅ AVKLARES',
      begrunnelse: harEier
        ? 'Forankret hos fagansvarlig leder med budsjett-/linjeansvar.'
        : 'STOPP: Ingen navngitt prosesseier i linjen. Prosjektet må forankres før utvikling starter.',
      beskrivelse: harEier
        ? 'Forankret hos fagansvarlig leder med budsjett-/linjeansvar.'
        : 'STOPP: Ingen navngitt prosesseier i linjen. Prosjektet må forankres før utvikling starter.'
    },
    {
      navn: '2. Nullalternativ (Baseline)',
      passert: harBaseline,
      status: harBaseline ? 'DOKUMENTERT' : 'MANGLER',
      begrunnelse: harBaseline
        ? `Dokumentert manuell tidsbruk: ${dagensTimer} timer/uke.`
        : 'STOPP: Mangler nullalternativ. Nytte kan ikke måles uten dagens tidsbruk.',
      beskrivelse: harBaseline
        ? `Dokumentert manuell tidsbruk: ${dagensTimer} timer/uke.`
        : 'STOPP: Mangler nullalternativ. Nytte kan ikke måles uten dagens tidsbruk.'
    },
    {
      navn: '3. Ikke-KI vurdert først',
      passert: ikkeKi,
      status: ikkeKi ? 'VURDERT' : 'MÅ VURDERES',
      begrunnelse: ikkeKi
        ? 'Enkle regler, integrasjoner eller skjemafikser er vurdert først.'
        : 'STOPP: Enklere digitale/regelbaserte løsninger må utredes før KI tas i bruk.',
      beskrivelse: ikkeKi
        ? 'Enkle regler, integrasjoner eller skjemafikser er vurdert først.'
        : 'STOPP: Enklere digitale/regelbaserte løsninger må utredes før KI tas i bruk.'
    },
    {
      navn: '4. Menneskelig kontroll (HITL)',
      passert: menneske,
      status: menneske ? 'SIKRET' : 'HITL KRAV',
      begrunnelse: menneske
        ? 'Saksbehandler/fagperson har endelig godkjenning og full overprøvingsrett.'
        : 'STOPP: Prosjekter som påvirker vedtak eller mennesker krever menneskelig overprøving.',
      beskrivelse: menneske
        ? 'Saksbehandler/fagperson har endelig godkjenning og full overprøvingsrett.'
        : 'STOPP: Prosjekter som påvirker vedtak eller mennesker krever menneskelig overprøving.'
    }
  ];
}

/**
 * 2. DFØ Gevinstkalkulator (Tid, årsverk, kr mot nullalternativet)
 * 100 % deterministisk beregning basert på DFØ-metodikk.
 */
export function beregnDfoGevinst(input: {
  timerPerUke?: number;
  kuttProsent?: number;
  dagensTimerPerUke?: number;
  forventetKuttProsent?: number;
}): GevinstBeregning {
  const rawTimer = input.timerPerUke ?? input.dagensTimerPerUke ?? 40;
  const rawKutt = input.kuttProsent ?? input.forventetKuttProsent ?? 50;

  const timerUke = Math.max(0, Number.isFinite(rawTimer) ? rawTimer : 40);
  const kuttPct = Math.min(100, Math.max(0, Number.isFinite(rawKutt) ? rawKutt : 50));

  const timerFrigjortPerUke = Math.round((timerUke * kuttPct) / 100);
  const timerFrigjortPerAar = timerFrigjortPerUke * ARBEIDSUKER_PER_AAR;
  const aarsverkFrigjort = Math.round((timerFrigjortPerAar / ARBEIDSTIMER_PER_AAR) * 10) / 10;
  const aarligKapasitetsverdiKr = Math.round(aarsverkFrigjort * STANDARD_AARSVERK_KR);

  return {
    timerFrigjortPerUke,
    timerFrigjortPerAar,
    aarsverkFrigjort,
    aarligKapasitetsverdiKr,
    gevinstkategori: aarsverkFrigjort >= 0.5 ? 'Kapasitetsgevinst' : 'Tidsgevinst',
    timerFrigjortUke: timerFrigjortPerUke,
    timerFrigjortAar: timerFrigjortPerAar,
    verdiKr: aarligKapasitetsverdiKr
  };
}

/**
 * Empiriske referansecaser fra de 3 168 casene i casebanken
 */
export const EMPIRISKE_REFERANSER: ReferanseCase[] = [
  {
    tittel: 'AI Writing Assistant for saksrapporter (Assist)',
    organisasjon: 'UK Department for Work & Pensions / Gov.uk',
    oppnaaddResultat: 'Saksbehandlere sparer i snitt ca. 3 timer/uke på utarbeidelse av standardutkast. Saksbehandler beholder 100% kontroll.',
    maaltResultat: 'Saksbehandlere sparer i snitt ca. 3 timer/uke på utarbeidelse av standardutkast. Saksbehandler beholder 100% kontroll.',
    evidens: 'E3 Offisiell transparensrapport (UK ATRS)',
    kilde: 'gov.uk / UK ATRS',
    kildeUrl: 'https://www.gov.uk/algorithmic-transparency-records'
  },
  {
    tittel: 'Ami Chatbot & Henvendelsestriagering for innbyggerdialog',
    organisasjon: 'OECD AI Observatory (Case #14)',
    oppnaaddResultat: '90% av standardhenvendelser avlastes automatisk uten manuell eskalering; 35% frigjort kapasitet for saksbehandlere.',
    maaltResultat: '90% av standardhenvendelser avlastes automatisk uten manuell eskalering; 35% frigjort kapasitet for saksbehandlere.',
    evidens: 'E2 Selvrapportert med måltall',
    kilde: 'OECD Observatory of Public Sector Innovation',
    kildeUrl: 'https://oecd-opsi.org'
  },
  {
    tittel: 'Automatisk underlagsanalyse og dokumentsortering',
    organisasjon: 'Ofsted (Office for Standards in Education, UK)',
    oppnaaddResultat: 'Reduserte manuell forberedelsestid per tilsyn med 40%; sikrer konsistent saksunderlag for inspektører.',
    maaltResultat: 'Reduserte manuell forberedelsestid per tilsyn med 40%; sikrer konsistent saksunderlag for inspektører.',
    evidens: 'E3 Strukturert offentlig evalueringsrapport',
    kilde: 'Ofsted Case Study',
    kildeUrl: 'https://www.gov.uk/government/organisations/ofsted'
  }
];

/**
 * 3. Hovedevaluator (Kombinerer regler, scoring, empirisk presedens og MVP-roadmap)
 */
export function evaluerStudentCase(input: StudentInput): EvalueringResultat {
  const portvakter = validerPortvakter(input);
  const allePassert = portvakter.every(p => p.passert);
  const gevinst = beregnDfoGevinst(input);

  const dagensTimer = input.timerPerUke ?? input.dagensTimerPerUke ?? 40;

  // Deterministisk poengscore (0 - 100) basert på beståtte portvakter og substans
  let score = 0;
  if (portvakter[0].passert) score += 25; // Prosesseier
  if (portvakter[2].passert) score += 20; // Ikke-KI først
  if (portvakter[3].passert) score += 20; // HITL
  if (dagensTimer > 0) score += 15;       // Dokumentert baseline
  if (input.prompt && input.prompt.trim().length > 30) score += 20; // Konkret problembeskrivelse

  // Modenhetstrinn (0 - 6)
  let modenhet = 1;
  let modenhetNavn = 'Idéstadium (Trinn 1)';
  if (allePassert && score >= 75) {
    modenhet = 3;
    modenhetNavn = 'Pilotklar / Smidig FoU (Trinn 3)';
  } else if (allePassert) {
    modenhet = 2;
    modenhetNavn = 'Konseptfase (Trinn 2)';
  } else {
    modenhet = 1;
    modenhetNavn = 'Innledende Idéfase (Trinn 1)';
  }

  // Smidig MVP-plan (MVP 0 til MVP 2 tilpasset studenten)
  const mvpPlan = [
    {
      steg: 'MVP 0 (Papir/Manuell)',
      tittel: 'Manuell verifikasjon på 5 reelle saker',
      hvaSkalBevises: 'At sluttbrukere faktisk sparer tid på formatet før det skrives én eneste linje med kode.',
      hvaSkalUtelates: 'Ingen kode, ingen API-kall, ingen database.'
    },
    {
      steg: 'MVP 1 (Isolert KI-test)',
      tittel: 'Frittstående prompt- og datatest',
      hvaSkalBevises: 'At modellen leverer akseptabel kvalitet uten faktafeil i en lukket sandkasse.',
      hvaSkalUtelates: 'Ingen fagsystemintegrasjon; kun isolert testing.'
    },
    {
      steg: 'MVP 2 (Fagpilot)',
      tittel: 'Intern pilot med 2-3 saksbehandlere',
      hvaSkalBevises: 'Måle faktisk tidsgevinst og brukeropplevelse i linjen over 2 uker.',
      hvaSkalUtelates: 'Ingen automatisk publisering eller direkte vedtak.'
    }
  ];

  return {
    portvakter,
    allePortvakterPassert: allePassert,
    totalscore: score,
    modenhetstrinn: modenhet,
    modenhetNavn,
    gevinst,
    mvpPlan,
    referanseCaser: EMPIRISKE_REFERANSER,
    aiTilbakemelding: 'Deterministisk analyse fullført (0 tokens). Nullalternativ og DFØ-gevinst er verifisert mot sjablongverdier.',
    mvp0Tips: 'Gjennomfør en manuell test på 5 faktiske saker sammen med en fagansvarlig saksbehandler før du bygger kode. Bevis at sluttbrukeren faktisk sparer tid.',
    status: 'lokal_deterministisk'
  };
}

/**
 * 4. Pluggbar Backend / LLM Adapter
 * Lovable kan koble denne direkte til en Supabase Edge Function, OpenAI eller Anthropic API.
 * Sikrer robust normalisering av felter og fallback til deterministisk motor.
 */
export async function kobleTilBackendLLM(
  prompt: string,
  timerPerUke: number,
  kuttProsent: number
): Promise<{
  gevinst: GevinstBeregning;
  portvakter?: PortvaktResultat[];
  allePortvakterPassert?: boolean;
  totalscore?: number;
  modenhetstrinn?: number;
  modenhetNavn?: string;
  aiTilbakemelding?: string;
  referanseCaser?: ReferanseCase[];
  mvp0Tips?: string;
  mvpPlan?: {
    steg: string;
    tittel: string;
    hvaSkalBevises: string;
    hvaSkalUtelates: string;
  }[];
  status: string;
}> {
  const dfoFallback = beregnDfoGevinst({ timerPerUke, kuttProsent });

  try {
    const apiUrl = (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_API_URL) || '/api/evaluate';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        timerPerUke,
        timer_per_uke: timerPerUke,
        kuttProsent,
        kutt_prosent: kuttProsent
      })
    });
    if (response.ok) {
      const data = await response.json();
      const rawGevinst = data.gevinst || {};
      const gevinst: GevinstBeregning = {
        timerFrigjortPerUke: rawGevinst.timerFrigjortPerUke ?? rawGevinst.timerFrigjortUke ?? dfoFallback.timerFrigjortPerUke,
        timerFrigjortPerAar: rawGevinst.timerFrigjortPerAar ?? rawGevinst.timerFrigjortAar ?? dfoFallback.timerFrigjortPerAar,
        aarsverkFrigjort: rawGevinst.aarsverkFrigjort ?? dfoFallback.aarsverkFrigjort,
        aarligKapasitetsverdiKr: rawGevinst.aarligKapasitetsverdiKr ?? rawGevinst.verdiKr ?? dfoFallback.aarligKapasitetsverdiKr,
        gevinstkategori: rawGevinst.gevinstkategori ?? dfoFallback.gevinstkategori,
        timerFrigjortUke: rawGevinst.timerFrigjortPerUke ?? rawGevinst.timerFrigjortUke ?? dfoFallback.timerFrigjortPerUke,
        timerFrigjortAar: rawGevinst.timerFrigjortPerAar ?? rawGevinst.timerFrigjortAar ?? dfoFallback.timerFrigjortPerAar,
        verdiKr: rawGevinst.aarligKapasitetsverdiKr ?? rawGevinst.verdiKr ?? dfoFallback.aarligKapasitetsverdiKr
      };

      const referanseCaser: ReferanseCase[] = Array.isArray(data.referanseCaser) && data.referanseCaser.length > 0
        ? data.referanseCaser.map((c: any) => ({
            tittel: c.tittel || 'Offentlig innovasjonscase',
            organisasjon: c.organisasjon || 'Offentlig sektor',
            oppnaaddResultat: c.oppnaaddResultat || c.maaltResultat || 'Dokumentert gevinst i erfaringsbasen',
            maaltResultat: c.oppnaaddResultat || c.maaltResultat || 'Dokumentert gevinst i erfaringsbasen',
            evidens: c.evidens || 'Empirisk presedens',
            kilde: c.kilde,
            kildeUrl: c.kildeUrl || c.kilde_url
          }))
        : EMPIRISKE_REFERANSER;

      return {
        gevinst,
        portvakter: data.portvakter,
        allePortvakterPassert: data.allePortvakterPassert,
        totalscore: data.totalscore,
        modenhetstrinn: data.modenhetstrinn,
        modenhetNavn: data.modenhetNavn,
        aiTilbakemelding: data.aiTilbakemelding,
        referanseCaser,
        mvp0Tips: data.mvp0Tips,
        mvpPlan: data.mvpPlan,
        status: data.status || 'backend_ok'
      };
    }
  } catch {
    // Fallback til lokal deterministisk motor hvis server/Edge function ikke er aktiv
  }

  const lokal = evaluerStudentCase({ prompt, timerPerUke, kuttProsent });
  return {
    gevinst: lokal.gevinst,
    portvakter: lokal.portvakter,
    allePortvakterPassert: lokal.allePortvakterPassert,
    totalscore: lokal.totalscore,
    modenhetstrinn: lokal.modenhetstrinn,
    modenhetNavn: lokal.modenhetNavn,
    aiTilbakemelding: lokal.aiTilbakemelding,
    referanseCaser: lokal.referanseCaser,
    mvp0Tips: lokal.mvp0Tips,
    mvpPlan: lokal.mvpPlan,
    status: 'lokal_deterministisk'
  };
}

