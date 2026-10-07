# Bestilling og Arkitekturveiledning til Lovable: Case- og Gevinstkalkulator

Kjære Lovable-bygger. Dette repoet inneholder **hele det empiriske datagrunnlaget** på **3 168 innovasjonscaser** og **13 965 evidenspåstander** fra UK ATRS, OECD og internasjonale registre, kombinert med en **100 % deterministisk DFØ-gevinstmotor**.

Dette dokumentet gir deg en konkret, profesjonell veiledning for arkitektur, database, backend og LLM-kobling, **samtidig som du har full frihet til å utforme det beste UI/UX-et**.

---

## 1. Ditt Mandat & UI-frihet

Du har full frihet til å velge komponenter, styling og layout (f.eks. med shadcn/ui, Tailwind CSS, Lucide-ikoner og interaktive KPI-grafer).

### Kjerneflytens gylne regel: Radikal enkelhet i inntaket
Studenter, rådgivere og ledere skal **ikke** overveldes med et skjemavelde. Hold inntaket radikalt enkelt:
1. **1 tekstfelt:** "Hva er idéen eller problemet du vil løse?" (studentens fritekst, med diskrete portvakt-tips).
2. **2 glidere / tall:**
   - **Dagens manuelle tidsbruk (baseline / nullalternativ):** F.eks. 40 timer/uke (intervall: 0–200 t/uke, der 0 t/uke synliggjør manglende baseline og utløser Portvakt 2-stopp).
   - **Forventet tidsbesparelse:** F.eks. 50 % (intervall: 10–90 %).
   - **Momentan live-kalkyle under gliderne:** Viser umiddelbar effekt i sanntid (0 ms, 0 tokens) mens gliderne dras, før formen sendes inn.

### Hva brukeren skal få tilbake:
1. **Overordnet Status & Modenhetstrinn (0–100 poeng):** Viser umiddelbart om prosjektet er "Klar for videre modning (Trinn 3: Pilotklar)" eller "Stoppet av portvakt (Trinn 1: Idéstadium)" med poengscore.
2. **DFØ Gevinstkalkyle mot Nullalternativet:** Frigjorte timer per uke, frigjort årskapasitet i årsverk, og estimert årlig kapasitetsverdi i kroner (850 000 kr/årsverk).
3. **De 4 Ufravikelige Portvaktene:** Sjekkpunkter for prosesseier, dokumentert baseline, ikke-KI alternativer og menneskelig kontroll (HITL), deterministisk evaluert fra tekst og glidere.
4. **Sensorvurdering (AI-tilbakemelding):** En streng, konstruktiv tilbakemelding fra innovasjonssensoren forankret i de 4 portvaktene.
5. **Dokumentert Empirisk Presedens:** 2–3 faktiske prosjekter fra de 3 168 casene med rapporterte måltall (f.eks. timebesparelse eller automatisering).
6. **Anbefalt MVP 0 (Neste skritt):** Konkret forslag til en 1-ukes manuell test på 5 faktiske saker før det skrives kode.

---

## 2. Deterministisk DFØ-kalkyle (0 tokens, momentan respons)

Beregningen skal skje **umiddelbart i nettleseren** når brukeren endrer gliderne, uten ventetid eller token-kostnader. Beregningen følger Direktoratet for forvaltning og økonomistyrings (DFØ) veileder for samfunnsøkonomiske analyser:

- **1 standard offentlig årsverk:** 1 750 arbeidstimer per år.
- **Effektive arbeidsuker:** 46 uker per år.
- **Sjablongverdi for årsverk:** 850 000 kr inkl. sosiale kostnader og overhead.

### Formel (implementert i `src/lib/engine.ts`):
```typescript
const timerFrigjortPerUke = Math.round((timerPerUke * kuttProsent) / 100);
const timerFrigjortPerAar = timerFrigjortPerUke * 46;
const aarsverkFrigjort = Math.round((timerFrigjortPerAar / 1750) * 10) / 10;
const aarligKapasitetsverdiKr = Math.round(aarsverkFrigjort * 850000);
const gevinstkategori = aarsverkFrigjort >= 0.5 ? 'Kapasitetsgevinst' : 'Tidsgevinst';
```

