// types.ts - Felles datastrukturer for inntak, portvakter, DFØ-gevinst og evaluering

export type Bransje = 'helse' | 'offentlig_forvaltning' | 'skole_utdanning' | 'industri' | 'annet';

export interface StudentInput {
  prompt: string;                 // Studentens fritekst-idé
  timerPerUke?: number;           // Dagens timer per uke (baseline/nullalternativ)
  dagensTimerPerUke?: number;     // Alias for bakoverkompatibilitet
  kuttProsent?: number;           // Forventet kutt i %
  forventetKuttProsent?: number;  // Alias for bakoverkompatibilitet
  bransje?: Bransje;              // Valgfritt
  harProsesseier?: 'ja' | 'nei';   // Portvakt 1
  ikkeKiVurdert?: 'ja' | 'nei';   // Portvakt 3
  menneskeIKontroll?: 'ja' | 'nei'; // Portvakt 4
}

export interface PortvaktResultat {
  navn: string;
  passert: boolean;
  status: string;
  begrunnelse: string;
  beskrivelse?: string;          // Alias for bakoverkompatibilitet
}

export interface GevinstBeregning {
  timerFrigjortPerUke: number;
  timerFrigjortPerAar: number;
  aarsverkFrigjort: number;
  aarligKapasitetsverdiKr: number; // 850 000 kr per årsverk (DFØ standard sjablong)
  gevinstkategori: 'Kapasitetsgevinst' | 'Tidsgevinst';
  // Bakoverkompatible aliaser
  timerFrigjortUke?: number;
  timerFrigjortAar?: number;
  verdiKr?: number;
}

export interface ReferanseCase {
  tittel: string;
  organisasjon: string;
  oppnaaddResultat: string;
  evidens: string;
  kilde?: string;
  kildeUrl?: string;
  maaltResultat?: string;        // Alias for bakoverkompatibilitet
}

export interface EvalueringResultat {
  portvakter: PortvaktResultat[];
  allePortvakterPassert: boolean;
  totalscore: number;            // 0 - 100
  modenhetstrinn: number;        // 0 - 6
  modenhetNavn: string;
  gevinst: GevinstBeregning;
  mvpPlan: {
    steg: string;
    tittel: string;
    hvaSkalBevises: string;
    hvaSkalUtelates: string;
  }[];
  referanseCaser: ReferanseCase[];
  aiTilbakemelding?: string;
  mvp0Tips?: string;
  status?: string;
}

export type EvalueringRespons = EvalueringResultat;

// 5-Stegs Trakt & Sensor Typer
export type PortvaktId = 'eier' | 'baseline' | 'ikkeKi' | 'data' | 'kontroll' | 'juss' | 'test';
export type SvarVerdi = 'ja' | 'vet_ikke' | 'nei';
export type Svar = Record<PortvaktId, SvarVerdi>;

export interface SensorInput {
  dagensSituasjon: string;
  foreslaattLosning: string;
  eierSektorEffekt: string;
  svar?: Partial<Svar>;
  caser?: ReferanseCase[];
}

export interface SensorResultat {
  kilde: 'openai' | 'lokal';
  konklusjon: string;
  styrker: string[];
  gap: string[];
  testoppsett: string[];
  domene?: string;
  fallbackGrunn?: string;
}

export interface HandoffPakke {
  input: SensorInput;
  svar: Svar;
  dom: { antallJa: number; niva: 'klar' | 'betinget' | 'forankre'; tittel: string };
  sensor: SensorResultat;
  ukeoppgaver: { id: string; tittel: string; tekst: string }[];
  gevinst?: GevinstBeregning;
  modenhet?: { trinn: number; navn: string; score: number };
}
