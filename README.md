# Case Evaluator & DFØ Gevinstmotor (Lovable & Supabase MVP)

Minimalistisk, deterministisk evaluerings- og gevinstmotor for studenter, rådgivere og sensorer som tester innovasjons- og KI-ideer mot DFØ-metodikk og 3 168 empiriske caser.

## Arkitektur & Teknologistack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons.
- **Deterministisk kjerne:** `src/lib/engine.ts` og `src/lib/types.ts` kjører 100 % lokalt i klienten (0 tokens, 0 ventetid).
- **Backend / Edge Function:** `supabase/functions/evaluate/index.ts` for Deno/Supabase med deterministisk DFØ-kalkyle, PostgreSQL Full-Text Search og forankret LLM-sensor.
- **Datagrunnlag:** 3 168 case og 13 965 evidenspåstander under `public/data/` og `supabase/data/` (godt under 100 MB per fil).
- **Database DDL:** `supabase/migrations/20261007_init.sql` med tabeller, GIN-indekser og RPC-funksjon `search_cases`.

## Kjernefunksjoner

1. **Radikalt enkelt inntak (Studentreise):**
   - 1 idétekstboks for problembeskrivelse.
   - 2 glidere: Dagens manuelle tidsbruk (baseline / nullalternativ) og forventet tidsbesparelse.
2. **Deterministisk DFØ Gevinstmotor:**
   - Momentan beregning i klienten: Frigjorte timer/uke, årsverk kapasitet og estimert årlig verdi i kroner (DFØ-sjablong: 850 000 kr/årsverk, 1 750 timer, 46 arbeidsuker).
3. **De 4 ufravikelige portvaktene:**
   - Prosesseier i faglinjen (stoppregel hvis uavklart).
   - Dokumentert nullalternativ (baseline).
   - Vurdering av enklere ikke-KI alternativer før språkmodeller.
   - Menneskelig kontroll (Human-in-the-loop ved vedtak/saksbehandling).
4. **Empirisk presedens (3 168 case):**
   - Viser reelle referansecaser fra UK ATRS, OECD og internasjonale registre med faktiske måltall.
5. **Jordnært neste steg (MVP 0):**
   - Anbefaling om 1-ukes manuell test på 5 faktiske saker før investering i kode eller API-er.

## Kjøring og Bygging

```bash
cd app
npm install
npm run build   # Bygger 100 % rent med Vite og TypeScript
npm run dev     # Starter lokal utviklingsserver
```

## Lovable Bestillingsveiledning

Se [`LOVABLE_PROMPT.md`](./LOVABLE_PROMPT.md) for fullstendig arkitekturveiledning, systemprompter for sensor-rollen, og SQL fulltekstsøk-eksempler.
