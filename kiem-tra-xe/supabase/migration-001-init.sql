-- migration-001-init: nền tảng app Kiểm tra xe
-- Chạy lại nhiều lần được (idempotent). Chạy trong Supabase → SQL Editor.

create extension if not exists pgcrypto;

-- ============================================================
-- 1. Hồ sơ người dùng + phân quyền
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  full_name   text not null default '',
  role        text not null default 'inspector' check (role in ('inspector','manager','dev')),
  active      boolean not null default true,
  email       text,
  created_at  timestamptz not null default now()
);

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active and role in ('manager','dev')
  );
$$;

create or replace function public.is_dev() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active and role = 'dev'
  );
$$;

-- Tạo profile khi có user mới trong Auth. username lấy từ metadata hoặc phần trước @ của email giả.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'inspector'),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Không cho tự đổi role/active/email/username. Cho phép khi chạy từ SQL Editor (auth.uid() rỗng).
create or replace function public.protect_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null or public.is_manager() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.active is distinct from old.active
     or new.email is distinct from old.email
     or new.username is distinct from old.username then
    raise exception 'Bạn không có quyền đổi vai trò hoặc trạng thái tài khoản';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_role on public.profiles;
create trigger protect_role
  before update on public.profiles
  for each row execute function public.protect_role();

-- ============================================================
-- 2. Danh mục xe
-- ============================================================
create table if not exists public.vehicles (
  id            uuid primary key default gen_random_uuid(),
  plate         text unique not null,          -- biển số, ví dụ 51K-888.99
  vehicle_type  text not null default '',      -- loại xe (tải 1,5T, van…)
  note          text not null default '',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- 3. Phiếu kiểm tra + ảnh
-- ============================================================
create table if not exists public.inspections (
  id            uuid primary key,              -- tạo ở máy khách để gửi lại không tạo trùng
  vehicle_id    uuid not null references public.vehicles(id),
  inspector_id  uuid not null references public.profiles(id) default auth.uid(),
  status        text not null default 'submitted' check (status in ('submitted','approved','rejected')),
  result        text not null default 'ok' check (result in ('ok','issue')),
  odo           integer check (odo is null or odo >= 0),
  note          text not null default '',
  review_note   text not null default '',
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists public.inspection_photos (
  id             uuid primary key default gen_random_uuid(),
  inspection_id  uuid not null references public.inspections(id) on delete cascade,
  slot           text not null,                -- vị trí chụp: front, back, left, right, odo, extra…
  path           text not null,                -- đường dẫn trong bucket photos
  created_at     timestamptz not null default now()
);

create index if not exists inspections_created_at_idx on public.inspections (created_at desc);
create index if not exists inspections_vehicle_idx    on public.inspections (vehicle_id, created_at desc);
create index if not exists inspections_inspector_idx  on public.inspections (inspector_id, created_at desc);
create index if not exists inspections_status_idx     on public.inspections (status);
create index if not exists inspection_photos_insp_idx on public.inspection_photos (inspection_id);

-- Gửi phiếu: tạo phiếu + ảnh trong một bước. Gửi lại cùng id thì trả về phiếu cũ, không tạo trùng.
create or replace function public.submit_inspection(
  p_id uuid, p_vehicle_id uuid, p_result text, p_odo integer, p_note text, p_photos jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_last_odo integer;
begin
  if v_uid is null or not exists (select 1 from profiles where id = v_uid and active) then
    raise exception 'Tài khoản không hợp lệ hoặc đã bị khóa';
  end if;
  if exists (select 1 from inspections where id = p_id) then
    return p_id;
  end if;
  if not exists (select 1 from vehicles where id = p_vehicle_id and active) then
    raise exception 'Xe không tồn tại hoặc đã ngừng theo dõi';
  end if;
  select odo into v_last_odo from inspections
    where vehicle_id = p_vehicle_id and odo is not null and status <> 'rejected'
    order by created_at desc limit 1;
  if p_odo is not null and v_last_odo is not null and p_odo < v_last_odo then
    raise exception 'ODO % nhỏ hơn lần kiểm tra trước (%)', p_odo, v_last_odo;
  end if;

  insert into inspections (id, vehicle_id, inspector_id, result, odo, note)
  values (p_id, p_vehicle_id, v_uid, coalesce(p_result, 'ok'), p_odo, coalesce(p_note, ''));

  insert into inspection_photos (inspection_id, slot, path)
  select p_id, x->>'slot', x->>'path'
  from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) x
  where (x->>'path') like v_uid::text || '/%';   -- chỉ nhận ảnh trong thư mục của chính mình

  return p_id;
end;
$$;

-- Quản lý duyệt / trả lại phiếu.
create or replace function public.review_inspection(p_id uuid, p_status text, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then
    raise exception 'Chỉ quản lý được duyệt phiếu';
  end if;
  if p_status not in ('approved','rejected','submitted') then
    raise exception 'Trạng thái không hợp lệ';
  end if;
  update inspections
     set status = p_status, review_note = coalesce(p_note, ''),
         reviewed_by = (select auth.uid()), reviewed_at = now()
   where id = p_id;
end;
$$;

-- ============================================================
-- 4. Nhật ký thao tác (không ai sửa/xóa được qua app)
-- ============================================================
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  action      text not null,
  row_id      text,
  actor_id    uuid,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);

create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (table_name, action, row_id, actor_id, old_data, new_data)
  values (
    tg_table_name, tg_op,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', null),
    (select auth.uid()),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.write_audit();
drop trigger if exists audit_vehicles on public.vehicles;
create trigger audit_vehicles after insert or update or delete on public.vehicles
  for each row execute function public.write_audit();
drop trigger if exists audit_inspections on public.inspections;
create trigger audit_inspections after insert or update or delete on public.inspections
  for each row execute function public.write_audit();

-- ============================================================
-- 5. RLS
-- ============================================================
alter table public.profiles          enable row level security;
alter table public.vehicles          enable row level security;
alter table public.inspections       enable row level security;
alter table public.inspection_photos enable row level security;
alter table public.audit_log         enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using ((select auth.uid()) = id or public.is_manager());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id or public.is_manager())
  with check ((select auth.uid()) = id or public.is_manager());

drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles for select to authenticated using (true);
drop policy if exists vehicles_write on public.vehicles;
create policy vehicles_write on public.vehicles for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- Phiếu chỉ tạo qua submit_inspection, duyệt qua review_inspection → không có policy insert/update.
drop policy if exists inspections_select on public.inspections;
create policy inspections_select on public.inspections for select to authenticated
  using ((select auth.uid()) = inspector_id or public.is_manager());

drop policy if exists inspection_photos_select on public.inspection_photos;
create policy inspection_photos_select on public.inspection_photos for select to authenticated
  using (exists (
    select 1 from public.inspections i
    where i.id = inspection_id and ((select auth.uid()) = i.inspector_id or public.is_manager())
  ));

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_dev());

-- ============================================================
-- 6. Storage: bucket photos (Private, 5MB)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists photos_insert_own on storage.objects;
create policy photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists photos_select on storage.objects;
create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or public.is_manager()
  ));

notify pgrst, 'reload schema';