---

## 3. Felles JSON-Kontrakt (Frontend, Edge Function, API)

For å sikre at klienten, Supabase Edge Function og en eventuell lokal Python-backend snakker samme språk, gjelder følgende standardiserte datakontrakt:

```typescript
export interface EvalueringRespons {
  status: "suksess" | "lokal_deterministisk";
  allePortvakterPassert: boolean;
  totalscore: number;            // 0 - 100
  modenhetstrinn: number;        // 0 - 6
  modenhetNavn: string;
  gevinst: {
    timerFrigjortPerUke: number;
    timerFrigjortPerAar: number;
    aarsverkFrigjort: number;
    aarligKapasitetsverdiKr: number;
    gevinstkategori: "Kapasitetsgevinst" | "Tidsgevinst";
    // Bakoverkompatible aliaser
    timerFrigjortUke?: number;
    timerFrigjortAar?: number;
    verdiKr?: number;
  };
  portvakter: {
    navn: string;
    passert: boolean;
    status: string;
    begrunnelse: string;
    beskrivelse?: string;
  }[];
  referanseCaser: {
    tittel: string;
    organisasjon: string;
    oppnaaddResultat: string;
    maaltResultat?: string;
    evidens: string;
    kilde?: string;
    kildeUrl?: string;
  }[];
  aiTilbakemelding?: string;
  mvp0Tips?: string;
  mvpPlan?: {
    steg: string;
    tittel: string;
    hvaSkalBevises: string;
    hvaSkalUtelates: string;
  }[];
}
```

---

## 4. Hvor ligger dataene og hvordan importere dem?

Alle datafiler er klare i repoet (alle under 100 MB per fil, GitHub- og Supabase-klare):
- `public/data/cases.csv` (18 MB): Alle 3 168 case med samtlige 120 kolonner (intakt referansebase).
- `public/data/cases.jsonl` (85 MB): Komplett fulltekstversjon.
- `public/data/evidenskart.csv` (5 MB): 13 965 atomære måltall og påstander.
- `supabase/data/cases_seed.csv` (3.7 MB): **Klar for 1-sekunds import!** Inneholder nøyaktig de 18 kolonnene som matcher tabellen `public.cases`.
- `supabase/migrations/20261007_init.sql`: Komplett PostgreSQL DDL med tabeller, RLS, GIN-fulltekstindekser og stored procedure `search_cases`.

### Importere data til Supabase PostgreSQL:
```sql
-- 1. Kjør supabase/migrations/20261007_init.sql i Supabase SQL Editor

-- 2. Importer cases (3 168 rader) via psql eller Supabase UI:
\copy public.cases FROM 'supabase/data/cases_seed.csv' WITH (FORMAT csv, HEADER);

-- 3. Importer evidenskart (13 965 påstander):
\copy public.evidenskart (case_id, paastand, paastandstype, har_maaltall, vurdert_av, evidensstyrke, kilde, kilde_url, kunnskapslag) FROM 'supabase/data/evidenskart.csv' WITH (FORMAT csv, HEADER);
```

---

## 5. PostgreSQL Fulltekstsøk på 3 168 case (`search_cases`)

I `supabase/migrations/20261007_init.sql` er RPC-funksjonen `search_cases` konfigurert for å tåle reelle brukerprompter:
1. **Presist søk:** Prøver først `plainto_tsquery('norwegian', ...)`.
2. **OR-nøkkelordsøk:** Hvis brukeren skriver en 20-ords studentidé, trekkes de viktigste nøkkelordene ut og matches med `OR` (`token:* | token:*`).
3. **Evidens-fallback:** Hvis ingen ord matcher, returneres de sterkest dokumenterte casene med måltall i stedet for 0 rader.

