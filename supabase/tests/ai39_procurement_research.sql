begin;
select plan(19);

create temporary table ai39_fixture on commit drop as
select
  '{"item":"Synthetic device","purpose":"Evaluate a synthetic device","market":"UK","currency":"GBP","maxTotalCostMinor":25000,"requiredBy":null,"requirements":[{"id":"repairable","label":"Must be repairable","kind":"hard"}],"existingProducts":[]}'::jsonb as request,
  'https://example.com/synthetic-device'::text as source_url;

select lives_ok(
  $$select public.create_on_demand_run_request(
    '00000000-0000-0000-0000-000000000101',
    (select id from public.workflow_definitions where code='procurement-on-demand-research'),
    'procurement', 1.00, 'gpt-5.6-luna', 1, 'ai39-procurement-decision-commit',
    (select request from ai39_fixture)
  )$$,
  'a bounded Procurement request creates its canonical workflow and durable research run'
);

select is(
  (select research.workflow_run_id::text
   from public.on_demand_research_runs research
   join public.workflow_runs run on run.id = research.workflow_run_id
   where run.idempotency_key = 'ai39-procurement-decision-commit'),
  (select id::text from public.workflow_runs where idempotency_key = 'ai39-procurement-decision-commit'),
  'the Procurement read model stays linked to its canonical workflow run'
);

select ok(
  (select prompt.tool_policy = '{"version":1,"tools":[{"type":"web_search","name":"web_search"}]}'::jsonb
   and prompt.evaluation_status = 'approved'
   from public.prompt_versions prompt
   join public.prompt_templates template on template.id = prompt.template_id
   where template.code = 'procurement-research-comparison' and prompt.version = 1),
  'the approved Procurement prompt carries only its governed web search capability'
);

update public.workflow_runs set status = 'running'
where idempotency_key = 'ai39-procurement-decision-commit';
update public.job_queue set status = 'awaiting_provider', attempt_count = 1
where run_id = (select id from public.workflow_runs where idempotency_key = 'ai39-procurement-decision-commit');

select lives_ok(
  $$select public.reserve_instrumented_ai_call(
    '00000000-0000-0000-0000-000000000101',
    (select id from public.workflow_runs where idempotency_key = 'ai39-procurement-decision-commit'),
    (select id from public.ai_model_catalog where model_id = 'gpt-5.6-luna'),
    (select prompt.id from public.prompt_versions prompt
     join public.prompt_templates template on template.id = prompt.template_id
     where template.code = 'procurement-research-comparison' and prompt.version = 1),
    0.50, 'ai39-procurement-call-01', '{"workflow":"procurement-on-demand-research"}'::jsonb
  )$$,
  'Procurement reserves cost before provider submission'
);
select lives_ok(
  $$select public.mark_instrumented_ai_call_submitted(
    (select id from public.ai_calls where request_id = 'ai39-procurement-call-01'),
    'resp_ai39_procurement_fixture'
  )$$,
  'the provider response is durably associated with the reserved call'
);
insert into public.job_provider_submissions(response_id, job_id, attempt_count, status, submitted_at, expires_at)
select 'resp_ai39_procurement_fixture', job.id, 1, 'awaiting_provider', now(), now() + interval '10 minutes'
from public.job_queue job
where job.run_id = (select id from public.workflow_runs where idempotency_key = 'ai39-procurement-decision-commit');

