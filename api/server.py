#!/usr/bin/env python3
"""
api/server.py - Minimalistisk lokal Python-backend (FastAPI).
Dersom du vil kjøre backend lokalt på maskinen i stedet for Supabase:
Kjøres med: uvicorn api.server:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Case Evaluator & Gevinstmotor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import re
from typing import Optional

class EvaluateRequest(BaseModel):
    prompt: str
    timer_per_uke: Optional[int] = None
    timerPerUke: Optional[int] = None
    kutt_prosent: Optional[int] = None
    kuttProsent: Optional[int] = None
    harProsesseier: Optional[str] = None
    ikkeKiVurdert: Optional[str] = None
    menneskeIKontroll: Optional[str] = None

@app.post("/api/evaluate")
def evaluate(req: EvaluateRequest):
    # DFØ Sjablong: 1 750 t/år, 850 000 kr/årsverk, 46 effektive arbeidsuker
    raw_timer = req.timerPerUke if req.timerPerUke is not None else (req.timer_per_uke if req.timer_per_uke is not None else 40)
    raw_kutt = req.kuttProsent if req.kuttProsent is not None else (req.kutt_prosent if req.kutt_prosent is not None else 50)

    timer_uke = max(0, raw_timer)
    kutt_pct = min(100, max(0, raw_kutt))

    timer_frigjort_uke = round((timer_uke * kutt_pct) / 100)
    timer_frigjort_aar = timer_frigjort_uke * 46
    aarsverk_frigjort = round(timer_frigjort_aar / 1750, 1)
    verdi_kr = round(aarsverk_frigjort * 850000)
    gevinstkategori = "Kapasitetsgevinst" if aarsverk_frigjort >= 0.5 else "Tidsgevinst"

    prompt_lower = req.prompt.lower()
    har_eier = req.harProsesseier == "ja" or (
        req.harProsesseier != "nei" and
        bool(re.search(r"(?:prosesseier|prosjekteier|produkteier|avdelingsleder|seksjonsleder|prosjektleder|linjeleder|enhetsleder|virksomhetsleder|forankret (?:hos|i|med)|fagansvarlig|leder(?:e|en|elsen)?\b|direktør|kommunesjef|rådmann|beslutningstaker)", prompt_lower, re.I))
    )
    baseline_passert = timer_uke > 0
    ikke_ki = req.ikkeKiVurdert == "ja" or (
        req.ikkeKiVurdert != "nei" and
        bool(re.search(r"(?:ikke-?ki|enklere (?:alternativ(?:er)?|løsning(?:er)?)|regelbasert|uten (?:ki|maskinlæring)|maler|fagsystem|regler først|manuelt først|skjema|excel|alternativ(?:er)? vurdert|rutiner først)", prompt_lower, re.I))
    )
    menneske = req.menneskeIKontroll == "ja" or (
        req.menneskeIKontroll != "nei" and
        bool(re.search(r"(?:hitl|mennesk(?:e|elig)|overprøv|saksbehandler (?:har|beholder|godkjenner|overprøver|vurderer|kvalitetssikrer|sjekker)|fagperson (?:godkjenner|vurderer|kvalitetssikrer)|manuell (?:godkjenning|kontroll|kvalitetssikring|overprøving)|kontrollert av|kvalitetssikres av)", prompt_lower, re.I))
    )

    alle_portvakter_passert = har_eier and baseline_passert and ikke_ki and menneske

    totalscore = 0
    if har_eier:
        totalscore += 25
    if ikke_ki:
        totalscore += 20
    if menneske:
        totalscore += 20
    if timer_uke > 0:
        totalscore += 15
    if len(req.prompt.strip()) > 30:
        totalscore += 20

    modenhetstrinn = 1
    modenhet_navn = "Innledende Idéfase (Trinn 1)"
    if alle_portvakter_passert and totalscore >= 75:
        modenhetstrinn = 3
        modenhet_navn = "Pilotklar / Smidig FoU (Trinn 3)"
    elif alle_portvakter_passert:
        modenhetstrinn = 2
        modenhet_navn = "Konseptfase (Trinn 2)"

    return {
        "status": "suksess",
        "allePortvakterPassert": alle_portvakter_passert,
        "totalscore": totalscore,
        "modenhetstrinn": modenhetstrinn,
        "modenhetNavn": modenhet_navn,
        "gevinst": {
            "timerFrigjortPerUke": timer_frigjort_uke,
            "timerFrigjortPerAar": timer_frigjort_aar,
            "aarsverkFrigjort": aarsverk_frigjort,
            "aarligKapasitetsverdiKr": verdi_kr,
            "gevinstkategori": gevinstkategori,
            # Bakoverkompatible aliaser
            "timerFrigjortUke": timer_frigjort_uke,
            "timerFrigjortAar": timer_frigjort_aar,
            "verdiKr": verdi_kr,
        },
        "portvakter": [
            {
                "navn": "1. Prosesseier i linjen",
                "passert": har_eier,
                "status": "AVKLART" if har_eier else "MÅ AVKLARES",
                "begrunnelse": "Forankret hos fagansvarlig leder med budsjett-/linjeansvar." if har_eier else "STOPP: Ingen navngitt prosesseier i linjen. Prosjektet må forankres før utvikling starter.",
                "beskrivelse": "Forankret hos fagansvarlig leder med budsjett-/linjeansvar." if har_eier else "STOPP: Ingen navngitt prosesseier i linjen. Prosjektet må forankres før utvikling starter.",
            },
            {
                "navn": "2. Nullalternativ (Baseline)",
                "passert": baseline_passert,
                "status": "DOKUMENTERT" if baseline_passert else "MANGLER",
                "begrunnelse": f"Dokumentert manuell tidsbruk: {timer_uke} timer/uke." if baseline_passert else "STOPP: Mangler nullalternativ. Nytte kan ikke måles uten dagens tidsbruk.",
                "beskrivelse": f"Dokumentert manuell tidsbruk: {timer_uke} timer/uke." if baseline_passert else "STOPP: Mangler nullalternativ. Nytte kan ikke måles uten dagens tidsbruk.",
            },
            {
                "navn": "3. Ikke-KI vurdert først",
                "passert": ikke_ki,
                "status": "VURDERT" if ikke_ki else "MÅ VURDERES",
                "begrunnelse": "Enkle regler, integrasjoner eller skjemafikser er vurdert først." if ikke_ki else "STOPP: Enklere digitale/regelbaserte løsninger må utredes før KI tas i bruk.",
                "beskrivelse": "Enkle regler, integrasjoner eller skjemafikser er vurdert først." if ikke_ki else "STOPP: Enklere digitale/regelbaserte løsninger må utredes før KI tas i bruk.",
            },
            {
                "navn": "4. Menneskelig kontroll (HITL)",
                "passert": menneske,
                "status": "SIKRET" if menneske else "HITL KRAV",
                "begrunnelse": "Saksbehandler/fagperson har endelig godkjenning og full overprøvingsrett." if menneske else "STOPP: Prosjekter som påvirker vedtak eller mennesker krever menneskelig overprøving.",
                "beskrivelse": "Saksbehandler/fagperson har endelig godkjenning og full overprøvingsrett." if menneske else "STOPP: Prosjekter som påvirker vedtak eller mennesker krever menneskelig overprøving.",
            },
        ],
        "referanseCaser": [
            {
                "tittel": "AI Writing Assistant for saksrapporter (Assist)",
                "organisasjon": "UK Department for Work & Pensions / Gov.uk",
                "oppnaaddResultat": "Saksbehandlere sparer i snitt ca. 3 timer per uke på saksforberedelser. 100% manuell overprøving (HITL).",
                "maaltResultat": "Saksbehandlere sparer i snitt ca. 3 timer per uke på saksforberedelser. 100% manuell overprøving (HITL).",
                "kilde": "UK Algorithmic Transparency Recording Standard (gov.uk)",
                "kildeUrl": "https://www.gov.uk/algorithmic-transparency-records",
                "evidens": "E3 Offisiell transparensrapport",
            },
            {
                "tittel": "Ami Chatbot for henvendelsestriagering",
                "organisasjon": "OECD AI Observatory (Case #14)",
                "oppnaaddResultat": "90% av standardhenvendelser avlastes automatisk uten manuell eskalering; 35% kapasitetsfrigjøring.",
                "maaltResultat": "90% av standardhenvendelser avlastes automatisk uten manuell eskalering; 35% kapasitetsfrigjøring.",
                "kilde": "OECD Observatory of Public Sector Innovation",
                "kildeUrl": "https://oecd-opsi.org",
                "evidens": "E2 Selvrapportert med måltall",
            },
            {
                "tittel": "Automatisk underlagsanalyse og dokumentsortering",
                "organisasjon": "Ofsted (Office for Standards in Education, UK)",
                "oppnaaddResultat": "Reduserte manuell forberedelsestid per tilsyn med 40%; sikrer konsistent saksunderlag for inspektører.",
                "maaltResultat": "Reduserte manuell forberedelsestid per tilsyn med 40%; sikrer konsistent saksunderlag for inspektører.",
                "kilde": "Ofsted Case Study",
                "kildeUrl": "https://www.gov.uk/government/organisations/ofsted",
                "evidens": "E3 Strukturert offentlig evalueringsrapport",
            },
        ],
        "aiTilbakemelding": "Lokal deterministisk DFØ-analyse fullført (0 tokens). Nullalternativ og DFØ-gevinst er verifisert mot sjablongverdier.",
        "mvp0Tips": "Test manuelt på 5 reelle saker sammen med en saksbehandler i 1 uke før du bygger kode.",
        "mvpPlan": [
            {
                "steg": "MVP 0 (Papir/Manuell)",
                "tittel": "Manuell verifikasjon på 5 reelle saker",
                "hvaSkalBevises": "At sluttbrukere faktisk sparer tid på formatet før det skrives én eneste linje med kode.",
                "hvaSkalUtelates": "Ingen kode, ingen API-kall, ingen database.",
            },
            {
                "steg": "MVP 1 (Isolert KI-test)",
                "tittel": "Frittstående prompt- og datatest",
                "hvaSkalBevises": "At modellen leverer akseptabel kvalitet uten faktafeil i en lukket sandkasse.",
                "hvaSkalUtelates": "Ingen fagsystemintegrasjon; kun isolert testing.",
            },
            {
                "steg": "MVP 2 (Fagpilot)",
                "tittel": "Intern pilot med 2-3 saksbehandlere",
                "hvaSkalBevises": "Måle faktisk tidsgevinst og brukeropplevelse i linjen over 2 uker.",
                "hvaSkalUtelates": "Ingen automatisk publisering eller direkte vedtak.",
            },
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