### Hvordan kalle den fra Lovable / Supabase Client:
```typescript
import { supabase } from "@/integrations/supabase/client";

export async function finnRelevanteCaser(prompt: string) {
  const { data, error } = await supabase.rpc("search_cases", {
    query_text: prompt,
    limit_count: 3
  });

  if (error) {
    console.error("Feil ved henting av caser:", error);
    return [];
  }
  return data;
}
```

---

## 6. Supabase Edge Function: `evaluate`

En ferdig, ren Edge Function er plassert i `supabase/functions/evaluate/index.ts`. Den:
1. Håndterer CORS og parameter-aliasing (`timerPerUke` og `timer_per_uke`).
2. Utfører den deterministiske DFØ-kalkylen (0 tokens).
3. Henter de 2–3 mest relevante casene via `search_cases`.
4. Sender en strukturert sensor-instruks til LLM (OpenAI / Anthropic) dersom API-nøkkel finnes i Supabase Secrets.
5. Returnerer det standardiserte JSON-objektet til klienten.

### Kalle Edge Function fra Lovable:
```typescript
const { data, error } = await supabase.functions.invoke("evaluate", {
  body: {
    prompt: studentensIde,
    timerPerUke: timerPerUke,
    kuttProsent: kuttProsent
  }
});
```

---

## 7. Systemprompter for LLM (Innovasjonssensor)

Når du kobler til en språkmodell (via Supabase Edge Function eller Lovable AI Assistant), **SKAL** modellen instrueres som en streng og konstruktiv sensor som følger de 4 ufravikelige portvaktene fra prosjektets rammeverk (`AGENTS.md`):

### Sensor System Prompt:
```text
Du er en streng og konstruktiv sensor for business caser innen offentlig og privat innovasjon (iht. DFØs gevinstrealisering og smidig FoU).

Vurder studentens idé opp mot de 4 ufravikelige portvaktene:
1. Prosesseier i linjen: Må ha en navngitt leder forankret med budsjett- og gevinstansvar. Uten prosesseier stoppes prosjektet.
2. Nullalternativ (Baseline): Dagens manuelle tidsbruk danner det dokumenterte sammenligningsgrunnlaget.
3. Ikke-KI vurdert først: Enklere regelbaserte alternativer, fagsystem-forbedringer eller skjemamaler må være vurdert før maskinlæring/språkmodeller tas i bruk.
4. Menneskelig kontroll (HITL): Saksbehandler må beholde fullt ansvar og overprøvingsrett ved enkeltvedtak og innbyggerkontakt.

Her er 2-3 dokumenterte referansecaser fra datagrunnlaget (3 168 case) med faktiske måltall:
{{REFERANSECASER}}

Format på tilbakemeldingen (norsk, maksimalt 130 ord):
- Sensorvurdering: 2 korte setninger om hva forslaget må passe på (hovedrisiko og hvilken portvakt som må avklares).
- MVP 0-anbefaling: Én konkret, 1-ukes manuell test på 5 reelle saker sammen med en saksbehandler UTEN å bygge kode eller API-er.
```

### Hvorfor denne prompten virker:
- **Null hallusinering av måltall:** Modellen får de faktiske måltallene servert fra `search_cases`, så den behøver ikke finne på tall.
- **Jordnær og operativ:** Den tvinger studenten til å tenke MVP 0 (manuell sjekk) før det brukes budsjett på koding.

---

## 8. Oppsettssjekkliste for Lovable

1. **Database:** Kjør migrasjonsfilen `supabase/migrations/20261007_init.sql` i Supabase SQL Editor.
2. **Dataimport:** Importer `supabase/data/cases_seed.csv` til tabellen `public.cases`.
3. **Secrets:** Sett eventuell `OPENAI_API_KEY` under Supabase Project Settings -> Edge Functions -> Secrets (valgfritt; appen fungerer 100 % deterministisk uten).
4. **Deploy Edge Function:** Deploy mappen `supabase/functions/evaluate/`.
5. **Frontend:** Bygg og test lokalt med `npm run build` og deploy via Lovable.
