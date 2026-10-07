import React, { useState } from 'react';
import {
  Sparkles,
  TrendingUp,
  ShieldCheck,
  BookOpen,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Loader2
} from 'lucide-react';
import {
  beregnDfoGevinst,
  evaluerStudentCase,
  kobleTilBackendLLM,
  STANDARD_AARSVERK_KR
} from './lib/engine';
import { EvalueringResultat } from './lib/types';

export default function App() {
  // 1 Idétekstboks + 2 Glidere for baseline og forventet tidsbesparelse
  const [prompt, setPrompt] = useState<string>('');
  const [timerPerUke, setTimerPerUke] = useState<number>(40);
  const [kuttProsent, setKuttProsent] = useState<number>(50);

  // Resultatvisning
  const [harKjort, setHarKjort] = useState<boolean>(false);
  const [lasterBackend, setLasterBackend] = useState<boolean>(false);
  const [evaluering, setEvaluering] = useState<EvalueringResultat | null>(null);

  // Momentan DFØ-kalkyle i klienten (0 tokens, ren deterministisk matematikk)
  const aktivGevinst = beregnDfoGevinst({ timerPerUke, kuttProsent });

  // Hold lokal evaluering og portvakter momentant oppdatert (0 ms, 0 tokens) når gliderne dras
  const oppdaterLokalEvaluering = (nyPrompt: string, nyTimer: number, nyKutt: number) => {
    if (!harKjort) return;
    const oppdatert = evaluerStudentCase({
      prompt: nyPrompt,
      timerPerUke: nyTimer,
      kuttProsent: nyKutt
    });
    setEvaluering((prev) => {
      if (!prev) return oppdatert;
      return {
        ...oppdatert,
        aiTilbakemelding: prev.aiTilbakemelding,
        referanseCaser:
          prev.referanseCaser && prev.referanseCaser.length > 0
            ? prev.referanseCaser
            : oppdatert.referanseCaser,
      };
    });
  };

  const kjoerEvaluering = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || lasterBackend) return;

    // 1. Momentan lokal evaluering (0 ms ventetid, 0 tokens)
    const lokalResultat = evaluerStudentCase({
      prompt,
      timerPerUke,
      kuttProsent
    });
    setEvaluering(lokalResultat);
    setHarKjort(true);
    setLasterBackend(true);

    // 2. Asynkron forankring mot backend / Supabase Edge Function / LLM (hvis aktiv)
    kobleTilBackendLLM(prompt, timerPerUke, kuttProsent)
      .then((backendRes) => {
        setEvaluering((prev) => {
          if (!prev) return prev;
          const oppdatertePortvakter =
            backendRes.portvakter && backendRes.portvakter.length > 0
              ? backendRes.portvakter
              : prev.portvakter;
          return {
            ...prev,
            gevinst: backendRes.gevinst || prev.gevinst,
            portvakter: oppdatertePortvakter,
            allePortvakterPassert:
              typeof backendRes.allePortvakterPassert === 'boolean'
                ? backendRes.allePortvakterPassert
                : oppdatertePortvakter.every((p) => p.passert),
            totalscore: backendRes.totalscore ?? prev.totalscore,
            modenhetstrinn: backendRes.modenhetstrinn ?? prev.modenhetstrinn,
            modenhetNavn: backendRes.modenhetNavn ?? prev.modenhetNavn,
            aiTilbakemelding: backendRes.aiTilbakemelding || prev.aiTilbakemelding,
            referanseCaser:
              backendRes.referanseCaser && backendRes.referanseCaser.length > 0
                ? backendRes.referanseCaser
                : prev.referanseCaser,
            mvp0Tips: backendRes.mvp0Tips || prev.mvp0Tips,
            mvpPlan: backendRes.mvpPlan || prev.mvpPlan
          };
        });
      })
      .catch(() => {
        // Forblir på den deterministiske lokale analysen
      })
      .finally(() => {
        setLasterBackend(false);
      });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl space-y-6">
        
        {/* Tittel & Enkelt hode */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200/70 text-slate-700 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5 text-slate-900" />
            DFØ Gevinstmotor & Empirisk Presedens
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Case- & Gevinstkalkulator
          </h1>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Test innovasjonsidéen mot dagens manuelle situasjon og se effekten målt etter offisiell DFØ-metodikk.
          </p>
        </div>

        {/* INNTAK: 1 Boks + 2 Glidere */}
        <form onSubmit={kjoerEvaluering} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              Hva er idéen eller problemet du vil løse?
            </label>
            <textarea
              required
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="F.eks: Vi vil bruke en språkmodell til å lage førsteutkast av saksrapporter forankret hos seksjonsleder. Saksbehandler godkjenner alltid manuelt. Vi har vurdert enklere maler først..."
              className="w-full p-3.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50/50 resize-y"
            />
            <div className="flex flex-wrap gap-1.5 mt-2 text-[11px] text-slate-500">
              <span className="font-medium text-slate-600">Portvakt-tips i teksten:</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">fagleder/prosesseier</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">enklere maler vurdert</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">saksbehandler godkjenner (HITL)</span>
            </div>
          </div>

          {/* De to eneste gliderne: Dagens timer og forventet kutt */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
              <div className="flex justify-between items-center text-xs font-medium text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                  Dagens manuelle tidsbruk:
                </span>
                <span className={`font-bold text-sm ${timerPerUke === 0 ? 'text-amber-600' : 'text-slate-900'}`}>
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
                  oppdaterLokalEvaluering(prompt, v, kuttProsent);
                }}
                className="w-full accent-slate-900 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400">
                {timerPerUke === 0 ? 'Mangler baseline (Portvakt 2 vil stoppe prosjektet).' : 'Timer teamet bruker på oppgaven i dag (nullalternativ).'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
              <div className="flex justify-between items-center text-xs font-medium text-slate-600">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                  Forventet tidsbesparelse:
                </span>
                <span className="font-bold text-slate-900 text-sm">{kuttProsent}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={kuttProsent}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setKuttProsent(v);
                  oppdaterLokalEvaluering(prompt, timerPerUke, v);
                }}
                className="w-full accent-slate-900 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400">Andel av manuell tid løsningen kan avlaste.</p>
            </div>
          </div>

          {/* Momentan live DFØ-kalkyle i formen mens gliderne dras (0 ms, 0 tokens) */}
          <div className="flex flex-col sm:flex-row items-center justify-between text-xs px-3.5 py-2.5 rounded-xl bg-slate-100/80 text-slate-700 border border-slate-200/60 gap-1.5">
            <span className="flex items-center gap-1.5 font-medium text-slate-800">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              Momentan DFØ-kalkyle:
            </span>
            <span className="font-semibold text-slate-900">
              {aktivGevinst.timerFrigjortPerUke} t/uke &bull; {aktivGevinst.aarsverkFrigjort} årsverk &bull; {aktivGevinst.aarligKapasitetsverdiKr.toLocaleString('no-NO')} kr/år ({aktivGevinst.gevinstkategori})
            </span>
          </div>

          <button
            type="submit"
            disabled={lasterBackend || !prompt.trim()}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-medium text-sm rounded-xl transition shadow flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {lasterBackend ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Kobler til sensor...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Evaluer Idé & Beregn Gevinst
              </>
            )}
          </button>
        </form>

        {/* RESULTAT */}
        {harKjort && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Overordnet Vurderingsstatus & Modenhetstrinn */}
            {evaluering && (
              <div
                className={`p-4 rounded-2xl border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  evaluering.allePortvakterPassert
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : 'bg-amber-50/70 border-amber-200 text-amber-950'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    {evaluering.allePortvakterPassert ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Klar for videre modning: {evaluering.modenhetNavn}</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                        <span>Stoppet av portvakt: {evaluering.modenhetNavn}</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-slate-600">
                    {evaluering.allePortvakterPassert
                      ? 'Alle 4 portvakter er passert. Prosjektet oppfyller kravene til en forsvarlig pilot.'
                      : 'Ett eller flere ufravikelige krav må utredes før prosjektet kan anbefales for pilotering.'}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span
                    className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full border ${
                      evaluering.allePortvakterPassert
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                    }`}
                  >
                    {evaluering.totalscore}/100 poeng
                  </span>
                </div>
              </div>
            )}

            {/* Gevinsttall */}
            {(() => {
              const visningsGevinst = evaluering?.gevinst ?? aktivGevinst;
              return (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                      DFØ Gevinstkalkyle mot Nullalternativet
                    </div>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-100">
                      {visningsGevinst.gevinstkategori}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="text-xl sm:text-2xl font-bold text-slate-900">{visningsGevinst.timerFrigjortPerUke} t</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">frigjort per uke</div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="text-xl sm:text-2xl font-bold text-slate-900">{visningsGevinst.aarsverkFrigjort}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">årsverk kapasitet</div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100">
                      <div className="text-xl sm:text-2xl font-bold text-emerald-800">
                        {visningsGevinst.aarligKapasitetsverdiKr.toLocaleString('no-NO')}{' '}
                        kr
                      </div>
                      <div className="text-[11px] text-emerald-700 mt-0.5">est. årlig verdi</div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 text-center">
                    Beregnet med DFØ-sjablong (1 årsverk = 1 750 t = {STANDARD_AARSVERK_KR.toLocaleString('no-NO')} kr) over 46 arbeidsuker.
                  </p>
                </div>
              );
            })()}

            {/* Sjekkpunkter & Portvakter - Dynamisk fra motor */}
            {evaluering && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-slate-700" />
                  De 4 ufravikelige portvaktene (Kvalitetssikring)
                </div>

                <ul className="text-xs text-slate-600 space-y-2.5 divide-y divide-slate-100">
                  {evaluering.portvakter.map((p, idx) => (
                    <li key={idx} className="pt-2 flex items-start justify-between gap-3">
                      <div>
                        <strong className="text-slate-800">{p.navn}:</strong>
                        <p className="text-slate-500 mt-0.5">{p.begrunnelse || p.beskrivelse}</p>
                      </div>
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 rounded shrink-0 flex items-center gap-1 ${
                          p.passert
                            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                            : p.status === 'HITL KRAV'
                            ? 'text-blue-700 bg-blue-50 border border-blue-200'
                            : 'text-amber-700 bg-amber-50 border border-amber-200'
                        }`}
                      >
                        {p.passert ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        {p.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sensorvurdering (Innovasjonssensor & AI-tilbakemelding) */}
            {evaluering && (evaluering.aiTilbakemelding || lasterBackend) && (
              <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6 space-y-2 bg-gradient-to-br from-white to-indigo-50/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-indigo-950">
                    <Sparkles className="h-4 w-4 text-indigo-600" />
                    Sensorvurdering (Innovasjonssensor)
                  </div>
                  {lasterBackend && (
                    <span className="text-[11px] text-indigo-600 animate-pulse font-medium flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Kobler til sensor...
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                  {evaluering.aiTilbakemelding}
                </p>
              </div>
            )}

            {/* Empirisk presedens fra 3 168 caser */}
            {evaluering && evaluering.referanseCaser.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <BookOpen className="h-4 w-4 text-indigo-600" />
                  Dokumentert presedens fra erfaringsbasen (3 168 case)
                </div>
                <p className="text-xs text-slate-500">
                  Lignende prosjekter som har målt effekt mot nullalternativet i offentlig og privat sektor:
                </p>

                <div className="space-y-3 pt-1">
                  {evaluering.referanseCaser.slice(0, 2).map((refCase, idx) => (
                    <div key={idx} className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-xs text-slate-900">{refCase.tittel}</div>
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono shrink-0">
                          {refCase.evidens}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">{refCase.organisasjon}</div>
                      <p className="text-xs text-slate-700 font-medium">
                        {refCase.oppnaaddResultat || refCase.maaltResultat}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MVP 0 Anbefaling */}
            <div className="p-4 rounded-xl bg-slate-900 text-white text-xs space-y-1.5 shadow">
              <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                <Lightbulb className="h-4 w-4 text-amber-400" />
                Anbefalt MVP 0 (Neste skritt før koding):
              </div>
              <p className="text-slate-300 leading-relaxed">
                {evaluering?.mvp0Tips ||
                  'Test manuelt på 5 reelle saker sammen med en saksbehandler i 1 uke før du investerer i kode eller API-er. Bevis at sluttbrukeren faktisk sparer tid på formatet.'}
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

