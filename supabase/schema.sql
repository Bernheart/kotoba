-- Kotoba sync schema. Run once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.
-- One table holds every synced record (cards, review logs, your words, settings) as JSON.
-- Conflict rule: last write wins per record (by the client's updated_at), enforced on the server.

create sequence if not exists public.kotoba_seq;

create table if not exists public.kotoba_records (
  user_id    uuid    not null default auth.uid() references auth.users on delete cascade,
  collection text    not null check (collection in ('cards', 'logs', 'words', 'settings')),
  id         text    not null,
  data       jsonb   not null,
  updated_at bigint  not null,          -- client timestamp (ms) of the last edit
  deleted    boolean not null default false,
  seq        bigint  not null default nextval('public.kotoba_seq'), -- change feed cursor
  primary key (user_id, collection, id)
);

create index if not exists kotoba_records_user_seq on public.kotoba_records (user_id, seq);

alter table public.kotoba_records enable row level security;

drop policy if exists "own records" on public.kotoba_records;
create policy "own records" on public.kotoba_records
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Every insert/update gets a fresh sequence number, so clients can pull "everything after seq N".
create or replace function public.kotoba_bump_seq() returns trigger
language plpgsql as $$
begin
  new.seq := nextval('public.kotoba_seq');
  return new;
end $$;

drop trigger if exists kotoba_bump on public.kotoba_records;
create trigger kotoba_bump before insert or update on public.kotoba_records
  for each row execute function public.kotoba_bump_seq();

-- Upsert a batch; an existing row is only replaced by a strictly newer one (last write wins).
create or replace function public.kotoba_push(rows jsonb) returns void
language sql security invoker as $$
  insert into public.kotoba_records (user_id, collection, id, data, updated_at, deleted)
  select auth.uid(), r->>'collection', r->>'id', r->'data', (r->>'updated_at')::bigint, coalesce((r->>'deleted')::boolean, false)
  from jsonb_array_elements(rows) as r
  on conflict (user_id, collection, id) do update
    set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
    where public.kotoba_records.updated_at < excluded.updated_at;
$$;

revoke all on function public.kotoba_push(jsonb) from public, anon;
grant execute on function public.kotoba_push(jsonb) to authenticated;
grant select, insert, update on public.kotoba_records to authenticated;
grant usage on sequence public.kotoba_seq to authenticated;
