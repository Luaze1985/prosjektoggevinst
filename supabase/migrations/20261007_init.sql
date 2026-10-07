-- supabase/migrations/20261007_init.sql
-- Oppretter tabeller for både studentforslag, full casebank og evidenskart

-- 1. Tabell for lagring av studentens innsendte forslag og DFØ-beregninger
CREATE TABLE IF NOT EXISTS public.evalueringer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    prompt TEXT NOT NULL,
    timer_per_uke INTEGER NOT NULL DEFAULT 40,
    kutt_prosent INTEGER NOT NULL DEFAULT 50,
    timer_frigjort_uke INTEGER,
    timer_frigjort_aar INTEGER,
    aarsverk_frigjort NUMERIC,
    verdi_kr NUMERIC,
    ai_tilbakemelding TEXT,
    gevinstkategori TEXT
);

-- 2. Hovedtabell for casebanken (3 168 case)
CREATE TABLE IF NOT EXISTS public.cases (
    case_id TEXT PRIMARY KEY,
    prosjektnavn TEXT,
    organisasjon TEXT,
    land TEXT,
    bransje TEXT,
    kilde TEXT,
    kilde_url TEXT,
    dokumentasjonsstyrke TEXT,
    beskrivelse_original TEXT,
    dagens_situasjon TEXT,
    oensket_effekt TEXT,
    maalt_resultat TEXT,
    alternativer_vurdert TEXT,
    prosesseier TEXT,
    personopplysninger TEXT,
    KI_type TEXT,
    generativ_KI TEXT,
    evidensstyrke TEXT
);

-- 3. Tabell for atomære måltall og påstander (13 965 påstander)
CREATE TABLE IF NOT EXISTS public.evidenskart (
    id BIGSERIAL PRIMARY KEY,
    case_id TEXT REFERENCES public.cases(case_id),
    paastand TEXT,
    paastandstype TEXT,
    har_maaltall TEXT,
    vurdert_av TEXT,
    evidensstyrke TEXT,
    kilde TEXT,
    kilde_url TEXT,
    kunnskapslag TEXT
);

-- 4. Fulltekstsøk-indekser for lynrask semantisk matching i PostgreSQL
CREATE INDEX IF NOT EXISTS idx_cases_fts_simple ON public.cases USING gin(
    to_tsvector('simple', coalesce(prosjektnavn, '') || ' ' || coalesce(beskrivelse_original, '') || ' ' || coalesce(oensket_effekt, '') || ' ' || coalesce(maalt_resultat, ''))
);
CREATE INDEX IF NOT EXISTS idx_cases_fts_nor ON public.cases USING gin(
    to_tsvector('norwegian', coalesce(prosjektnavn, '') || ' ' || coalesce(beskrivelse_original, '') || ' ' || coalesce(oensket_effekt, '') || ' ' || coalesce(maalt_resultat, ''))
);
CREATE INDEX IF NOT EXISTS idx_evidens_fts ON public.evidenskart USING gin(
    to_tsvector('simple', coalesce(paastand, ''))
);

