-- Slidesmith shared-workspace schema.
-- Run this once in the Supabase dashboard → SQL Editor.
--
-- The whole team shares one workspace, so config + queue are single JSONB blobs
-- (mirroring the old config.json / queue.json files). Library image *files* live
-- in the `library` Storage bucket; this table is just their index.
--
-- The backend connects with the service_role key (bypasses RLS), and the API is
-- gated by Firebase auth + the email allowlist in the app itself — so we keep RLS
-- ON with no public policies (no anonymous client ever touches these tables).

-- ── Key/value singletons: 'config' and 'queue' ──────────────────────────────
create table if not exists app_kv (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Library image index (files stored in the 'library' bucket) ──────────────
create table if not exists library_images (
  id       text primary key,
  path     text not null,                 -- object path within the bucket
  pack     text not null default 'Uploads',
  source   text not null default 'scraped',
  added_at timestamptz not null default now()
);
create index if not exists library_images_added_at_idx on library_images (added_at desc);

-- Lock the tables down; only the service_role (backend) may read/write.
alter table app_kv enable row level security;
alter table library_images enable row level security;

-- ── Storage bucket for uploaded / scraped images ────────────────────────────
-- Private bucket: the backend streams objects through /api/library/img/:id so
-- images stay same-origin (keeps the export canvas untainted).
insert into storage.buckets (id, name, public)
values ('library', 'library', false)
on conflict (id) do nothing;
