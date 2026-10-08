# Handoff: Prosjektoggevinst — Sanering av Støy og Tekstoverflod

**Dato:** 2026-10-08  
**Mål for neste sesjon:** Brukerens klare tilbakemelding: *«Dette er for generisk. For rotete. For mye info.»* Neste sesjon må rydde opp, fjerne overflødig tekst, eliminere generisk rådgiverspråk og gjøre brukergrensesnittet ekstremt stramt, minimalistisk og høysignals.

---

## 1. Nåværende Systemtilstand

* **Lokal kildekode:** `c:\Users\larse\Documents\Interne prosjekter\Businiss case\app`
* **GitHub Repository:** `https://github.com/Luaze1985/prosjektoggevinst.git` (gren `main`)
* **Produksjon (GitHub Pages):** `https://luaze1985.github.io/prosjektoggevinst/`
* **Serverless Proxy:** Cloudflare Worker operativ på `https://white-tooth-b839.larserik-bn.workers.dev` (verifisert og fungerer mot OpenAI `gpt-4o-mini`).
* **Teststatus:** 16/16 enhetstester passerer grønt (`npm --prefix app test`). `tsc && vite build` bygger feilfritt.

---

## 2. Hva som er Bygget (Teknisk Fundament)

1. **5-stegs trakt:**
   - Steg 1: Idéinntak (3 felter) + DFØ-kalkulator med 2 glidere (tidsbruk og kuttprosent).
   - Steg 2: 7 portvakt-spørsmål (Ja / Vet ikke / Nei).
   - Steg 3: Sjekkliste med portvaktstatus (X av 7 avklart) og lukket kildetoggle.
   - Steg 4: KI-evalueringsarena (kaller Cloudflare Worker-proxy eller direkte OpenAI API, alternativt ChatGPT-utklipp).
   - Steg 5: Ukeplan, modenhetsgrad (0–6), og 3 eksportknapper (KI-prompt, Ledelsesnotat, PDF).
2. **Cloudflare Worker Proxy (`app/proxy/worker.js`):**
   - Ligger deployet i skyen med CORS låst til `luaze1985.github.io` og rate-limiting (20 kall per IP per 10 minutter).
   - Holder brukerens `OPENAI_API_KEY` hemmelig på serveren.

---

## 3. Kjerneproblem som Må Løses i Neste Sesjon: Sanering

Brukeren opplever appen som:
1. **For generisk:** Tekstene og layouten bærer preg av for mange råd, for mye forklarende prosa og standard "AI-mal"-preg.
2. **For rotete:** For mange infobokser, rammer, undertekster og badges som konkurrerer om oppmerksomheten.
3. **For mye info:** Brukeren vil ha en ren arbeidsflyt der dataene og valgene er umiddelbare og krystallklare, uten lange forklaringer av hva hvert trinn gjør.

### Konkret oppgaveliste for neste sesjon:
1. **Sanere Steg 4 (KI-Sensor):**
   - Fjern store forklaringstekster og reduser visuelle blokker.
   - Gjør faktagrunnlaget ultra-kompakt (én ren, smal datalinje eller tabell i stedet for store fargede kort).
   - Gjør kjøringen av KI-vurderingen til én enkel, stram handling (f.eks. en ren knapp uten tre avsnitt med tekst rundt).
2. **Kutte hjelpetekster i hele appen:**
   - Gå gjennom `App.tsx` og fjern alle hjelpetekster, fotnoter og forklarende avsnitt som ikke er strengt nødvendige for å utføre handlingen.
   - Gjør språkføringen ultra-nøktern, presis og norsk forretningsorientert (ingen "floskler" eller rådgiver-fyllstoff).
3. **Stramme opp Steg 5 (Handoff & Notat):**
   - Gjør ukeplanen og notatvisningen renere og mer komprimert.
4. **Beholde den tekniske motoren intakt:**
   - Bevar DFØ-kalkylen, portvakt-logikken og proxy-koblingen mot `white-tooth-b839.larserik-bn.workers.dev`.
   - Alle 16 tester skal forbli grønne.

---

## 4. Relevante Filer

* **Hovedkomponent:** [`app/src/App.tsx`](file:///c:/Users/larse/Documents/Interne%20prosjekter/Businiss%20case/app/src/App.tsx)
* **Sensor-adapter:** [`app/src/lib/sensor-adapter.ts`](file:///c:/Users/larse/Documents/Interne%20prosjekter/Businiss%20case/app/src/lib/sensor-adapter.ts)
* **Beregninger & Domene:** [`app/src/lib/engine.ts`](file:///c:/Users/larse/Documents/Interne%20prosjekter/Businiss%20case/app/src/lib/engine.ts)
* **Type-definisjoner:** [`app/src/lib/types.ts`](file:///c:/Users/larse/Documents/Interne%20prosjekter/Businiss%20case/app/src/lib/types.ts)
* **Proxy-kode:** [`app/proxy/worker.js`](file:///c:/Users/larse/Documents/Interne%20prosjekter/Businiss%20case/app/proxy/worker.js)
* **Enhetstester:** [`app/tests/sensor-adapter.test.mjs`](file:///c:/Users/larse/Documents/Interne%20prosjekter/Businiss%20case/app/tests/sensor-adapter.test.mjs) og [`app/tests/engine.test.mjs`](file:///c:/Users/larse/Documents/Interne%20prosjekter/Businiss%20case/app/tests/engine.test.mjs)

---

## 5. Foreslåtte Skills for Neste Agent

Neste agent bør kalle følgende skills:
1. `caveman`: For å holde svarene ekstremt konsise, token-effektive og fri for høflighetsfraser og fyllord.
2. `codebase-design`: For å redusere grensesnittkompleksitet og sikre dype moduler med minimal overflate.
3. `fasit-skjonn-sorterer`: For å skille streng deterministisk fakta fra skjønnsmessig tekst og fjerne unødig støy.
4. `dokumentrevisjon`: For anti-slop kontroll og fjerning av generiske KI-vendinger.
