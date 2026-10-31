\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
INSERT INTO public.sli_analyses(id,owner_id,source_type,filename,status,summary) VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','fortigate','synthetic.csv','completed','{}'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','unsw_nb15','synthetic.csv','completed','{}');
INSERT INTO public.sli_analyses(id,owner_id,source_type,filename,status,summary,created_at,expires_at) VALUES
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','fortigate','expired.csv','completed','{}',now()-interval '2 days',now()-interval '1 day');
INSERT INTO public.sli_analysis_items(id,analysis_id,owner_id,kind,source_record_number,item_order,payload) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','finding',1,0,'{}'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','prediction',1,0,'{}'),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','finding',1,0,'{}');
INSERT INTO public.sli_analysis_reviews(analysis_id,owner_id,item_id,status,note) VALUES
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','investigating','owner b'),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','investigating','expired');
SET ROLE anon;
DO $$ BEGIN
 BEGIN
   PERFORM * FROM public.sli_analyses;
   RAISE EXCEPTION 'anonymous read was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.sli_analyses)<>0 THEN RAISE EXCEPTION 'missing subject could read data'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE changed integer; BEGIN
 IF (SELECT count(*) FROM public.sli_analyses)<>1 THEN RAISE EXCEPTION 'foreign or expired analysis visible'; END IF;
 IF (SELECT count(*) FROM public.sli_analysis_items)<>1 THEN RAISE EXCEPTION 'foreign or expired item visible'; END IF;
 IF EXISTS (SELECT 1 FROM public.sli_analyses WHERE owner_id='00000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'foreign analysis visible'; END IF;
 IF (SELECT count(*) FROM public.sli_analysis_reviews)<>0 THEN RAISE EXCEPTION 'foreign review visible'; END IF;
 UPDATE public.sli_analysis_reviews SET note='tampered' WHERE owner_id='00000000-0000-0000-0000-000000000002';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'foreign review changed'; END IF;
 BEGIN
   INSERT INTO public.sli_analysis_reviews(analysis_id,owner_id,item_id,status,note) VALUES
   ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','reviewed','not permitted');
   RAISE EXCEPTION 'foreign review was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   INSERT INTO public.sli_analyses(owner_id,source_type,filename,status,summary) VALUES
   ('00000000-0000-0000-0000-000000000001','fortigate','synthetic.csv','completed','{}');
   RAISE EXCEPTION 'direct analysis write was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   INSERT INTO public.sli_analysis_reviews(analysis_id,owner_id,item_id,status,note) VALUES
   ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','reviewed','forged relation');
   RAISE EXCEPTION 'cross-owner relationship was accepted';
 EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO public.sli_analysis_reviews(analysis_id,owner_id,item_id,status,note) VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','reviewed','synthetic note');
RESET ROLE;
DO $$ BEGIN
 IF (SELECT note FROM public.sli_analysis_reviews WHERE owner_id='00000000-0000-0000-0000-000000000002') <> 'owner b' THEN RAISE EXCEPTION 'foreign note altered'; END IF;
END $$;
DELETE FROM public.sli_analyses WHERE id='10000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.sli_analysis_items WHERE analysis_id='10000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'item not deleted'; END IF;
 IF EXISTS (SELECT 1 FROM public.sli_analysis_reviews WHERE analysis_id='10000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'review not deleted'; END IF;
END $$;
