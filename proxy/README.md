# Oppsett av Sikker OpenAI Proxy for Studenter (Cloudflare Workers)

Denne proxyen lar studentene kjøre ekte KI-vurderinger direkte i nettleseren på GitHub Pages (`https://luaze1985.github.io/prosjektoggevinst/`) **uten** at de trenger egen API-nøkkel, og **uten** at din `OPENAI_API_KEY` eksponeres for omverdenen.

---

## 1. Opprett Worker i Cloudflare (2 minutter, 0 kr)

1. Gå til [dash.cloudflare.com](https://dash.cloudflare.com) og logg inn (eller opprett gratis konto).
2. I venstremenyen: Velg **Compute (Workers & Pages)** -> Klikk **Create** -> **Worker**.
3. Gi den et navn, f.eks.: `prosjektoggevinst-proxy`.
4. Klikk **Deploy**.
5. Klikk **Edit code**:
   - Slett standardkoden.
   - Kopier inn hele innholdet fra filen [`worker.js`](worker.js).
   - Klikk **Deploy**.

---

## 2. Legg til din OpenAI API-nøkkel som Secret

1. I Worker-oversikten for `prosjektoggevinst-proxy`: Gå til fanen **Settings** -> **Variables and Secrets**.
2. Klikk **Add** under **Secrets**:
   - **Variable name:** `OPENAI_API_KEY`
   - **Value:** Din OpenAI-nøkkel (f.eks. `sk-proj-...` fra en prosjektkonto med 5-10 USD spend limit).
3. Klikk **Save and Deploy**.

---

## 3. Din Worker-URL er nå klar!

Din URL ser typisk slik ut:
`https://prosjektoggevinst-proxy.<ditt-subdomene>.workers.dev`

Når du har denne URL-en, legger du den inn som standard proxy-adresse i appen eller under miljøvariabler!
Proxyen sørger for:
- **CORS-beskyttelse:** Kun kall fra din GitHub Pages-side godtas.
- **Rate limiting:** Maks 20 vurderinger per IP per 10 minutter for å unngå overforbruk.
- **Kryptering:** Nøkkelen forlater aldri Cloudflare-miljøet.
