-- LIFE TRACE — PostgreSQL schema (Supabase or any managed Postgres)
-- Apply with: psql "$DATABASE_URL" -f server/db/schema.sql
--
-- Row Level Security: every statement is scoped to the session variable
-- app.user_id, which the server sets per request inside a transaction.
-- No client can read or write another user's rows.

create table if not exists users (
  id            text primary key,
  email         text not null unique,
  password_hash text not null,
  name          text not null default '',
  location      text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists sessions (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id);

-- Generic document store: one table for every user-owned record type.
create table if not exists documents (
  id         text primary key,
  collection text not null,
  user_id    text not null references users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists documents_owner_idx on documents(collection, user_id, created_at desc);

alter table users    enable row level security;
alter table sessions enable row level security;
alter table documents enable row level security;

drop policy if exists users_self on users;
create policy users_self on users
  using (id = current_setting('app.user_id', true))
  with check (id = current_setting('app.user_id', true));

drop policy if exists sessions_self on sessions;
create policy sessions_self on sessions
  using (user_id = current_setting('app.user_id', true))
  with check (user_id = current_setting('app.user_id', true));

drop policy if exists documents_self on documents;
create policy documents_self on documents
  using (user_id = current_setting('app.user_id', true))
  with check (user_id = current_setting('app.user_id', true));