-- 5. RPC-funksjon for å søke i casebanken fra frontend eller Supabase Edge Function
-- Støtter både presise fraser og multi-ord studentprompter (OR-fallback og evidensfallback)
CREATE OR REPLACE FUNCTION public.search_cases(query_text TEXT, limit_count INT DEFAULT 3)
RETURNS TABLE (
    case_id TEXT,
    prosjektnavn TEXT,
    organisasjon TEXT,
    bransje TEXT,
    maalt_resultat TEXT,
    oensket_effekt TEXT,
    kilde TEXT,
    kilde_url TEXT,
    evidensstyrke TEXT,
    rank REAL
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    cleaned_query TEXT;
    parsed_query tsquery;
BEGIN
    cleaned_query := regexp_replace(coalesce(query_text, ''), '[^\w\sæøåÆØÅ]', ' ', 'g');

    -- 1. Forsøk eksakt AND-søk først for presise nøkkelord
    BEGIN
        parsed_query := plainto_tsquery('norwegian', cleaned_query);
    EXCEPTION WHEN OTHERS THEN
        parsed_query := NULL;
    END;

    IF parsed_query IS NOT NULL AND parsed_query != ''::tsquery THEN
        RETURN QUERY
        SELECT
            c.case_id,
            c.prosjektnavn,
            c.organisasjon,
            c.bransje,
            c.maalt_resultat,
            c.oensket_effekt,
            c.kilde,
            c.kilde_url,
            c.evidensstyrke,
            ts_rank(
                to_tsvector('norwegian', coalesce(c.prosjektnavn, '') || ' ' || coalesce(c.beskrivelse_original, '') || ' ' || coalesce(c.oensket_effekt, '') || ' ' || coalesce(c.maalt_resultat, '')),
                parsed_query
            ) AS rank
        FROM public.cases c
        WHERE to_tsvector('norwegian', coalesce(c.prosjektnavn, '') || ' ' || coalesce(c.beskrivelse_original, '') || ' ' || coalesce(c.oensket_effekt, '') || ' ' || coalesce(c.maalt_resultat, ''))
              @@ parsed_query
        ORDER BY rank DESC, c.case_id ASC
        LIMIT limit_count;

        IF FOUND THEN
            RETURN;
        END IF;
    END IF;

    -- 2. Fallback for lengre studentprompter: OR-søk på substansielle nøkkelord (>= 4 tegn)
    BEGIN
        SELECT to_tsquery('simple', string_agg(token || ':*', ' | '))
        INTO parsed_query
        FROM (
            SELECT unnest(regexp_matches(lower(cleaned_query), '([a-z0-9æøå]{4,})', 'g')) AS token
            LIMIT 6
        ) t;
    EXCEPTION WHEN OTHERS THEN
        parsed_query := NULL;
    END;

    IF parsed_query IS NOT NULL AND parsed_query != ''::tsquery THEN
        RETURN QUERY
        SELECT
            c.case_id,
            c.prosjektnavn,
            c.organisasjon,
            c.bransje,
            c.maalt_resultat,
            c.oensket_effekt,
            c.kilde,
            c.kilde_url,
            c.evidensstyrke,
            ts_rank(
                to_tsvector('simple', coalesce(c.prosjektnavn, '') || ' ' || coalesce(c.beskrivelse_original, '') || ' ' || coalesce(c.oensket_effekt, '') || ' ' || coalesce(c.maalt_resultat, '')),
                parsed_query
            ) AS rank
        FROM public.cases c
        WHERE to_tsvector('simple', coalesce(c.prosjektnavn, '') || ' ' || coalesce(c.beskrivelse_original, '') || ' ' || coalesce(c.oensket_effekt, '') || ' ' || coalesce(c.maalt_resultat, ''))
              @@ parsed_query
        ORDER BY rank DESC, c.case_id ASC
        LIMIT limit_count;

        IF FOUND THEN
            RETURN;
        END IF;
    END IF;

    -- 3. Sikker fallback: Returner de mest evidenssterke referansecasene dersom ingen ord matchet
    RETURN QUERY
    SELECT
        c.case_id,
        c.prosjektnavn,
        c.organisasjon,
        c.bransje,
        c.maalt_resultat,
        c.oensket_effekt,
        c.kilde,
        c.kilde_url,
        c.evidensstyrke,
        0.1::REAL AS rank
    FROM public.cases c
    WHERE c.maalt_resultat IS NOT NULL AND length(c.maalt_resultat) > 10
    ORDER BY c.evidensstyrke DESC NULLS LAST, c.case_id ASC
    LIMIT limit_count;
END;
$$;

-- RLS-regler
ALTER TABLE public.evalueringer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidenskart ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Offentlig lesing av cases" ON public.cases FOR SELECT USING (true);
CREATE POLICY "Offentlig lesing av evidenskart" ON public.evidenskart FOR SELECT USING (true);
CREATE POLICY "Offentlig innlegg av evalueringer" ON public.evalueringer FOR INSERT WITH CHECK (true);
CREATE POLICY "Offentlig lesing av evalueringer" ON public.evalueringer FOR SELECT USING (true);

-- Tilganger for Lovable / anonym klient
GRANT EXECUTE ON FUNCTION public.search_cases(TEXT, INT) TO anon, authenticated, service_role;

-- MERKNAD OM DATAIMPORT:
-- For public.cases: Bruk supabase/data/cases_seed.csv (18 kolonner, 3 168 rader):
--   \copy public.cases FROM 'supabase/data/cases_seed.csv' WITH (FORMAT csv, HEADER);
-- For public.evidenskart: Spesifiser kolonnene:
--   \copy public.evidenskart (case_id, paastand, paastandstype, har_maaltall, vurdert_av, evidensstyrke, kilde, kilde_url, kunnskapslag) FROM 'supabase/data/evidenskart.csv' WITH (FORMAT csv, HEADER);
