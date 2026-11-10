-- 初稿：本地审查用，尚未在 Supabase 上执行或验证。
-- 不要把 service_role 或 secret key 置于浏览器或版本库。
begin;
create table public.reader_books (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  encoding text not null check (encoding in ('utf-8', 'gb18030')),
  storage_path text not null unique,
  state text not null default 'uploading' check (state in ('uploading','ready','deleting')),
  created_at timestamptz not null default now(),
  unique (owner_id, id),
  check (storage_path = owner_id::text || '/' || id::text || '.txt')
);
create table public.reader_progress (
  owner_id uuid not null,
  book_id uuid not null,
  paragraph_index integer not null default 0 check (paragraph_index >= 0),
  paragraph_ratio double precision not null default 0 check (paragraph_ratio between 0 and 1),
  progress double precision not null default 0 check (progress between 0 and 100),
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, book_id),
  foreign key (owner_id, book_id) references public.reader_books(owner_id, id) on delete cascade
);
alter table public.reader_books enable row level security;
alter table public.reader_progress enable row level security;
create policy books_select on public.reader_books for select to authenticated using ((select auth.uid()) = owner_id);
create policy books_insert on public.reader_books for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy books_update on public.reader_books for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy books_delete on public.reader_books for delete to authenticated using ((select auth.uid()) = owner_id);
create policy progress_select on public.reader_progress for select to authenticated using ((select auth.uid()) = owner_id);
create policy progress_insert on public.reader_progress for insert to authenticated with check ((select auth.uid()) = owner_id);
-- 使用服务端事务或安全受控 RPC 实现版本比较和更新；不直接授予客户端 update。
revoke all on public.reader_books, public.reader_progress from anon, authenticated;
grant select, insert, delete on public.reader_books to authenticated;
grant update (state) on public.reader_books to authenticated;
grant select, insert on public.reader_progress to authenticated;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reader-books', 'reader-books', false, 10485760, array['text/plain'])
on conflict (id) do nothing;
do $$ begin
  if exists (select 1 from storage.buckets where id = 'reader-books' and public) then
    raise exception 'reader-books bucket must be private';
  end if;
end $$;
create policy reader_storage_select on storage.objects for select to authenticated
using (bucket_id = 'reader-books' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy reader_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'reader-books' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy reader_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'reader-books' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 进度写入入口：同一操作 ID 可安全重试；旧版本不会覆盖另一设备的新进度。
alter table public.reader_progress add column last_operation_id uuid;
create or replace function public.save_reader_progress(
  p_book_id uuid, p_expected_version bigint, p_operation_id uuid,
  p_index integer, p_ratio double precision, p_progress double precision
) returns table (version bigint, paragraph_index integer, paragraph_ratio double precision, progress double precision, accepted boolean)
language plpgsql security definer set search_path = '' as $$
declare current_row public.reader_progress%rowtype; uid uuid := auth.uid();
begin
  if uid is null or p_operation_id is null or p_expected_version is null
     or p_index is null or p_index < 0 or p_ratio is null or p_ratio not between 0 and 1
     or p_progress is null or p_progress not between 0 and 100 then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  -- 锁定书籍行，序列化首次创建、删除和进度写入。
  perform 1 from public.reader_books b where b.id = p_book_id and b.owner_id = uid and b.state = 'ready' for update;
  if not found then raise exception 'book unavailable' using errcode = 'P0002'; end if;
  select * into current_row from public.reader_progress p where p.owner_id = uid and p.book_id = p_book_id for update;
  if not found then
    if p_expected_version <> 0 then raise exception 'invalid version' using errcode = '22023'; end if;
    insert into public.reader_progress(owner_id,book_id,paragraph_index,paragraph_ratio,progress,version,last_operation_id)
      values(uid,p_book_id,p_index,p_ratio,p_progress,1,p_operation_id) returning * into current_row;
    return query select current_row.version,current_row.paragraph_index,current_row.paragraph_ratio,current_row.progress,true;
    return;
  end if;
  if current_row.last_operation_id = p_operation_id then
    return query select current_row.version,current_row.paragraph_index,current_row.paragraph_ratio,current_row.progress,true;
  elsif current_row.version <> p_expected_version then
    return query select current_row.version,current_row.paragraph_index,current_row.paragraph_ratio,current_row.progress,false;
  else
    update public.reader_progress p set paragraph_index=p_index, paragraph_ratio=p_ratio, progress=p_progress,
      version=p.version+1, last_operation_id=p_operation_id, updated_at=now()
      where p.owner_id=uid and p.book_id=p_book_id returning * into current_row;
    return query select current_row.version,current_row.paragraph_index,current_row.paragraph_ratio,current_row.progress,true;
  end if;
end $$;
revoke all on function public.save_reader_progress(uuid,bigint,uuid,integer,double precision,double precision) from public, anon;
grant execute on function public.save_reader_progress(uuid,bigint,uuid,integer,double precision,double precision) to authenticated;
revoke insert on public.reader_progress from authenticated;
commit;
