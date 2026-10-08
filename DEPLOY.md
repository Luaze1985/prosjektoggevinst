# Publiseringsguide — Business Case-screening & KI-Sensor

Denne appen er en **100 % uavhengig webapplikasjon** bygget lokalt i React, Vite og Tailwind CSS. Den krever **0 Lovable-credits** og **0 kr i månedlige skykostnader**.

---

## 1. Lokal kjøring (0 oppsett)

### Alternativ A: Ett-klikks oppstart (PowerShell)
Dobbeltklikk eller kjør skriptet fra prosjektets rotmappe:
```powershell
.\start-app.ps1
```
Dette installerer nødvendige moduler ved behov, starter Vite på `http://localhost:5173` og åpner standardnettleseren automatisk.

### Alternativ B: Manuell npm-kjøring
```bash
cd app
npm run dev
```

---

## 2. Gratis publisering til nettet

Fordi appen er konfigurert med relativ base (`base: './'`), kan den bygges til rene statiske filer (`app/dist/`) og hostes på alle gratis statiske webtjenester.

### Alternativ 1: GitHub Pages (Anbefalt, automatisert)
Repoet inneholder allerede en ferdig GitHub Actions-arbeidsflyt i [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

**Fremgangsmåte:**
1. Push koden til GitHub (`main`-grenen).
2. Gå til GitHub-repoet ditt → **Settings** → **Pages**.
3. Under **Build and deployment** → **Source**, velg **GitHub Actions**.
4. GitHub bygger og publiserer nå automatisk appen til:
   `https://[brukernavn].github.io/[repo-navn]/`

### Alternativ 2: Vercel (1-klikks gratis hosting)
1. Gå til [vercel.com](https://vercel.com) og logg inn med GitHub.
2. Velg **Add New Project** og importer dette repoet.
3. Sett **Root Directory** til `app`.
4. Vercel gjenkjenner automatisk Vite og kjører `npm run build`.
5. Klikk **Deploy**. Du får en gratis `*.vercel.app`-adresse med HTTPS.

### Alternativ 3: Netlify (Drag & Drop eller Git)
1. Bygg appen lokalt:
   ```bash
   cd app
   npm run build
   ```
2. Dra mappen `app/dist` direkte inn i [Netlify Drop](https://app.netlify.com/drop).
3. Appen er live umiddelbart!

---

## 3. OpenAI API-nøkkel og Kostnadskontroll

- **Standard (0 kr, 0 credits):** Uten API-nøkkel benytter appen den innebygde, deterministiske regelmotoren og caseregisteret (Lag B). All analyse fungerer offline og gratis.
- **Valgfri KI-Sensor (OpenAI `gpt-4o-mini`):** 
  - Klikk på tannhjul-ikonet (**Innstillinger**) øverst til høyre i headeren.
  - Lim inn din personlige OpenAI API-nøkkel (`sk-...`).
  - Nøkkelen lagres **utelukkende i din egen nettleser** (`localStorage`).
  - Den sendes aldri til noen mellomtjener, Lovable eller andre parter.
  - Prisen per evaluering med `gpt-4o-mini` er brøkdeler av ett øre (~0,001 kr).

---

## 4. Kvalitetssikring og Verifisering

Før enhver ny publisering kan du verifisere at alt fungerer med:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1 -Mode manual
```
Dette sjekker at:
- Alle 13 automatiserte enhetstester passerer.
- TypeScript og Vite kompilerer og bygger uten feil.
- Datakontrakter og evalueringsmotoren er i 100 % samsvar.
