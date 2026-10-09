import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  X,
  Clipboard,
  RefreshCw,
  Database,
  ShieldCheck,
  FlaskConical,
  Factory,
  Eraser,
  Loader2,
  ChevronDown,
  ChevronRight,
  Settings,
  Key,
  TrendingUp,
  Clock,
  Sparkles,
  Printer,
  ExternalLink,
  Send
} from 'lucide-react';
import {
  PortvaktId,
  Svar,
  SvarVerdi,
  SensorInput,
  SensorResultat,
  ReferanseCase,
  HandoffPakke
} from './lib/types';
import { finnDomene, rangerCaser } from './lib/case-search';
import { evaluerSensor, lokalSensorFallback, lagKiPrompt, opprettInnlimtResultat } from './lib/sensor-adapter';
import {
  EMPIRISKE_REFERANSER,
  beregnDfoGevinst,
  evaluerStudentCase,
  STANDARD_AARSVERK_KR
} from './lib/engine';

type Steg = 1 | 2 | 3 | 4 | 5;

const STEG_NAVN: Record<Steg, string> = {
  1: 'Idé',
  2: 'Avklaring',
  3: 'Sjekkliste',
  4: 'KI-Sensor',
  5: 'Handoff'
};

interface PortvaktDef {
  id: PortvaktId;
  blokk: 1 | 2 | 3;
  kort: string;
  sporsmal: string;
}

const PORTVAKTER: PortvaktDef[] = [
  { id: 'eier', blokk: 1, kort: 'Prosesseier', sporsmal: 'Har prosjektet en navngitt leder med ansvar for gevinsten?' },
  { id: 'baseline', blokk: 1, kort: 'Dagens nivå', sporsmal: 'Er tidsbruk, feilrate eller nedetid målt?' },
  { id: 'ikkeKi', blokk: 2, kort: 'Enklere tiltak', sporsmal: 'Er enklere tiltak prøvd før KI?' },
  { id: 'data', blokk: 2, kort: 'Data', sporsmal: 'Finnes dataene løsningen trenger, i god nok kvalitet?' },
  { id: 'kontroll', blokk: 3, kort: 'Faglig kontroll', sporsmal: 'Kontrollerer en fagperson forslagene før bruk?' },
  { id: 'juss', blokk: 3, kort: 'Personvern og juss', sporsmal: 'Er personvern, opphavsrett og informasjonssikkerhet vurdert?' },
  { id: 'test', blokk: 3, kort: 'Manuell test', sporsmal: 'Kan dere teste 5–10 saker før dere bygger?' }
];

const STANDARD_SVAR: Svar = {
  eier: 'vet_ikke',
  baseline: 'vet_ikke',
  ikkeKi: 'vet_ikke',
  data: 'vet_ikke',
  kontroll: 'vet_ikke',
  juss: 'vet_ikke',
  test: 'vet_ikke'
};

const BLOKKER = [
  { nr: 1, tittel: 'Behov' },
  { nr: 2, tittel: 'Løsning' },
  { nr: 3, tittel: 'Kontroll' }
];

