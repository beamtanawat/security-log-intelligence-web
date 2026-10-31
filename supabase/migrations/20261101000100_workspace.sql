-- Staging migration: owner-scoped derived analysis data only; no raw CSV storage.
-- Trusted backend writes analyses/items; authenticated users may read only their own.
-- Apply only to a reviewed staging project; migration alone does not implement login.
BEGIN;

CREATE TABLE public.sli_analyses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_type text NOT NULL CHECK (source_type IN ('fortigate','unsw_nb15')),
    filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 200),
    status text NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled')),
    summary jsonb CHECK (summary IS NULL OR jsonb_typeof(summary) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
    CHECK (expires_at > created_at),
    UNIQUE (id, owner_id)
);

CREATE TABLE public.sli_analysis_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('finding','prediction','anomaly','quality')),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    FOREIGN KEY (analysis_id, owner_id) REFERENCES public.sli_analyses(id, owner_id) ON DELETE CASCADE,
    UNIQUE (analysis_id, owner_id, id)
);

CREATE TABLE public.sli_analysis_reviews (
    analysis_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    item_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'unreviewed' CHECK (status IN ('unreviewed','investigating','reviewed')),
    note text CHECK (note IS NULL OR length(note) <= 2000),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (analysis_id, owner_id, item_id),
    FOREIGN KEY (analysis_id, owner_id, item_id)
        REFERENCES public.sli_analysis_items(analysis_id, owner_id, id) ON DELETE CASCADE
);

CREATE INDEX sli_analyses_owner_created_idx ON public.sli_analyses(owner_id, created_at DESC);
CREATE INDEX sli_analyses_expiry_idx ON public.sli_analyses(expires_at);
CREATE INDEX sli_items_owner_record_idx ON public.sli_analysis_items(owner_id, analysis_id, source_record_number);

ALTER TABLE public.sli_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sli_analysis_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sli_analysis_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sli_analyses, public.sli_analysis_items, public.sli_analysis_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sli_analyses, public.sli_analysis_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sli_analysis_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sli_analyses, public.sli_analysis_items, public.sli_analysis_reviews TO service_role;

CREATE POLICY sli_analyses_select_own ON public.sli_analyses FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = owner_id AND expires_at > now());
CREATE POLICY sli_items_select_own ON public.sli_analysis_items FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = owner_id AND EXISTS (
        SELECT 1 FROM public.sli_analyses AS a
        WHERE a.id = sli_analysis_items.analysis_id AND a.owner_id = sli_analysis_items.owner_id
          AND a.expires_at > now()
    ));
CREATE POLICY sli_reviews_own ON public.sli_analysis_reviews FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = owner_id AND EXISTS (
        SELECT 1 FROM public.sli_analyses AS a
        WHERE a.id = sli_analysis_reviews.analysis_id AND a.owner_id = sli_analysis_reviews.owner_id
          AND a.expires_at > now()
    ))
    WITH CHECK ((SELECT auth.uid()) = owner_id AND EXISTS (
        SELECT 1 FROM public.sli_analyses AS a
        WHERE a.id = sli_analysis_reviews.analysis_id AND a.owner_id = sli_analysis_reviews.owner_id
          AND a.expires_at > now()
    ));

COMMIT;
