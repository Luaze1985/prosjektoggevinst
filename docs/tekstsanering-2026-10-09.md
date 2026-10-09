# Tekstsanering 2026-10-09

## Observasjoner

- Fast skjermtekst var mest konsentrert i KI-steget: teknisk tilkobling, fire faktakort og samme vurderingsramme ble forklart flere ganger.
- Avklaringssteget viste både en kort overskrift og det samme spørsmålet i full lengde.
- Ukeplanen viste både handlingens tittel og en forklaring, mens faseplanen gjentok MVP 0.

## Beslutninger

- Behold fem steg, portvakter, DFØ-kalkyle, KI-adapter, eksport og KI-svar.
- Vis brukerens verdier som **anslag**, ikke som fasit eller realisert gevinst.
- La «Vurder prosjektet» være hovedhandlingen. ChatGPT/Claude åpnes bare når brukeren velger det.
- Vis korte, konkrete feil og stoppårsaker. Kilder og teknisk tilkobling forblir sekundært innhold.

## Måling

Tellingen dekker unik, fast tekst som vises i standardtilstanden for hvert steg. Brukerinnhold, genererte KI-svar, eksportinnhold, tallverdier og lukkede paneler er ikke med. Målingen er gjort ved manuell gjennomgang av før-versjonen i `HEAD` og ferdig grensesnitt.

| Steg | Før | Etter | Reduksjon |
| --- | ---: | ---: | ---: |
| 1. Idé | 91 | 55 | 40 % |
| 2. Avklaring | 142 | 82 | 42 % |
| 3. Sjekkliste | 119 | 68 | 43 % |
| 4. KI-sensor | 274 | 60 | 78 % |
| 5. Handoff | 163 | 91 | 44 % |
| **Totalt** | **789** | **356** | **55 %** |

Kravet om minst 50 % reduksjon er oppfylt. De største kuttene kommer fra steg 4; teksten som er beholdt forklarer handling, status, feil eller avgrensning.

## Kildegrunnlag og begrensning

Vurderingen bygger på lokal kode, brukerens tilbakemelding og prinsippene om enkle spørsmål og progressiv fremvisning i [GOV.UK Service Manual](https://www.gov.uk/service-manual/design/writing-for-user-interfaces) og [NN/g](https://www.nngroup.com/articles/progressive-disclosure/). Det foreligger ingen studenttest eller offentlig brukerfeedback for produktet. Telling og vurdering er derfor en designgjennomgang, ikke et mål på faktisk brukerforståelse.