create temporary table ai39_decision on commit drop as
with candidate as (
  select jsonb_build_object(
    'id', 'candidate-1',
    'title', 'Synthetic device',
    'productUrl', source_url,
    'merchant', 'Synthetic merchant',
    'offer', jsonb_build_object(
      'currency', 'GBP', 'itemPriceMinor', 10000, 'deliveryMinor', 500,
      'requiredAccessoriesMinor', 0, 'mandatoryFeesMinor', 0,
      'priceType', 'current_offer', 'observedAt', '2026-10-21T12:00:00Z',
      'sourceUrls', jsonb_build_array(source_url)
    ),
    'assessments', jsonb_build_array(jsonb_build_object(
      'requirementId', 'repairable', 'result', 'compatible',
      'evidenceUrls', jsonb_build_array(source_url)
    )),
    'reviews', '[]'::jsonb,
    'warrantySummary', 'Two-year warranty',
    'returnsSummary', '30-day returns',
    'warrantyAndReturnsSourceUrls', jsonb_build_array(source_url),
    'rationale', 'The cited listing supports the hard requirement and current offer.'
  ) as value
  from ai39_fixture
), comparison as (
  select jsonb_build_object(
    'candidateId', 'candidate-1', 'status', 'eligible', 'rank', 1,
    'totalCostMinor', 10500, 'priceConfidence', 'current_verified',
    'preferenceScore', 0, 'independentReviewSources', 0, 'exclusionReasons', '[]'::jsonb
  ) as value
), source as (
  select jsonb_build_object('title', 'Synthetic listing', 'url', source_url) as citation
  from ai39_fixture
)
select jsonb_build_object(
  'version', 1, 'item', 'Synthetic device', 'purpose', 'Evaluate a synthetic device',
  'market', 'UK', 'requiredBy', null, 'currency', 'GBP', 'maxTotalCostMinor', 25000,
  'requirements', (select request->'requirements' from ai39_fixture),
  'summary', 'A synthetic cited comparison.',
  'rationale', 'The candidate meets the hard repairability requirement and budget.',
  'selectedCandidateId', 'candidate-1', 'candidates', jsonb_build_array(candidate.value),
  'comparison', jsonb_build_array(comparison.value), 'bestValueCandidateId', 'candidate-1',
  'recommendations', jsonb_build_array(jsonb_build_object(
    'recommendation_kind', 'best_overall', 'candidate_id', 'candidate-1',
    'decision_rank', 1, 'title', 'Synthetic device', 'total_cost_minor', 10500,
    'currency', 'GBP', 'compliance_passed', true, 'warranty_summary', 'Two-year warranty',
    'returns_summary', '30-day returns', 'uncertainty', 'No independent review sources.',
    'citations', jsonb_build_array(source.citation),
    'details', jsonb_build_object('candidate', candidate.value, 'comparison', comparison.value)
  ))
) as decision,
jsonb_build_array(jsonb_build_object(
  'title', 'Synthetic listing', 'source_url', (select source_url from ai39_fixture),
  'source_quality', 'unreviewed', 'citation_text', 'Synthetic listing — https://example.com/synthetic-device'
)) as sources
from candidate, comparison, source;

select lives_ok(
  $$select public.commit_instrumented_ai_procurement_report_with_queue(
    (select id from public.job_queue where run_id = (select id from public.workflow_runs where idempotency_key = 'ai39-procurement-decision-commit')),
    'resp_ai39_procurement_fixture',
    (select id from public.ai_calls where request_id = 'ai39-procurement-call-01'),
    (select id from public.workflow_runs where idempotency_key = 'ai39-procurement-decision-commit'),
    1, (select decision from ai39_decision), (select sources from ai39_decision),
    'procurement-on-demand-research', 'silent', 'Synthetic procurement comparison',
    'A synthetic cited comparison.', '## Synthetic procurement comparison',
    '{"selected_candidate_id":"candidate-1"}'::jsonb,
    '[{"code":"procurement-comparison","title":"Requirement-first comparison","display_order":0,"content":"A synthetic cited comparison.","structured_data":{},"evidence_references":[]}]'::jsonb,
    '[]'::jsonb,
    public.calculate_instrumented_ai_cost(
      (select id from public.ai_model_catalog where model_id = 'gpt-5.6-luna'), 100, 100, 0, 1
    ),
    100, 100, 0, 0,
    '{"input_tokens":100,"output_tokens":100,"web_search_calls":1}'::jsonb,
    '{"validation_passed":true,"web_search_calls":1}'::jsonb
  )$$,
  'provider usage, report, decision, recommendations, and queue outcome commit atomically'
);

select is(
  (select search_calls from public.ai_calls where request_id = 'ai39-procurement-call-01'),
  1,
  'settlement persists the observed web search count'
);
select is(
  (select searches_used from public.on_demand_research_runs research
   join public.workflow_runs run on run.id = research.workflow_run_id
   where run.idempotency_key = 'ai39-procurement-decision-commit'),
  1,
  'the durable Procurement run records the consumed search budget'
);
select is(
  (select decision_record->>'selectedCandidateId' from public.on_demand_research_runs research
   join public.workflow_runs run on run.id = research.workflow_run_id
   where run.idempotency_key = 'ai39-procurement-decision-commit'),
  'candidate-1',
  'the selected candidate and rationale persist in the decision record'
);
select is(
  (select count(*)::integer from public.procurement_recommendations recommendation
   join public.workflow_runs run on run.id = (select workflow_run_id from public.on_demand_research_runs where id = recommendation.research_run_id)
   where run.idempotency_key = 'ai39-procurement-decision-commit'),
  1,
  'the comparison candidate persists exactly once'
);
select is(
  (select count(*)::integer from public.reports report
   join public.workflow_runs run on run.id = report.run_id
   where run.idempotency_key = 'ai39-procurement-decision-commit' and report.status = 'validated'),
  1,
  'a validated report is committed with the procurement decision'
);
select is(
  (select count(*)::integer from public.research_sources source
   join public.workflow_runs run on run.user_id = source.user_id
   join public.on_demand_research_runs research on research.workflow_run_id = run.id
   where run.idempotency_key = 'ai39-procurement-decision-commit' and source.domain_area = 'procurement'),
  1,
  'cited procurement evidence is persisted for the owning user'
);
select is(
  (select run.status::text from public.workflow_runs run where run.idempotency_key = 'ai39-procurement-decision-commit'),
  'succeeded',
  'the committed provider result completes the canonical workflow run'
);

