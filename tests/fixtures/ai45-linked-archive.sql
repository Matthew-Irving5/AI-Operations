-- Synthetic fixture for the isolated AI-45 source only; never load into production.
begin;
insert into public.reports (id,user_id,report_type,title,summary,markdown,structured_metrics,status)
select '00000000-0000-4000-8000-000000004547',user_id,'systems','AI45 synthetic restore report','Synthetic archive relationship','Synthetic archive relationship','{}'::jsonb,'ready'
from public.source_objects where id='00000000-0000-4000-8000-000000004546'
on conflict(id) do nothing;

insert into public.trace_events (id,user_id,correlation_id,event_type,outcome,environment,redacted_payload,archive_reference)
select '00000000-0000-4000-8000-000000004548',user_id,'00000000-0000-4000-8000-000000004549','ai45_synthetic_archive','succeeded','test','{"synthetic":true}'::jsonb,
jsonb_build_object('objectKey','synthetic/ai45/trace.json','sha256',encode(digest(convert_to('{"synthetic":true,"event":"ai45_restore"}','UTF8'),'sha256'),'hex'),'sizeBytes',octet_length('{"synthetic":true,"event":"ai45_restore"}'),'contentType','application/json')
from public.source_objects where id='00000000-0000-4000-8000-000000004546'
on conflict(id) do nothing;

insert into public.evidence_references (id,user_id,source_type,source_object_id,title,sha256,verification_method,confidence,trace_event_id,provenance)
select '00000000-0000-4000-8000-000000004550',user_id,'source_object',id,'AI45 synthetic archived evidence',sha256,'source_document','high','00000000-0000-4000-8000-000000004548','{"synthetic":true}'::jsonb
from public.source_objects where id='00000000-0000-4000-8000-000000004546'
on conflict(id) do nothing;

insert into public.evidence_links (id,user_id,evidence_reference_id,entity_type,entity_id,relation)
select '00000000-0000-4000-8000-000000004551',user_id,'00000000-0000-4000-8000-000000004550','report','00000000-0000-4000-8000-000000004547','supports'
from public.source_objects where id='00000000-0000-4000-8000-000000004546'
on conflict(id) do nothing;

do $$ begin
if (select count(*) from public.evidence_links l join public.evidence_references e on e.id=l.evidence_reference_id join public.source_objects s on s.id=e.source_object_id join public.trace_events t on t.id=e.trace_event_id join public.reports r on r.id=l.entity_id where l.id='00000000-0000-4000-8000-000000004551' and s.sha256=e.sha256 and t.archive_reference->>'objectKey'='synthetic/ai45/trace.json' and l.user_id=e.user_id and e.user_id=s.user_id and s.user_id=t.user_id and t.user_id=r.user_id) <> 1 then
raise exception 'ai45_linked_archive_fixture_incomplete';
end if;
end $$;
commit;
