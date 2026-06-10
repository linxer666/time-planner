-- 申论积累模块（在 supabase-schema.sql 之后执行）

create table if not exists essay_articles (
  id uuid primary key default uuid_generate_v4(),
  source text not null check (source in ('rmrb', 'nfdb')),
  title text not null,
  url text not null unique,
  publish_date date,
  raw_content text default '',
  crawled_at timestamptz default now()
);

create table if not exists essay_materials (
  id uuid primary key default uuid_generate_v4(),
  article_id uuid references essay_articles(id) on delete cascade not null unique,
  topic_tags text[] default '{}',
  core_thesis text default '',
  golden_sentences jsonb default '[]',
  evidence_cases jsonb default '[]',
  policy_suggestions jsonb default '[]',
  argument_points jsonb default '[]',
  article_structure jsonb default '{}',
  paragraph_logic text default '',
  related_policies jsonb default '[]',
  applicable_types text[] default '{}',
  ai_summary text default '',
  created_at timestamptz default now()
);

create table if not exists essay_daily_picks (
  id uuid primary key default uuid_generate_v4(),
  pick_date date not null unique,
  material_id uuid references essay_materials(id) on delete cascade not null,
  source_label text default '',
  created_at timestamptz default now()
);

create table if not exists essay_user_actions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  material_id uuid references essay_materials(id) on delete cascade not null,
  starred boolean default false,
  read_at timestamptz,
  note text default '',
  created_at timestamptz default now(),
  unique(user_id, material_id)
);

alter table essay_articles enable row level security;
alter table essay_materials enable row level security;
alter table essay_daily_picks enable row level security;
alter table essay_user_actions enable row level security;

drop policy if exists "Public read essay articles" on essay_articles;
create policy "Public read essay articles" on essay_articles
  for select to anon, authenticated using (true);

drop policy if exists "Public read essay materials" on essay_materials;
create policy "Public read essay materials" on essay_materials
  for select to anon, authenticated using (true);

drop policy if exists "Public read essay daily picks" on essay_daily_picks;
create policy "Public read essay daily picks" on essay_daily_picks
  for select to anon, authenticated using (true);

drop policy if exists "Users manage own essay actions" on essay_user_actions;
create policy "Users manage own essay actions" on essay_user_actions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
