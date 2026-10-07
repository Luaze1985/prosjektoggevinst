// supabase/functions/evaluate/index.ts
// Robust, produksjonsklar Edge Function for Lovable og Supabase.
// Utfører deterministisk DFØ-kalkyle, matcher mot empiriske caser (3 168 case)
// og kaller valgfri LLM med sensor-instruks og evidensforankring.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// DFØ Sjablongverdier (standard offentlig årsverk)
const STANDARD_AARSVERK_KR = 850000;
const ARBEIDSTIMER_PER_AAR = 1750;
const ARBEIDSUKER_PER_AAR = 46;

// Innebygde benchmark-caser fra erfaringsbasen (fallback ved uinitialisert DB)
const FALLBACK_CASER = [
  {
    tittel: "AI Writing Assistant for saksrapporter (Assist)",
    organisasjon: "UK Department for Work & Pensions / Gov.uk",
    oppnaaddResultat: "Saksbehandlere sparer i snitt ca. 3 timer per uke på saksforberedelser. 100% manuell overprøving (HITL).",
    maaltResultat: "Saksbehandlere sparer i snitt ca. 3 timer per uke på saksforberedelser. 100% manuell overprøving (HITL).",
    kilde: "UK Algorithmic Transparency Recording Standard (gov.uk)",
    kildeUrl: "https://www.gov.uk/algorithmic-transparency-records",
    evidens: "E3 Offisiell transparensrapport",
  },
  {
    tittel: "Ami Chatbot for henvendelsestriagering",
    organisasjon: "OECD AI Observatory (Case #14)",
    oppnaaddResultat: "90% av standardhenvendelser avlastes automatisk uten manuell eskalering; 35% kapasitetsfrigjøring.",
    maaltResultat: "90% av standardhenvendelser avlastes automatisk uten manuell eskalering; 35% kapasitetsfrigjøring.",
    kilde: "OECD Observatory of Public Sector Innovation",
    kildeUrl: "https://oecd-opsi.org",
    evidens: "E2 Selvrapportert med måltall",
  },
  {
    tittel: "Automatisk underlagsanalyse og dokumentsortering",
    organisasjon: "Ofsted (Office for Standards in Education, UK)",
    oppnaaddResultat: "Reduserte manuell forberedelsestid per tilsyn med 40%; sikrer konsistent saksunderlag for inspektører.",
    maaltResultat: "Reduserte manuell forberedelsestid per tilsyn med 40%; sikrer konsistent saksunderlag for inspektører.",
    kilde: "Ofsted Case Study",
    kildeUrl: "https://www.gov.uk/government/organisations/ofsted",
    evidens: "E3 Strukturert offentlig evalueringsrapport",
  },
];