export default function App() {
  const [steg, setSteg] = useState<Steg>(1);
  const [dagensSituasjon, setDagensSituasjon] = useState('');
  const [foreslaattLosning, setForeslaattLosning] = useState('');
  const [eierSektorEffekt, setEierSektorEffekt] = useState('');
  const [svar, setSvar] = useState<Svar>(STANDARD_SVAR);

  // DFØ Glidere for tidsbruk og forventet besparelse
  const [timerPerUke, setTimerPerUke] = useState<number>(40);
  const [kuttProsent, setKuttProsent] = useState<number>(50);

  // Momentan DFØ-kalkyle (0 ms, 0 tokens)
  const dfoGevinst = beregnDfoGevinst({ timerPerUke, kuttProsent });

  // Kilder og caser
  const [caser, setCaser] = useState<ReferanseCase[]>(EMPIRISKE_REFERANSER);
  const [visKilder, setVisKilder] = useState(false);

  // Sensor state
  const [sensor, setSensor] = useState<SensorResultat | null>(null);
  const [lasterSensor, setLasterSensor] = useState(false);
  const [sisteKjorteNokkel, setSisteKjorteNokkel] = useState('');

  // Innstillinger for API-nøkkel (localStorage-basert, 0 avhengighet til Lovable)
  const [visInnstillinger, setVisInnstillinger] = useState(false);
  const [apiKey, setApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('openai_api_key') || (import.meta as any).env?.VITE_OPENAI_API_KEY || '';
    } catch {
      return '';
    }
  });
  const [apiKeyInput, setApiKeyInput] = useState(apiKey);
  const [lagretNokkelMelding, setLagretNokkelMelding] = useState(false);

  // Student-proxy URL (for zero-friction bruk i klasserommet)
  const STANDARD_PROXY_URL = 'https://white-tooth-b839.larserik-bn.workers.dev';
  const [proxyUrl, setProxyUrl] = useState<string>(() => {
    try {
      const lagret = localStorage.getItem('student_proxy_url');
      if (lagret !== null) return lagret;
      return (import.meta as any).env?.VITE_STUDENT_PROXY_URL || STANDARD_PROXY_URL;
    } catch {
      return STANDARD_PROXY_URL;
    }
  });
  const [proxyUrlInput, setProxyUrlInput] = useState(proxyUrl);

  const lagreApiKey = (nyNokkel: string) => {
    const renset = nyNokkel.trim();
    setApiKey(renset);
    try {
      if (renset) {
        localStorage.setItem('openai_api_key', renset);
      } else {
        localStorage.removeItem('openai_api_key');
      }
      setLagretNokkelMelding(true);
      setTimeout(() => setLagretNokkelMelding(false), 2500);
    } catch {
      // ignore
    }
  };

  const lagreProxyUrl = (nyUrl: string) => {
    const renset = nyUrl.trim();
    setProxyUrl(renset);
    try {
      if (renset) {
        localStorage.setItem('student_proxy_url', renset);
      } else {
        localStorage.removeItem('student_proxy_url');
      }
      setLagretNokkelMelding(true);
      setTimeout(() => setLagretNokkelMelding(false), 2500);
    } catch {
      // ignore
    }
  };

  // Ukeoppgaver ferdigstatus
  const [oppgaverFerdig, setOppgaverFerdig] = useState<Record<string, boolean>>({});
  const [kopiertType, setKopiertType] = useState<string | null>(null);

  // Hent caser fra public/data hvis tilgjengelig (relativ base for GitHub Pages/Vercel/statisk publisering)
  useEffect(() => {
    const baseUrl = import.meta.env.BASE_URL || './';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    fetch(`${cleanBase}data/case-index.json`)
      .then((res) => {
        if (!res.ok) throw new Error('Fant ikke casebanken');
        return res.json();
      })
      .then((rows: any[]) => {
        const parsed: ReferanseCase[] = rows.map(c => ({
          caseId: c.caseId, tittel: c.tittel, organisasjon: c.organisasjon,
          oppnaaddResultat: c.resultat || 'Resultat er ikke dokumentert.',
          problem: c.problem, mangler: c.mangler, evidens: c.evidens,
          kilde: c.kilde, kildeUrl: c.kildeUrl,
          bransje: c.bransje
        }));
        if (parsed.length > 0) setCaser(parsed);
      })
      .catch(() => {
        // Bruk innebygde referanser
      });
  }, []);

  const kanGaaTilSteg2 = dagensSituasjon.trim().length >= 10 &&
    foreslaattLosning.trim().length >= 10 &&
    eierSektorEffekt.trim().length >= 10;

  const antallJa = PORTVAKTER.filter((p) => svar[p.id] === 'ja').length;
  const domNiva: 'klar' | 'betinget' | 'forankre' = antallJa === 7 ? 'klar' : antallJa >= 5 ? 'betinget' : 'forankre';
  const domTittel = domNiva === 'klar' ? 'Klar for pilot' : domNiva === 'betinget' ? 'Godt på vei' : 'Forankre først';

  // Deterministisk modenhet og score iht. AGENTS.md / FoU-rammeverk
  const studentEvaluering = evaluerStudentCase({
    prompt: `${dagensSituasjon} ${foreslaattLosning} ${eierSektorEffekt}`,
    timerPerUke,
    kuttProsent,
    harProsesseier: svar.eier === 'ja' ? 'ja' : 'nei',
    ikkeKiVurdert: svar.ikkeKi === 'ja' ? 'ja' : 'nei',
    menneskeIKontroll: svar.kontroll === 'ja' ? 'ja' : 'nei'
  });

  const samletInputTekst = `${dagensSituasjon} ${foreslaattLosning} ${eierSektorEffekt}`;
  const matchedeCaser = rangerCaser(samletInputTekst, caser, 3);

  // Kjøring av sensor til Steg 4 (direkte API eller student-proxy)
  const kjoerDirekteSensor = async (nokkelTilBruk?: string, overstyrtProxy?: string) => {
    const aktivNokkel = (nokkelTilBruk !== undefined ? nokkelTilBruk : apiKey).trim();
    const aktivProxy = (overstyrtProxy !== undefined ? overstyrtProxy : proxyUrl).trim();
    setLasterSensor(true);
    try {
      const res = await evaluerSensor({
        input: {
          dagensSituasjon,
          foreslaattLosning,
          eierSektorEffekt,
          svar,
          timerPerUke, kuttProsent, caser: matchedeCaser
        },
        apiKey: aktivNokkel,
        proxyUrl: aktivProxy
      });
      setSensor(res);
      setSisteKjorteNokkel(JSON.stringify({ dagensSituasjon, foreslaattLosning, eierSektorEffekt, svar, timerPerUke, kuttProsent, apiKey: aktivNokkel, proxyUrl: aktivProxy }));
    } catch {
      const fallback = lokalSensorFallback({
        dagensSituasjon,
        foreslaattLosning,
        eierSektorEffekt,
        svar,
        timerPerUke, kuttProsent, caser: matchedeCaser
      });
      setSensor(fallback);
    } finally {
      setLasterSensor(false);
    }
  };

  const gaaTilSensor = async () => {
    setSteg(4);
    const gjeldendeNokkel = JSON.stringify({ dagensSituasjon, foreslaattLosning, eierSektorEffekt, svar, timerPerUke, kuttProsent, apiKey: apiKey.trim(), proxyUrl: proxyUrl.trim() });
    if (gjeldendeNokkel !== sisteKjorteNokkel || !sensor) {
      await kjoerDirekteSensor();
    }
  };

  // Ukeoppgaver basert på sjekkliste-gap
  const ukeoppgaver = [
    svar.eier !== 'ja'
      ? { id: 'eier', tittel: 'Forankre prosesseier i linjen', tekst: 'Gjennomfør et 20-minutters møte med linjeleder og bekreft mandat for gevinstrealisering.' }
      : { id: 'baseline', tittel: 'Registrer dagens baseline', tekst: 'Mål og dokumenter faktisk tidsbruk på de neste 5–10 sakene før piloten starter.' },
    svar.ikkeKi !== 'ja'
      ? { id: 'ikkeKi', tittel: 'Test et enklere ikke-KI tiltak først', tekst: 'Prøv en standard sjekkliste eller mal på 5 saker og se om det løser problemet.' }
      : svar.juss !== 'ja'
      ? { id: 'juss', tittel: 'Avklar personvern (GDPR)', tekst: 'Ta en rask avklaring med personvernombud/IT om anonymisering før data kobles.' }
      : { id: 'hitl', tittel: 'Etabler kontrollrutine', tekst: 'Definer hvem som skal godkjenne og overprøve hvert enkelt forslag.' },
    {
      id: 'test',
      tittel: 'Gjennomfør 1-ukes manuell pilot',
      tekst: sensor?.testoppsett?.[0] || 'Simuler løsningen manuelt på 5–10 saker uten å skrive kode og sammenlign mot baseline.'
    }
  ];

  // Eksportfunksjoner og Handoff
  const handoffPakke: HandoffPakke = {
    input: { dagensSituasjon, foreslaattLosning, eierSektorEffekt, svar, timerPerUke, kuttProsent, caser: matchedeCaser },
    svar,
    dom: { antallJa, niva: domNiva, tittel: domTittel },
    sensor: sensor || lokalSensorFallback({ dagensSituasjon, foreslaattLosning, eierSektorEffekt, svar }),
    ukeoppgaver,
    gevinst: dfoGevinst,
    modenhet: {
      trinn: studentEvaluering.modenhetstrinn,
      navn: studentEvaluering.modenhetNavn,
      score: studentEvaluering.totalscore
    }
  };

  const kopierTilUtklipp = async (tekst: string, type: string) => {
    try {
      await navigator.clipboard.writeText(tekst);
      setKopiertType(type);
      setTimeout(() => setKopiertType(null), 2000);
    } catch {
      // Fallback
    }
  };

  // Innlimt KI-vurdering og ekstern dialog
  const [innlimtTekst, setInnlimtTekst] = useState('');
  const [visInnlimingsBoks, setVisInnlimingsBoks] = useState(false);
  const [visEksternVurdering, setVisEksternVurdering] = useState(false);
  const [innlimtSuksess, setInnlimtSuksess] = useState(false);
  const [eksternStatusMelding, setEksternStatusMelding] = useState<string | null>(null);

  const aapneIChatGpt = () => {
    const prompt = lagKiPrompt(handoffPakke);
    kopierTilUtklipp(prompt, 'chatgpt');
    const url = prompt.length < 2000
      ? `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`
      : 'https://chatgpt.com/';
    window.open(url, '_blank', 'noopener,noreferrer');
    setVisInnlimingsBoks(true);
    setEksternStatusMelding('Prompt kopiert til utklipp! ChatGPT er åpnet. Lim inn svaret under når ferdig.');
    setTimeout(() => setEksternStatusMelding(null), 6000);
  };

  const aapneIClaude = () => {
    const prompt = lagKiPrompt(handoffPakke);
    kopierTilUtklipp(prompt, 'claude');
    window.open('https://claude.ai/new', '_blank', 'noopener,noreferrer');
    setVisInnlimingsBoks(true);
    setEksternStatusMelding('Prompt kopiert til utklipp! Claude er åpnet. Lim inn svaret under når ferdig.');
    setTimeout(() => setEksternStatusMelding(null), 6000);
  };

  const brukInnlimtTekst = () => {
    if (!innlimtTekst.trim()) return;
    const res = opprettInnlimtResultat(innlimtTekst);
    setSensor(res);
    setInnlimtSuksess(true);
    setTimeout(() => setInnlimtSuksess(false), 3000);
  };

  const kopierLedelsesnotat = () => {
    const dato = new Intl.DateTimeFormat('nb-NO', { dateStyle: 'long' }).format(new Date());
    const kildeNavn = sensor?.kilde === 'openai'
      ? 'OpenAI gpt-4o-mini (direkte)'
      : sensor?.kilde === 'openai_proxy'
      ? 'OpenAI gpt-4o-mini (via student-proxy)'
      : sensor?.kilde === 'bruker_innlimt'
      ? 'ChatGPT / Claude (bruker-innlimt)'
      : 'Lokal regelmotor';

    const notat = `BESLUTNINGSNOTAT: INNOVASJONS- OG KI-PILOT
Dato: ${dato}
Status: ${domTittel} (${antallJa} av 7 avklart) | Modenhet: ${studentEvaluering.modenhetNavn} (${studentEvaluering.totalscore}/100 poeng)

1. PROBLEMSTILLING & BASELINE
${dagensSituasjon}
Dagens manuelle tidsbruk: ${timerPerUke} timer/uke.

2. FORESLÅTT LØSNING
${foreslaattLosning}

3. FORVENTET DFØ-EFFEKT & GEVINST
- Estimert besparelse: ${kuttProsent} % (${dfoGevinst.timerFrigjortPerUke} timer/uke, ${dfoGevinst.timerFrigjortPerAar} timer/år)
- Frigjort kapasitet: ${dfoGevinst.aarsverkFrigjort} årsverk
- Est. årlig verdi: ${dfoGevinst.aarligKapasitetsverdiKr.toLocaleString('no-NO')} kr/år (${dfoGevinst.gevinstkategori})
Forankring: ${eierSektorEffekt}

4. SENSORENS VURDERING (${kildeNavn})
Konklusjon: ${sensor?.konklusjon || 'Avventer'}
Styrker:
${(sensor?.styrker || []).map((s) => `• ${s}`).join('\n')}
Kritiske gap som må lukkes:
${(sensor?.gap || []).map((g) => `• ${g}`).join('\n')}
${sensor?.raatekst ? `\nUtfyllende KI-vurdering fra samtalen:\n${sensor.raatekst}\n` : ''}
5. PLAN FOR KOMMENDE UKE
${ukeoppgaver.map((u, i) => `${i + 1}. ${u.tittel}: ${u.tekst}`).join('\n')}

Stoppregel: ${sensor?.testoppsett?.[2] || 'Avbryt hvis tidsbruk overstiger dagens baseline.'}`;

    kopierTilUtklipp(notat, 'notat');
  };

  // Demo Presets
  const lastPreset = (type: 'moden' | 'uferdig') => {
    if (type === 'moden') {
      setDagensSituasjon('Etterkontroll av 4 000 produkter per skift gir 3 % avvik og 6 timer etterarbeid.');
      setForeslaattLosning('Bildegjenkjenning flagger feil, operatøren godkjenner hvert avvik. Sjekkliste er først vurdert.');
      setEierSektorEffekt('Produksjonssjefen er prosesseier med budsjettansvar. Vi starter med manuell prøve på 10 enheter.');
      setTimerPerUke(60);
      setKuttProsent(50);
      setSvar({ eier: 'ja', baseline: 'ja', ikkeKi: 'ja', data: 'ja', kontroll: 'ja', juss: 'ja', test: 'ja' });
    } else {
      setDagensSituasjon('Vi bruker for mye tid på saksbehandling, men har ikke målt nøyaktig tidsbruk.');
      setForeslaattLosning('Ta i bruk en avansert språkmodell som automatisk skriver og sender svar.');
      setEierSektorEffekt('Prosjektgruppe i IT ønsker å teste teknologien for å se hva som skjer.');
      setTimerPerUke(0);
      setKuttProsent(50);
      setSvar({ eier: 'nei', baseline: 'nei', ikkeKi: 'nei', data: 'vet_ikke', kontroll: 'vet_ikke', juss: 'vet_ikke', test: 'vet_ikke' });
    }
  };

  const toemFelter = () => {
    setDagensSituasjon('');
    setForeslaattLosning('');
    setEierSektorEffekt('');
    setTimerPerUke(40);
    setKuttProsent(50);
    setSvar(STANDARD_SVAR);
    setSensor(null);
    setSisteKjorteNokkel('');
    setInnlimtTekst('');
    setVisInnlimingsBoks(false);
    setVisEksternVurdering(false);
    setEksternStatusMelding(null);
    setSteg(1);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      {/* Header med ren Stepper (5 steg) */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-3xl px-5 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                Business Case-screening
              </h1>
              <p className="mt-1 text-xs text-slate-500">Vurder idéen før dere bygger.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setApiKeyInput(apiKey);
                setProxyUrlInput(proxyUrl);
                setVisInnstillinger(!visInnstillinger);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              title="Innstillinger for API-nøkkel og student-proxy"
            >
              <Settings className="h-4 w-4 text-slate-500" />
                  <span>{apiKey.trim() || proxyUrl.trim() ? 'KI-tilkobling' : 'Innstillinger'}</span>
            </button>
          </div>

          {/* Innstillingspanel for OpenAI API-nøkkel og Student-Proxy */}
          {visInnstillinger && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <Settings className="h-4 w-4 text-blue-600" /> Innstillinger for KI-tilkobling
                </span>
                <button
                  type="button"
                  onClick={() => setVisInnstillinger(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Seksjon 1: Felles Student-Proxy URL */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" /> Student-proxy
                  </span>
                  {proxyUrl && <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-100 px-1.5 py-0.5 rounded">Aktiv</span>}
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <input
                    type="url"
                    placeholder="https://prosjektoggevinst-proxy.ditt-navn.workers.dev"
                    value={proxyUrlInput}
                    onChange={(e) => setProxyUrlInput(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      lagreProxyUrl(proxyUrlInput);
                      setVisInnstillinger(false);
                    }}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white hover:bg-emerald-800"
                  >
                    Lagre
                  </button>
                  {proxyUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        lagreProxyUrl('');
                        setProxyUrlInput('');
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-rose-600 hover:bg-rose-50"
                    >
                      Fjern
                    </button>
                  )}
                </div>
              </div>

              {/* Seksjon 2: Egen privat OpenAI API-nøkkel */}
              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5 text-blue-600" /> Egen OpenAI-nøkkel
                  </span>
                  {apiKey && <span className="text-[10px] text-blue-700 font-semibold bg-blue-100 px-1.5 py-0.5 rounded">Aktiv</span>}
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <input
                    type="password"
                    placeholder="sk-proj-..."
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      lagreApiKey(apiKeyInput);
                      setVisInnstillinger(false);
                    }}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700"
                  >
                    Lagre
                  </button>
                  {apiKey && (
                    <button
                      type="button"
                      onClick={() => {
                        lagreApiKey('');
                        setApiKeyInput('');
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-rose-600 hover:bg-rose-50"
                    >
                      Fjern
                    </button>
                  )}
                </div>
              </div>

              {lagretNokkelMelding && (
                <p className="text-emerald-600 font-medium text-xs">✓ Innstillinger oppdatert!</p>
              )}
            </div>
          )}
          <nav aria-label="Fremdrift" className="mt-5">
            <ol className="flex items-center gap-2">
              {([1, 2, 3, 4, 5] as Steg[]).map((s, idx) => {
                const erAktiv = s === steg;
                const erFerdig = s < steg;
                const kanKlikkes = (s === 1) || (s <= steg) || (s === 2 && kanGaaTilSteg2);

                return (
                  <li key={s} className="flex flex-1 items-center gap-2">
                    <button
                      type="button"
                      disabled={!kanKlikkes}
                      onClick={() => kanKlikkes && setSteg(s)}
                      className={`flex items-center gap-2 rounded-full text-xs font-semibold transition-colors ${
                        erAktiv ? 'text-blue-600' : erFerdig ? 'text-slate-800' : 'text-slate-400'
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold border ${
                          erAktiv
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : erFerdig
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-slate-300 bg-white text-slate-500'
                        }`}
                      >
                        {erFerdig ? <Check className="h-3.5 w-3.5" /> : s}
                      </span>
                      <span className="hidden sm:inline">{STEG_NAVN[s]}</span>
                    </button>
                    {idx < 4 && (
                      <span className={`h-0.5 flex-1 rounded-full ${s < steg ? 'bg-blue-600' : 'bg-slate-200'}`} />
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </header>

      {/* Hovedinnhold */}
      <main className="mx-auto max-w-3xl px-5 py-8">
        {/* STEG 1: IDÉ */}
        {steg === 1 && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => lastPreset('moden')}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                <Factory className="h-3.5 w-3.5" /> Eksempel: Moden case
              </button>
              <button
                type="button"
                onClick={() => lastPreset('uferdig')}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Eksempel: Uferdig idé
              </button>
              <button
                type="button"
                onClick={toemFelter}
                className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                <Eraser className="h-3.5 w-3.5" /> Tøm felter
              </button>
            </div>

            <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <label htmlFor="situasjon" className="block text-sm font-semibold text-slate-900">
                  Dagens situasjon
                </label>
                <textarea
                  id="situasjon"
                  rows={2}
                  value={dagensSituasjon}
                  onChange={(e) => setDagensSituasjon(e.target.value)}
                  placeholder="Hva skjer i dag? Ta med ett tall."
                  className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="losning" className="block text-sm font-semibold text-slate-900">
                  Foreslått løsning
                </label>
                <textarea
                  id="losning"
                  rows={2}
                  value={foreslaattLosning}
                  onChange={(e) => setForeslaattLosning(e.target.value)}
                  placeholder="Hva skal løsningen gjøre?"
                  className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="eier" className="block text-sm font-semibold text-slate-900">
                  Eier, sektor og effekt
                </label>
                <textarea
                  id="eier"
                  rows={2}
                  value={eierSektorEffekt}
                  onChange={(e) => setEierSektorEffekt(e.target.value)}
                  placeholder="Hvem eier arbeidet, og hva skal bli bedre?"
                  className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* DFØ Gevinstkalkulator: To glidere og momentan beregning */}
              <div className="border-t border-slate-200 pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-emerald-600" /> Dine anslag
                  </span>
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    {dfoGevinst.gevinstkategori}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200/70 space-y-2">
                    <div className="flex justify-between items-center text-xs font-medium text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-500" /> Timer i dag
                      </span>
                      <span className={`font-bold ${timerPerUke === 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                        {timerPerUke} t/uke {timerPerUke === 0 ? '(mangler)' : ''}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="5"
                      value={timerPerUke}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setTimerPerUke(v);
                        if (v > 0 && svar.baseline !== 'ja') {
                          setSvar((prev) => ({ ...prev, baseline: 'ja' }));
                        } else if (v === 0 && svar.baseline === 'ja') {
                          setSvar((prev) => ({ ...prev, baseline: 'nei' }));
                        }
                      }}
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                    {timerPerUke === 0 && <p className="text-[11px] text-amber-700">Mangler måling av dagens nivå.</p>}
                  </div>

                  <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200/70 space-y-2">
                    <div className="flex justify-between items-center text-xs font-medium text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> Forventet kutt
                      </span>
                      <span className="font-bold text-slate-900">{kuttProsent}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      step="5"
                      value={kuttProsent}
                      onChange={(e) => setKuttProsent(Number(e.target.value))}
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>

                {/* 3 Resultattall */}
                <div className="grid grid-cols-3 gap-2.5 text-center pt-1">
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-200/70">
                    <div className="text-lg font-bold text-slate-900">{dfoGevinst.timerFrigjortPerUke} t</div>
                    <div className="text-[11px] text-slate-500">frigjort per uke</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-200/70">
                    <div className="text-lg font-bold text-slate-900">{dfoGevinst.aarsverkFrigjort}</div>
                    <div className="text-[11px] text-slate-500">årsverk kapasitet</div>
                  </div>
                  <div className="rounded-lg bg-emerald-50/70 p-3 border border-emerald-200/70">
                    <div className="text-lg font-bold text-emerald-800">
                      {dfoGevinst.aarligKapasitetsverdiKr.toLocaleString('no-NO')} kr
                    </div>
                    <div className="text-[11px] text-emerald-700">årlig kapasitetsverdi</div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 text-center">
                  DFØ-sjablong: 1 årsverk = 1 750 t / {STANDARD_AARSVERK_KR.toLocaleString('no-NO')} kr.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={!kanGaaTilSteg2}
                onClick={() => setSteg(2)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Gå til avklaring <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        )}

        {/* STEG 2: AVKLARING */}
        {steg === 2 && (
          <section className="space-y-6">
            {BLOKKER.map((blokk) => {
              const punkter = PORTVAKTER.filter((p) => p.blokk === blokk.nr);
              return (
                <div key={blokk.nr} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 border-b pb-2">
                    {blokk.tittel}
                  </h3>
                  <div className="divide-y divide-slate-100">
                    {punkter.map((p) => (
                      <div key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <p className="max-w-md text-sm font-semibold text-slate-900">{p.sporsmal}</p>
                        <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50 shrink-0">
                          {(['ja', 'vet_ikke', 'nei'] as SvarVerdi[]).map((val) => {
                            const valgt = svar[p.id] === val;
                            const stil = val === 'ja'
                              ? (valgt ? 'bg-emerald-600 text-white font-bold' : 'text-slate-600 hover:text-emerald-700')
                              : val === 'vet_ikke'
                              ? (valgt ? 'bg-amber-500 text-white font-bold' : 'text-slate-600 hover:text-amber-700')
                              : (valgt ? 'bg-rose-600 text-white font-bold' : 'text-slate-600 hover:text-rose-700');

                            const etikett = val === 'ja' ? 'Ja' : val === 'vet_ikke' ? 'Vet ikke' : 'Nei';

                            return (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setSvar({ ...svar, [p.id]: val })}
                                className={`rounded px-3 py-1 text-xs transition-colors ${stil}`}
                              >
                                {etikett}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setSteg(1)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" /> Tilbake til idé
              </button>
              <button
                type="button"
                onClick={() => setSteg(3)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Se sjekkliste-resultat <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        )}

        {/* STEG 3: SJEKKLISTE-RESULTAT */}
        {steg === 3 && (
          <section className="space-y-6">
            <div
              className={`rounded-xl border-2 p-6 ${
                domNiva === 'klar'
                  ? 'border-emerald-500 bg-emerald-50/60'
                  : domNiva === 'betinget'
                  ? 'border-amber-500 bg-amber-50/60'
                  : 'border-orange-500 bg-orange-50/60'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white font-bold ${
                      domNiva === 'klar' ? 'bg-emerald-600' : domNiva === 'betinget' ? 'bg-amber-600' : 'bg-orange-600'
                    }`}
                  >
                    {domNiva === 'klar' ? <Check className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-600">{antallJa}/7 avklart</p>
                    <h2 className="text-xl font-bold text-slate-950 sm:text-2xl">{domTittel}</h2>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white/90 px-3 py-1 text-xs font-semibold text-blue-900 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" /> {studentEvaluering.modenhetNavn}
                </span>
              </div>

              {/* DFØ-Gevinstoppsummering i sjekklisten */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-3.5 py-2 text-xs border border-slate-200/60">
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> Dine anslag
                </span>
                <span className="font-medium text-slate-700">
                  {dfoGevinst.timerFrigjortPerUke} t/uke • {dfoGevinst.aarsverkFrigjort} årsverk • {dfoGevinst.aarligKapasitetsverdiKr.toLocaleString('no-NO')} kr/år
                </span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-white/80 p-4 border border-slate-200">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Avklart
                  </p>
                  <ul className="mt-2.5 space-y-1.5 text-xs text-slate-700">
                    {PORTVAKTER.filter((p) => svar[p.id] === 'ja').map((p) => (
                      <li key={p.id} className="flex items-center gap-1.5">
                        <span className="text-emerald-600">✓</span> {p.kort}
                      </li>
                    ))}
                    {antallJa === 0 && <li className="text-slate-400">Ingen ennå</li>}
                  </ul>
                </div>

                <div className="rounded-lg bg-white/80 p-4 border border-slate-200">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600" /> Må avklares
                  </p>
                  <ul className="mt-2.5 space-y-1.5 text-xs text-slate-700">
                    {PORTVAKTER.filter((p) => svar[p.id] !== 'ja').map((p) => (
                      <li key={p.id} className="flex items-center gap-1.5">
                        <span className={svar[p.id] === 'nei' ? 'text-rose-600' : 'text-amber-500'}>
                          {svar[p.id] === 'nei' ? '✗' : '?'}
                        </span>
                        {p.kort}
                      </li>
                    ))}
                    {antallJa === 7 && <li className="text-emerald-600">Alt er avklart.</li>}
                  </ul>
                </div>
              </div>
            </div>

            {/* Lukket Kilde-Toggle (Caseregisteret) */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <button
                type="button"
                onClick={() => setVisKilder(!visKilder)}
                className="flex w-full items-center justify-between text-left text-xs font-bold text-slate-700 hover:text-blue-600"
              >
                <span className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-600" />
                  {visKilder ? 'Skjul' : 'Se'} kilder ({matchedeCaser.length} av {caser.length.toLocaleString('no-NO')} dokumenterte caser)
                </span>
                <span className="flex items-center gap-2 text-[11px] font-normal text-slate-500">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" title="Casebank tilkoblet" />
                  {caser.length > 3 ? `${caser.length.toLocaleString('no-NO')} caser` : 'Referansecaser'}
                  {visKilder ? <ChevronDown className="h-4 w-4 text-slate-700" /> : <ChevronRight className="h-4 w-4 text-slate-700" />}
                </span>
              </button>

              {visKilder && (
                <div className="mt-4 space-y-3 border-t pt-3">
                  <p className="text-[11px] text-slate-500">
                    Søker automatisk i erfaringsbasen ({caser.length.toLocaleString('no-NO')} caser fra OECD og UK ATRS) etter lignende prosjekter.
                  </p>
                  {matchedeCaser.map((c, i) => (
                    <div key={i} className="text-xs text-slate-600 space-y-1">
                      <p className="font-semibold text-slate-900">
                        {c.tittel} — <span className="font-normal text-slate-500">{c.organisasjon}</span>
                        {c.bransje && (
                          <span className="ml-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                            {c.bransje.replace('_', ' ')}
                          </span>
                        )}
                      </p>
                      <p className="text-slate-700">{c.oppnaaddResultat}</p>
                      {c.kildeUrl && (
                        <a href={c.kildeUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-block">
                          Kilde: {c.kilde || 'Offentlig rapport'} ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setSteg(2)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" /> Endre svar
              </button>
              <button
                type="button"
                onClick={gaaTilSensor}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Kjør KI-sensor <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        )}

        {/* STEG 4: KI-SENSOR */}
        {steg === 4 && (
          <section className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-700">
                <span className="font-semibold">Dine anslag</span>
                <span>{timerPerUke} t/uke · {kuttProsent}% kutt · {antallJa}/7 avklart</span>
              </div>
              <button
                    type="button"
                    disabled={lasterSensor}
                    onClick={() => kjoerDirekteSensor()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                    {lasterSensor ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyserer med KI…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Vurder prosjektet
                      </>
                    )}
              </button>
              <button
                type="button"
                onClick={() => setVisEksternVurdering(!visEksternVurdering)}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                {visEksternVurdering ? 'Skjul eksternt alternativ' : 'Bruk ChatGPT eller Claude'}
              </button>
              {visEksternVurdering && (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={aapneIChatGpt}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-3 w-3 text-slate-500" /> Åpne i ChatGPT ↗
                      </button>
                      <button
                        type="button"
                        onClick={aapneIClaude}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-3 w-3 text-slate-500" /> Åpne i Claude ↗
                      </button>
                    </div>
                  <button
                    type="button"
                    onClick={() => setVisInnlimingsBoks(!visInnlimingsBoks)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50/80 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    <Clipboard className="h-3.5 w-3.5" />
                    {visInnlimingsBoks ? 'Skjul innlimingsfelt' : 'Lim inn vurdering fra ChatGPT/Claude'}
                  </button>
                </div>
              )}

              {eksternStatusMelding && (
                <div className="rounded-lg bg-emerald-50 p-2.5 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {eksternStatusMelding}
                </div>
              )}

              {/* INNLIMINGSBOKS */}
              {visInnlimingsBoks && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <label className="text-xs font-bold text-slate-900">Lim inn vurderingen</label>
                  </div>
                  <textarea
                    value={innlimtTekst}
                    onChange={(e) => setInnlimtTekst(e.target.value)}
                    rows={6}
                    placeholder="Lim inn svaret fra ChatGPT eller Claude her..."
                    className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                  />
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      disabled={!innlimtTekst.trim()}
                      onClick={brukInnlimtTekst}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Bruk vurderingen
                    </button>
                    {innlimtSuksess && (
                      <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                        <Check className="h-4 w-4" /> Oppdatert
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 3. SENSORENS VURDERING (RESULTATKORT) */}
            {lasterSensor ? (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm space-y-3">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
                <p className="text-sm font-semibold text-slate-900">Vurderer prosjektet…</p>
              </div>
            ) : sensor ? (
              <div className="space-y-6">
                {/* 1-setnings konklusjon med opprinnelsesmerke */}
                <div className="rounded-xl border-2 border-blue-500 bg-blue-50/70 p-5 shadow-sm space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-blue-800">
                    <span>Vurdering</span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {sensor.steg === 2 && (
                        <span className="font-semibold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded border border-blue-300 text-[11px] normal-case">
                          2-stegs revisjon (revisor ➔ arkitekt)
                        </span>
                      )}
                      <span className="font-semibold text-slate-600 lowercase bg-white/90 px-2.5 py-0.5 rounded border border-blue-200">
                        {sensor.kilde === 'openai'
                          ? 'OpenAI gpt-4o-mini (direkte)'
                          : sensor.kilde === 'openai_proxy'
                          ? 'OpenAI gpt-4o-mini (via student-proxy)'
                          : sensor.kilde === 'bruker_innlimt'
                          ? 'ChatGPT / Claude (bruker-innlimt)'
                          : 'Lokal regelmotor (0 kr)'}
                      </span>
                    </div>
                  </div>
                  <p className="text-base font-semibold leading-relaxed text-slate-950">
                    «{sensor.konklusjon}»
                  </p>
                  {sensor.fallbackGrunn && (
                    <p className="text-xs text-amber-800 font-normal">
                      Merk: {sensor.fallbackGrunn}
                    </p>
                  )}
                </div>

                {sensor.begrunnelse && <p className="text-sm text-slate-700">{sensor.begrunnelse}</p>}
                {sensor.datagrunnlag && (
                  <p className="text-xs text-slate-600">
                    {sensor.datagrunnlag.antallTreff} kildetreff · {sensor.datagrunnlag.kilde === 'supabase' ? 'Database' : `Casebank (${sensor.datagrunnlag.antallCaser})`}
                    {sensor.datagrunnlag.merknad && ` · ${sensor.datagrunnlag.merknad}`}
                  </p>
                )}
                {!!sensor.evidens?.length && (
                  <details className="rounded-lg border border-slate-200 p-3 text-sm">
                    <summary className="cursor-pointer font-semibold">Kilder i vurderingen</summary>
                    <div className="mt-3 space-y-4">
                      {sensor.evidens.map(c => (
                        <div key={c.caseId} className="space-y-1">
                          <p className="font-semibold">{c.tittel} · {c.organisasjon}</p>
                          <p>Kildefunn: {c.resultat || c.oppnaaddResultat || 'Resultat er ikke dokumentert.'}</p>
                          <p>Vurdering: {c.relevans}</p>
                          <p>Begrensning: {c.begrensning}</p>
                          {c.mangler && <p>Ikke dokumentert: {c.mangler}</p>}
                          {c.kildeUrl && /^https?:\/\//i.test(c.kildeUrl) && <a href={c.kildeUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">Åpne kilde</a>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* 3 Harde Datakort */}
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" /> Solid fundament
                    </p>
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {sensor.styrker.map((s, idx) => (
                        <li key={idx} className="leading-snug">• {s}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-600" /> Kritiske gap
                    </p>
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {sensor.gap.map((g, idx) => (
                        <li key={idx} className="leading-snug">• {g}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-800 flex items-center gap-1.5">
                      <FlaskConical className="h-4 w-4 text-blue-600" /> Testoppsett & stoppregel
                    </p>
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {sensor.testoppsett.map((t, idx) => (
                        <li key={idx} className="leading-snug">• {t}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Fullstendig innlimt vurderingstekst hvis tilgjengelig */}
                {sensor.raatekst && (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                        Fullstendig KI-vurdering fra samtalen
                      </h4>
                      <span className="text-[11px] text-slate-500">Inkluderes i Handoff og Ledelsesnotat</span>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-4 text-xs font-sans text-slate-800 leading-relaxed whitespace-pre-wrap border border-slate-200 max-h-96 overflow-y-auto">
                      {sensor.raatekst}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setSteg(3)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" /> Tilbake til sjekkliste
              </button>
              <button
                type="button"
                onClick={() => setSteg(5)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Gå til ukeplan og handoff <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        )}

        {/* STEG 5: UKEPLAN & HANDOFF */}
        {steg === 5 && (
          <section className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-950">Denne uken</h2>
              <div className="space-y-2">
                {ukeoppgaver.map((oppg, idx) => {
                  const erFerdig = oppgaverFerdig[oppg.id];
                  return (
                    <label
                      key={oppg.id}
                      className="flex items-start gap-3 rounded-lg border border-slate-100 p-3.5 hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={!!erFerdig}
                        onChange={(e) => setOppgaverFerdig({ ...oppgaverFerdig, [oppg.id]: e.target.checked })}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <p className={`font-semibold text-slate-900 ${erFerdig ? 'line-through text-slate-400' : ''}`}>
                          {idx + 1}. {oppg.tittel}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Smidig FoU-Faseplan (MVP-Roadmap) */}
              <div className="border-t pt-5 mt-6 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-emerald-600" /> Videre plan
                  </h3>
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {studentEvaluering.modenhetNavn}
                  </span>
                </div>
                <div className="grid gap-2">
                  {studentEvaluering.mvpPlan.map((fase, i) => (
                    <div key={i} className="rounded-lg bg-slate-50 border border-slate-200/80 p-3 text-xs">
                      <p className="font-semibold text-slate-900">
                        <span className="text-blue-700">{fase.steg}</span> · {fase.tittel}
                      </p>
                      <p className="mt-1 text-slate-600">{fase.hvaSkalBevises}</p>
                      <p className="mt-1 text-slate-500">{fase.hvaSkalUtelates}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3 Rene Eksportknapper */}
              <div className="border-t pt-5 mt-6 grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => kopierTilUtklipp(lagKiPrompt(handoffPakke), 'ki')}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <Clipboard className="h-4 w-4" />
                  {kopiertType === 'ki' ? 'Kopiert!' : 'Kopier som KI-prompt'}
                </button>

                <button
                  type="button"
                  onClick={kopierLedelsesnotat}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Clipboard className="h-4 w-4" />
                  {kopiertType === 'notat' ? 'Kopiert!' : 'Kopier ledelsesnotat'}
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="h-4 w-4" />
                  Last ned PDF / Skriv ut
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setSteg(4)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" /> Tilbake til KI-sensor
              </button>
              <button
                type="button"
                onClick={toemFelter}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" /> Start ny idé
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
