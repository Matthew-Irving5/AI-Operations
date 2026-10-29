begin;

-- AI-44's shared action transition update replaced the AI-17 wait-state edges.
-- Keep the full shared transition matrix and restore the specialist terminal outcomes.
create or replace function public.enforce_agent_contract_transition()
returns trigger language plpgsql as $$
declare allowed boolean := false;
begin
  if new.status = old.status then return new; end if;
  if tg_table_name = 'actions' then
    allowed := (old.status,new.status) in (
      ('proposed','awaiting_approval'),('proposed','approved'),('proposed','rejected'),('proposed','queued'),('proposed','cancelled'),('proposed','expired'),
      ('awaiting_approval','approved'),('awaiting_approval','rejected'),('awaiting_approval','cancelled'),('awaiting_approval','expired'),
      ('approved','queued'),('approved','cancelled'),('approved','expired'),
      ('queued','running'),('queued','failed'),('queued','cancelled'),('queued','expired'),('queued','waiting_for_dependency'),
      ('running','waiting_for_dependency'),('running','succeeded'),('running','partially_succeeded'),('running','failed'),('running','cancelled'),
      ('waiting_for_dependency','queued'),('waiting_for_dependency','running'),('waiting_for_dependency','failed'),('waiting_for_dependency','cancelled'),('waiting_for_dependency','expired'),
      ('succeeded','reversible'),('succeeded','closed'),('partially_succeeded','reversible'),('partially_succeeded','closed'),
      ('reversible','reversed'),('reversible','closed'),('reversed','closed'),('failed','closed')
    );
  elsif tg_table_name = 'conversations' then
    allowed := (old.status,new.status) in (('open','closed'),('open','archived'),('closed','open'),('closed','archived'));
  elsif tg_table_name = 'conversation_handoffs' then
    allowed := (old.status,new.status) in (('requested','accepted'),('requested','rejected'),('requested','cancelled'));
  elsif tg_table_name = 'inter_agent_requests' then
    allowed := (old.status,new.status) in (
      ('requested','accepted'),('requested','rejected'),('requested','cancelled'),('requested','failed'),
      ('accepted','running'),('accepted','waiting_for_dependency'),('accepted','cancelled'),('accepted','failed'),
      ('running','waiting_for_dependency'),('running','completed'),('running','rejected'),('running','failed'),('running','cancelled'),
      ('waiting_for_dependency','accepted'),('waiting_for_dependency','running'),('waiting_for_dependency','completed'),
      ('waiting_for_dependency','rejected'),('waiting_for_dependency','cancelled'),('waiting_for_dependency','failed')
    );
  elsif tg_table_name = 'attention_items' then
    allowed := (old.status,new.status) in (
      ('new','queued_for_planner'),('new','sent_immediately'),('new','dismissed'),('new','expired'),
      ('queued_for_planner','incorporated'),('queued_for_planner','sent_immediately'),('queued_for_planner','dismissed'),('queued_for_planner','expired'),
      ('incorporated','resolved'),('incorporated','dismissed'),('sent_immediately','resolved'),('sent_immediately','dismissed')
    );
  elsif tg_table_name = 'execution_requests' then
    allowed := (old.status,new.status) in (
      ('received','routed'),('received','failed'),('received','cancelled'),('routed','queued'),('routed','waiting_for_dependency'),('routed','failed'),('routed','cancelled'),
      ('queued','running'),('queued','waiting_for_dependency'),('queued','failed'),('queued','cancelled'),
      ('running','waiting_for_dependency'),('running','succeeded'),('running','failed'),('running','cancelled'),
      ('waiting_for_dependency','queued'),('waiting_for_dependency','running'),('waiting_for_dependency','failed'),('waiting_for_dependency','cancelled')
    );
  end if;
  if not allowed then raise exception 'invalid_agent_contract_transition: %.% -> %', tg_table_name, old.status, new.status; end if;
  return new;
end $$;

commit;
