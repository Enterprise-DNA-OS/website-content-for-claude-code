create function touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create function immutable_record() returns trigger language plpgsql as $$ begin raise exception 'Evidence is append-only'; end $$;
create table datasets (
 id uuid primary key default gen_random_uuid(), name text not null unique check(length(trim(name))>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table content_types (
 id uuid primary key default gen_random_uuid(), dataset_id uuid not null references datasets(id), name text not null,
 rules jsonb not null default '{}', version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(dataset_id,name), check(jsonb_typeof(rules)='object')
);
create table documents (
 id uuid primary key default gen_random_uuid(), dataset_id uuid not null references datasets(id),
 source_id text not null, name text not null, type_name text not null, variant text not null check(variant in ('content','draft','release','asset','system')),
 payload jsonb not null check(jsonb_typeof(payload)='object'), revision integer not null default 1,
 owner text not null, due date, review_due date,
 privacy text not null default 'unclassified' check(privacy in ('unclassified','business','personal')),
 purpose text, retention_due date, accuracy_evidence text,
 archived boolean not null default false, last_actor text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(dataset_id,source_id)
);
create table revisions (
 id uuid primary key default gen_random_uuid(), document_id uuid not null references documents(id), revision integer not null,
 snapshot jsonb not null, actor text not null, note text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(document_id,revision)
);
create table approvals (
 id uuid primary key default gen_random_uuid(), document_id uuid not null references documents(id), revision integer not null,
 type_version integer not null, decision text not null check(decision in ('approved','changes')),
 actor text not null, evidence text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(document_id,revision) references revisions(document_id,revision)
);
create table content_links (
 id uuid primary key default gen_random_uuid(), document_id uuid not null references documents(id), target_source_id text not null,
 field_path text not null, weak boolean not null default false, external boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table import_runs (
 id uuid primary key default gen_random_uuid(), dataset_id uuid not null references datasets(id), sha256 text not null,
 source_name text not null, receipt jsonb not null, actor text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table bundles (
 id uuid primary key default gen_random_uuid(), dataset_id uuid not null references datasets(id), name text not null,
 snapshot jsonb not null, sha256 text not null, actor text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index documents_dataset_type_idx on documents(dataset_id,type_name);
create index documents_due_idx on documents(due) where not archived;
create index revisions_doc_idx on revisions(document_id,revision);
create index approvals_doc_idx on approvals(document_id,created_at desc,id);
create index links_doc_idx on content_links(document_id);
create index links_target_idx on content_links(target_source_id);
create index imports_dataset_idx on import_runs(dataset_id);
create index bundles_dataset_idx on bundles(dataset_id);
do $$ declare t text; role_name text; begin
 foreach t in array array['datasets','content_types','documents','revisions','approvals','content_links','import_runs','bundles'] loop
 execute format('alter table %I enable row level security',t);
 execute format('revoke all on %I from public',t);
 foreach role_name in array array['anon','authenticated'] loop
 if exists(select 1 from pg_roles where rolname=role_name) then execute format('revoke all on %I from %I',t,role_name); end if;
 end loop;
 if t in ('revisions','approvals','import_runs','bundles') then
 execute format('create trigger immutable before update or delete on %I for each row execute function immutable_record()',t);
 else execute format('create trigger touch before update on %I for each row execute function touch_updated_at()',t); end if;
 end loop;
end $$;
create view content_week with (security_invoker=true) as
 select d.id,d.name,s.name dataset,d.type_name,d.variant,d.owner,d.due,d.review_due,d.revision
 from documents d join datasets s on s.id=d.dataset_id where not d.archived;
create view review_queue with (security_invoker=true) as
 select d.id,d.name,s.name dataset,d.owner,d.revision,d.review_due,
 coalesce(a.decision,'unreviewed') decision, a.actor reviewer,
 case when a.revision=d.revision and a.type_version=t.version then true else false end current_review
 from documents d join datasets s on s.id=d.dataset_id
 left join content_types t on t.dataset_id=d.dataset_id and t.name=d.type_name
 left join lateral(select * from approvals a where a.document_id=d.id order by a.created_at desc,a.id desc limit 1) a on true
 where not d.archived;
create view attention with (security_invoker=true) as
 select id,name,owner,'content overdue' issue from documents where not archived and due<current_date
 union all select id,name,owner,'review expired' from documents where not archived and review_due<current_date
 union all select id,name,owner,'classification missing' from documents where not archived and privacy='unclassified'
 union all select id,name,owner,'accuracy evidence missing' from documents where not archived and privacy='personal' and nullif(trim(accuracy_evidence),'') is null
 union all select id,name,owner,'retention decision due' from documents where privacy='personal' and retention_due<current_date;
revoke all on content_week,review_queue,attention from public;
