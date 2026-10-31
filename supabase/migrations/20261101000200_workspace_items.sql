-- Preserve original item ordering and allow derived UNSW flow records.
BEGIN;
ALTER TABLE public.sli_analysis_items DROP CONSTRAINT sli_analysis_items_kind_check;
ALTER TABLE public.sli_analysis_items ADD CONSTRAINT sli_analysis_items_kind_check
    CHECK (kind IN ('finding','prediction','anomaly','quality','record'));
ALTER TABLE public.sli_analysis_items ADD COLUMN item_order integer;
WITH numbered AS (
    SELECT id, (row_number() OVER (PARTITION BY analysis_id, kind ORDER BY source_record_number, id) - 1)::integer AS n
    FROM public.sli_analysis_items
)
UPDATE public.sli_analysis_items AS item SET item_order = numbered.n FROM numbered WHERE numbered.id = item.id;
ALTER TABLE public.sli_analysis_items ALTER COLUMN item_order SET NOT NULL;
ALTER TABLE public.sli_analysis_items ADD CONSTRAINT sli_items_order_nonnegative CHECK (item_order >= 0);
ALTER TABLE public.sli_analysis_items ADD CONSTRAINT sli_items_order_unique UNIQUE (analysis_id, kind, item_order);
COMMIT;
