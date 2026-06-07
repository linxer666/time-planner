-- 资料库 Storage 配置（在 supabase-schema.sql 之后执行）

-- 1. 创建私有 bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'materials',
  'materials',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. Storage 访问策略（按用户 ID 分文件夹）
drop policy if exists "Users upload own materials" on storage.objects;
drop policy if exists "Users read own materials" on storage.objects;
drop policy if exists "Users delete own materials" on storage.objects;
drop policy if exists "Users update own materials" on storage.objects;

create policy "Users upload own materials"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'materials'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users read own materials"
on storage.objects for select to authenticated
using (
  bucket_id = 'materials'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users update own materials"
on storage.objects for update to authenticated
using (
  bucket_id = 'materials'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'materials'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users delete own materials"
on storage.objects for delete to authenticated
using (
  bucket_id = 'materials'
  and (storage.foldername(name))[1] = auth.uid()::text
);