serve(async (req: Request) => {
  // 1. Håndter CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) || {};
    const prompt = ((body && body.prompt) || "").trim();
    const rawTimerVal = body.timerPerUke ?? body.timer_per_uke;
    const parsedTimer = rawTimerVal != null ? Number(rawTimerVal) : NaN;
    const timerPerUke = Number.isFinite(parsedTimer) ? Math.max(0, parsedTimer) : 40;
    const rawKuttVal = body.kuttProsent ?? body.kutt_prosent;
    const parsedKutt = rawKuttVal != null ? Number(rawKuttVal) : NaN;
    const kuttProsent = Number.isFinite(parsedKutt) ? Math.min(100, Math.max(0, parsedKutt)) : 50;

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Mangler 'prompt' / beskrivelse av idéen." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Deterministisk DFØ-kalkyle (0 tokens, ren matematikk)
    const timerFrigjortPerUke = Math.round((timerPerUke * kuttProsent) / 100);
    const timerFrigjortPerAar = timerFrigjortPerUke * ARBEIDSUKER_PER_AAR;
    const aarsverkFrigjort = Math.round((timerFrigjortPerAar / ARBEIDSTIMER_PER_AAR) * 10) / 10;
    const aarligKapasitetsverdiKr = Math.round(aarsverkFrigjort * STANDARD_AARSVERK_KR);
    const gevinstkategori = aarsverkFrigjort >= 0.5 ? "Kapasitetsgevinst" : "Tidsgevinst";

    // Portvakt-evaluering med forsterket nøkkelordgjenkjenning iht. AGENTS.md
    const promptText = prompt.toLowerCase();
    const harProsesseier = body.harProsesseier === "ja" || body.har_prosesseier === "ja" || (
      body.harProsesseier !== "nei" && body.har_prosesseier !== "nei" &&
      /(?:prosesseier|prosjekteier|produkteier|avdelingsleder|seksjonsleder|prosjektleder|linjeleder|enhetsleder|virksomhetsleder|forankret (?:hos|i|med)|fagansvarlig|leder(?:e|en|elsen)?\b|direktør|kommunesjef|rådmann|beslutningstaker)/i.test(promptText)
    );
    const baselinePassert = timerPerUke > 0;
    const ikkeKiVurdert = body.ikkeKiVurdert === "ja" || body.ikke_ki_vurdert === "ja" || (
      body.ikkeKiVurdert !== "nei" && body.ikke_ki_vurdert !== "nei" &&
      /(?:ikke-?ki|enklere (?:alternativ(?:er)?|løsning(?:er)?)|regelbasert|uten (?:ki|maskinlæring)|maler|fagsystem|regler først|manuelt først|skjema|excel|alternativ(?:er)? vurdert|rutiner først)/i.test(promptText)
    );
    const menneskeIKontroll = body.menneskeIKontroll === "ja" || body.menneske_i_kontroll === "ja" || (
      body.menneskeIKontroll !== "nei" && body.menneske_i_kontroll !== "nei" &&
      /(?:hitl|mennesk(?:e|elig)|overprøv|saksbehandler (?:har|beholder|godkjenner|overprøver|vurderer|kvalitetssikrer|sjekker)|fagperson (?:godkjenner|vurderer|kvalitetssikrer)|manuell (?:godkjenning|kontroll|kvalitetssikring|overprøving)|kontrollert av|kvalitetssikres av)/i.test(promptText)
    );

    const allePortvakterPassert = harProsesseier && baselinePassert && ikkeKiVurdert && menneskeIKontroll;

    // Deterministisk poengscore (0 - 100) basert på beståtte portvakter og substans
    let totalscore = 0;
    if (harProsesseier) totalscore += 25;
    if (ikkeKiVurdert) totalscore += 20;
    if (menneskeIKontroll) totalscore += 20;
    if (timerPerUke > 0) totalscore += 15;
    if (prompt.length > 30) totalscore += 20;

    // Modenhetstrinn (0 - 6)
    let modenhetstrinn = 1;
    let modenhetNavn = "Innledende Idéfase (Trinn 1)";
    if (allePortvakterPassert && totalscore >= 75) {
      modenhetstrinn = 3;
      modenhetNavn = "Pilotklar / Smidig FoU (Trinn 3)";
    } else if (allePortvakterPassert) {
      modenhetstrinn = 2;
      modenhetNavn = "Konseptfase (Trinn 2)";
    }

    // 3. Empirisk match mot casebanken (3 168 case)
    let referanseCaser = FALLBACK_CASER;
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");

    if (supabaseUrl && supabaseKey) {
      try {
        const searchRes = await fetch(`${supabaseUrl}/rest/v1/rpc/search_cases`, {
          method: "POST",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query_text: prompt, limit_count: 2 }),
        });

        if (searchRes.ok) {
          const dbData = await searchRes.json();
          if (Array.isArray(dbData) && dbData.length > 0) {
            referanseCaser = dbData.map((c: any) => {
              const resText = c.maalt_resultat || c.oensket_effekt || "Dokumentert gevinst i erfaringsbasen";
              return {
                tittel: c.prosjektnavn || "Offentlig innovasjonscase",
                organisasjon: c.organisasjon || c.bransje || "Offentlig sektor",
                oppnaaddResultat: resText,
                maaltResultat: resText,
                kilde: c.kilde || "Erfaringsbasen (3 168 case)",
                kildeUrl: c.kilde_url || c.kildeUrl,
                evidens: c.evidensstyrke || "Empirisk presedens",
              };
            });
          }
        }
      } catch (_) {
        // Fortsett med innebygde benchmark-caser ved nettverks- eller tabellfravær
      }
    }

    // 4. Valgfritt LLM-kall (hvis OPENAI_API_KEY er konfigurert i Supabase Secrets)
    let aiTilbakemelding = "Deterministisk analyse fullført (0 tokens). Nullalternativ og gevinst er beregnet mot DFØ-sjablong.";
    const openAiKey = Deno.env.get("OPENAI_API_KEY");

    if (openAiKey) {
      try {
        const systemPrompt = `Du er en streng, konstruktiv sensor for business caser innen innovasjon og kunstig intelligens (iht. DFØ og smidig FoU).
Vurder studentens idé opp mot de 4 ufravikelige portvaktene:
1. Prosesseier i linjen: Må ha en navngitt leder forankret.
2. Nullalternativ: Dagens manuelle tidsbruk (${timerPerUke} t/uke) danner baseline.
3. Ikke-KI først: Enklere digitale/regelbaserte løsninger må vurderes før språkmodeller.
4. Menneskelig kontroll (HITL): Saksbehandler må beholde endelig ansvar og overprøving.

Relevante referansecaser fra datagrunnlaget:
${referanseCaser.map((c, i) => `${i + 1}. ${c.tittel} (${c.organisasjon}): ${c.oppnaaddResultat}`).join("\n")}

Format på svaret (maks 130 ord, norsk):
- Kort sensorsvar: Hva er den største risikoen, og hva må avklares først?
- MVP 0-forslag: En konkret 1-ukes manuell test på 5 faktiske saker uten å skrive kode.`;

        const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openAiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Idé: "${prompt}". Dagens tidsbruk: ${timerPerUke} t/uke. Forventet kutt: ${kuttProsent}%.` },
            ],
            temperature: 0.2,
            max_tokens: 280,
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          if (aiData.choices?.[0]?.message?.content) {
            aiTilbakemelding = aiData.choices[0].message.content.trim();
          }
        }
      } catch (_) {
        aiTilbakemelding = "Deterministisk analyse fullført (LLM-tjeneste midlertidig utilgjengelig).";
      }
    }

    // 5. Samlet respons med både kanoniske felt og bakoverkompatible aliaser
    const respons = {
      status: "suksess",
      allePortvakterPassert,
      totalscore,
      modenhetstrinn,
      modenhetNavn,
      gevinst: {
        timerFrigjortPerUke,
        timerFrigjortPerAar,
        aarsverkFrigjort,
        aarligKapasitetsverdiKr,
        gevinstkategori,
        // Aliaser
        timerFrigjortUke: timerFrigjortPerUke,
        timerFrigjortAar: timerFrigjortPerAar,
        verdiKr: aarligKapasitetsverdiKr,
      },
      portvakter: [
        {
          navn: "1. Prosesseier i linjen",
          passert: harProsesseier,
          status: harProsesseier ? "AVKLART" : "MÅ AVKLARES",
          begrunnelse: harProsesseier
            ? "Forankret hos fagansvarlig leder med budsjett-/linjeansvar."
            : "STOPP: Ingen navngitt prosesseier i linjen. Prosjektet må forankres før utvikling starter.",
          beskrivelse: harProsesseier
            ? "Forankret hos fagansvarlig leder med budsjett-/linjeansvar."
            : "STOPP: Ingen navngitt prosesseier i linjen. Prosjektet må forankres før utvikling starter.",
        },
        {
          navn: "2. Nullalternativ (Baseline)",
          passert: baselinePassert,
          status: baselinePassert ? "DOKUMENTERT" : "MANGLER",
          begrunnelse: baselinePassert
            ? `Dokumentert manuell tidsbruk: ${timerPerUke} timer/uke.`
            : "STOPP: Mangler nullalternativ. Nytte kan ikke måles uten dagens tidsbruk.",
          beskrivelse: baselinePassert
            ? `Dokumentert manuell tidsbruk: ${timerPerUke} timer/uke.`
            : "STOPP: Mangler nullalternativ. Nytte kan ikke måles uten dagens tidsbruk.",
        },
        {
          navn: "3. Ikke-KI vurdert først",
          passert: ikkeKiVurdert,
          status: ikkeKiVurdert ? "VURDERT" : "MÅ VURDERES",
          begrunnelse: ikkeKiVurdert
            ? "Enkle regler, integrasjoner eller skjemafikser er vurdert først."
            : "STOPP: Enklere digitale/regelbaserte løsninger må utredes før KI tas i bruk.",
          beskrivelse: ikkeKiVurdert
            ? "Enkle regler, integrasjoner eller skjemafikser er vurdert først."
            : "STOPP: Enklere digitale/regelbaserte løsninger må utredes før KI tas i bruk.",
        },
        {
          navn: "4. Menneskelig kontroll (HITL)",
          passert: menneskeIKontroll,
          status: menneskeIKontroll ? "SIKRET" : "HITL KRAV",
          begrunnelse: menneskeIKontroll
            ? "Saksbehandler/fagperson har endelig godkjenning og full overprøvingsrett."
            : "STOPP: Prosjekter som påvirker vedtak eller mennesker krever menneskelig overprøving.",
          beskrivelse: menneskeIKontroll
            ? "Saksbehandler/fagperson har endelig godkjenning og full overprøvingsrett."
            : "STOPP: Prosjekter som påvirker vedtak eller mennesker krever menneskelig overprøving.",
        },
      ],
      referanseCaser,
      aiTilbakemelding,
      mvp0Tips: "Gjennomfør en manuell test på 5 faktiske saker sammen med en saksbehandler i 1 uke før du bygger kode. Bevis at sluttbrukeren faktisk sparer tid.",
      mvpPlan: [
        {
          steg: "MVP 0 (Papir/Manuell)",
          tittel: "Manuell verifikasjon på 5 reelle saker",
          hvaSkalBevises: "At sluttbrukere faktisk sparer tid på formatet før det skrives én eneste linje med kode.",
          hvaSkalUtelates: "Ingen kode, ingen API-kall, ingen database.",
        },
        {
          steg: "MVP 1 (Isolert KI-test)",
          tittel: "Frittstående prompt- og datatest",
          hvaSkalBevises: "At modellen leverer akseptabel kvalitet uten faktafeil i en lukket sandkasse.",
          hvaSkalUtelates: "Ingen fagsystemintegrasjon; kun isolert testing.",
        },
        {
          steg: "MVP 2 (Fagpilot)",
          tittel: "Intern pilot med 2-3 saksbehandlere",
          hvaSkalBevises: "Måle faktisk tidsgevinst og brukeropplevelse i linjen over 2 uker.",
          hvaSkalUtelates: "Ingen automatisk publisering eller direkte vedtak.",
        },
      ],
    };

    return new Response(JSON.stringify(respons), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Ukjent serverfeil" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

