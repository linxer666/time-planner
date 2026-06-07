-- 个人时间管理网站 Supabase 数据库 Schema
-- 在 Supabase SQL Editor 中执行此脚本

-- 启用 UUID 扩展
create extension if not exists "uuid-ossp";

-- ========== 实习项目管理 ==========

create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text default '',
  start_date date,
  end_date date,
  created_at timestamptz default now()
);

create table if not exists milestones (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  name text not null,
  sort_order int default 0,
  result_note text default '',
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  milestone_id uuid references milestones(id) on delete set null,
  title text not null,
  deadline date,
  priority text default 'medium' check (priority in ('high', 'medium', 'low')),
  status text default 'todo' check (status in ('todo', 'doing', 'done')),
  created_at timestamptz default now()
);

create table if not exists weekly_goals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  week_key text not null,
  content text not null,
  sort_order int default 0,
  created_at timestamptz default now(),
  unique(user_id, week_key, sort_order)
);

create table if not exists tech_todos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  done boolean default false,
  created_at timestamptz default now()
);

create table if not exists work_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  log_date date not null,
  content text not null,
  created_at timestamptz default now()
);

-- ========== 考公备考 ==========

create table if not exists exam_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  exam_type text not null check (exam_type in ('guokao', 'guangdong', 'xuandiao')),
  title text not null,
  event_date date not null,
  created_at timestamptz default now()
);

create table if not exists study_records (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  record_date date not null,
  subject text not null,
  question_category text default '',
  question_subtype text default '',
  question_type text default '',
  question_count int default 0,
  accuracy numeric(5,2),
  is_paper boolean default false,
  paper_name text default '',
  paper_score text default '',
  created_at timestamptz default now()
);

create table if not exists courses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  total_chapters int default 0,
  current_chapter int default 0,
  deadline_date date,
  created_at timestamptz default now()
);

create table if not exists course_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  course_id uuid references courses(id) on delete cascade not null,
  log_date date not null,
  chapter text default '',
  created_at timestamptz default now()
);

create table if not exists daily_tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  task_date date not null,
  title text not null,
  track text not null check (track in ('intern', 'exam')),
  project_id uuid references projects(id) on delete set null,
  exam_subtype text check (exam_subtype in ('practice', 'course', 'review')),
  done boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists daily_plans (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  plan_date date not null,
  focus text default 'both' check (focus in ('intern', 'exam', 'both')),
  intern_goal text default '',
  exam_questions int,
  exam_chapters text default '',
  created_at timestamptz default now(),
  unique(user_id, plan_date)
);

create table if not exists daily_summaries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  summary_date date not null,
  plan_done boolean default false,
  question_count int,
  accuracy numeric(5,2),
  reflection text default '',
  wolai_link text default '',
  created_at timestamptz default now(),
  unique(user_id, summary_date)
);

create table if not exists wrong_questions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  keyword text not null,
  correct_answer text default '',
  error_reason text default 'knowledge' check (error_reason in ('careless', 'knowledge', 'misunderstand', 'time')),
  subject text default '',
  mastered boolean default false,
  created_at timestamptz default now()
);

-- ========== 资料库 ==========

create table if not exists materials (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  storage_path text not null,
  tag text default 'other',
  file_size bigint default 0,
  mime_type text default '',
  created_at timestamptz default now()
);

-- ========== 用户设置 ==========

create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  morning_reminder time default '09:30',
  evening_reminder time default '22:00',
  guokao_exam_date date,
  guangdong_exam_date date,
  xuandiao_exam_date date,
  dashboard_view text default 'tasks' check (dashboard_view in ('simple', 'tasks')),
  updated_at timestamptz default now()
);

-- ========== RLS 策略 ==========

alter table projects enable row level security;
alter table milestones enable row level security;
alter table tasks enable row level security;
alter table weekly_goals enable row level security;
alter table tech_todos enable row level security;
alter table work_logs enable row level security;
alter table exam_events enable row level security;
alter table study_records enable row level security;
alter table courses enable row level security;
alter table course_logs enable row level security;
alter table daily_tasks enable row level security;
alter table daily_plans enable row level security;
alter table daily_summaries enable row level security;
alter table wrong_questions enable row level security;
alter table materials enable row level security;
alter table user_settings enable row level security;

-- 为每张表创建 RLS 策略（用户只能访问自己的数据，可重复执行）
do $$
declare
  t text;
  policy_name text;
begin
  foreach t in array array[
    'projects','milestones','tasks','weekly_goals','tech_todos','work_logs',
    'exam_events','study_records','courses','course_logs','daily_tasks','daily_plans',
    'daily_summaries','wrong_questions','materials','user_settings'
  ]
  loop
    policy_name := 'Users manage own ' || t;
    execute format('drop policy if exists %I on %I', policy_name, t);
    execute format(
      'create policy %I on %I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      policy_name, t
    );
  end loop;
end $$;

-- Storage bucket 与文件策略见 supabase-storage.sql