select lives_ok(
  $$select public.create_procurement_revision_request(
    '00000000-0000-0000-0000-000000000101',
    (select id from public.workflow_definitions where code='procurement-on-demand-research'),
    'procurement', 1.00, 'gpt-5.6-luna', 1, 'ai39-procurement-revision-01',
    '{"item":"Synthetic device","purpose":"Evaluate a synthetic device","market":"UK","currency":"GBP","maxTotalCostMinor":25000,"requiredBy":null,"requirements":[{"id":"repairable","label":"Must be repairable and serviceable","kind":"hard"}],"existingProducts":[]}'::jsonb,
    (select research.id from public.on_demand_research_runs research
     join public.workflow_runs run on run.id = research.workflow_run_id
     where run.idempotency_key = 'ai39-procurement-decision-commit')
  )$$,
  'a changed requirement creates a new bounded research run linked to the prior decision'
);
select is(
  (select revised.revises_research_run_id::text
   from public.on_demand_research_runs revised
   join public.workflow_runs run on run.id = revised.workflow_run_id
   where run.idempotency_key = 'ai39-procurement-revision-01'),
  (select previous.id::text from public.on_demand_research_runs previous
   join public.workflow_runs run on run.id = previous.workflow_run_id
   where run.idempotency_key = 'ai39-procurement-decision-commit'),
  'the revised run points to the immutable prior request'
);
select is(
  (select revised.request->'requirements'->0->>'label'
   from public.on_demand_research_runs revised
   join public.workflow_runs run on run.id = revised.workflow_run_id
   where run.idempotency_key = 'ai39-procurement-revision-01'),
  'Must be repairable and serviceable',
  'the revised hard requirement is stored with the new comparison request'
);
select is(
  (select previous.decision_record->>'selectedCandidateId'
   from public.on_demand_research_runs previous
   join public.workflow_runs run on run.id = previous.workflow_run_id
   where run.idempotency_key = 'ai39-procurement-decision-commit'),
  'candidate-1',
  'revising requirements leaves prior decision and evidence intact'
);
select throws_ok(
  $$select public.create_procurement_revision_request(
    '00000000-0000-0000-0000-000000000102',
    (select id from public.workflow_definitions where code='procurement-on-demand-research'),
    'procurement', 1.00, 'gpt-5.6-luna', 1, 'ai39-procurement-cross-user-revision',
    '{"item":"Synthetic device","purpose":"Evaluate a synthetic device","market":"UK","currency":"GBP","maxTotalCostMinor":25000,"requiredBy":null,"requirements":[{"id":"repairable","label":"Must be repairable","kind":"hard"}],"existingProducts":[]}'::jsonb,
    (select research.id from public.on_demand_research_runs research
     join public.workflow_runs run on run.id = research.workflow_run_id
     where run.idempotency_key = 'ai39-procurement-decision-commit')
  )$$,
  'P0001', 'procurement_revision_source_unavailable',
  'a revision cannot attach another user’s research history'
);
select throws_ok(
  $$select public.create_procurement_revision_request(
    '00000000-0000-0000-0000-000000000101',
    (select id from public.workflow_definitions where code='procurement-on-demand-research'),
    'procurement', 1.00, 'gpt-5.6-luna', 1, 'ai39-procurement-decision-commit',
    '{"item":"Synthetic device","purpose":"Evaluate a synthetic device","market":"UK","currency":"GBP","maxTotalCostMinor":25000,"requiredBy":null,"requirements":[{"id":"repairable","label":"Must be repairable","kind":"hard"}],"existingProducts":[]}'::jsonb,
    (select research.id from public.on_demand_research_runs research
     join public.workflow_runs run on run.id = research.workflow_run_id
     where run.idempotency_key = 'ai39-procurement-decision-commit')
  )$$,
  'P0001', 'procurement_revision_idempotency_conflict',
  'a retry cannot convert an existing original run into a revision'
);

select * from finish();
rollback;
