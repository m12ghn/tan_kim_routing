-- setup-all.sql: cài mới một lần = gộp tất cả migration theo thứ tự số. Hiện có: migration-001-init.
-- Chạy chung project Supabase với app khác: mọi bảng/hàm/policy có tiền tố kx_, bucket kx-photos.
-- KHÔNG đụng tới bảng, hàm, trigger nào không có tiền tố kx_. Không gắn trigger vào auth.users.
-- Chạy lại nhiều lần được (idempotent). Chạy trong Supabase → SQL Editor.

create extension if not exists pgcrypto;

-- ============================================================
-- 1. Thành viên app + phân quyền (Auth dùng chung, quyền vào app nằm ở đây)
-- ============================================================
create table if not exists public.kx_members (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  full_name   text not null default '',
  role        text not null default 'inspector' check (role in ('inspector','manager','dev')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create or replace function public.kx_is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.kx_members
    where id = (select auth.uid()) and active and role in ('manager','dev')
  );
$$;

create or replace function public.kx_is_dev() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.kx_members
    where id = (select auth.uid()) and active and role = 'dev'
  );
$$;

-- Chỉ dev được cấp/đổi vai trò dev. Cho phép khi chạy từ SQL Editor (auth.uid() rỗng).
create or replace function public.kx_protect_members() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null or public.kx_is_dev() then
    return coalesce(new, old);
  end if;
  if (tg_op <> 'INSERT' and old.role = 'dev') or (tg_op <> 'DELETE' and new.role = 'dev') then
    raise exception 'Chỉ dev được cấp hoặc đổi vai trò dev';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists kx_protect_members on public.kx_members;
create trigger kx_protect_members
  before insert or update or delete on public.kx_members
  for each row execute function public.kx_protect_members();

-- ============================================================
-- 2. Danh mục xe
-- ============================================================
create table if not exists public.kx_vehicles (
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
create table if not exists public.kx_inspections (
  id            uuid primary key,              -- tạo ở máy khách để gửi lại không tạo trùng
  vehicle_id    uuid not null references public.kx_vehicles(id),
  inspector_id  uuid not null references public.kx_members(id),
  status        text not null default 'submitted' check (status in ('submitted','approved','rejected')),
  result        text not null default 'ok' check (result in ('ok','issue')),
  odo           integer check (odo is null or odo >= 0),
  note          text not null default '',
  review_note   text not null default '',
  reviewed_by   uuid references public.kx_members(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists public.kx_inspection_photos (
  id             uuid primary key default gen_random_uuid(),
  inspection_id  uuid not null references public.kx_inspections(id) on delete cascade,
  slot           text not null,                -- vị trí chụp: front, back, left, right, odo, extra…
  path           text not null,                -- đường dẫn trong bucket kx-photos
  created_at     timestamptz not null default now()
);

create index if not exists kx_inspections_created_at_idx on public.kx_inspections (created_at desc);
create index if not exists kx_inspections_vehicle_idx    on public.kx_inspections (vehicle_id, created_at desc);
create index if not exists kx_inspections_inspector_idx  on public.kx_inspections (inspector_id, created_at desc);
create index if not exists kx_inspections_status_idx     on public.kx_inspections (status);
create index if not exists kx_inspection_photos_insp_idx on public.kx_inspection_photos (inspection_id);

-- Gửi phiếu: tạo phiếu + ảnh trong một bước. Gửi lại cùng id thì trả về phiếu cũ, không tạo trùng.
create or replace function public.kx_submit_inspection(
  p_id uuid, p_vehicle_id uuid, p_result text, p_odo integer, p_note text, p_photos jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_last_odo integer;
begin
  if v_uid is null or not exists (select 1 from kx_members where id = v_uid and active) then
    raise exception 'Tài khoản chưa được cấp quyền hoặc đã bị khóa';
  end if;
  if exists (select 1 from kx_inspections where id = p_id) then
    return p_id;
  end if;
  if not exists (select 1 from kx_vehicles where id = p_vehicle_id and active) then
    raise exception 'Xe không tồn tại hoặc đã ngừng theo dõi';
  end if;
  select odo into v_last_odo from kx_inspections
    where vehicle_id = p_vehicle_id and odo is not null and status <> 'rejected'
    order by created_at desc limit 1;
  if p_odo is not null and v_last_odo is not null and p_odo < v_last_odo then
    raise exception 'ODO % nhỏ hơn lần kiểm tra trước (%)', p_odo, v_last_odo;
  end if;

  insert into kx_inspections (id, vehicle_id, inspector_id, result, odo, note)
  values (p_id, p_vehicle_id, v_uid, coalesce(p_result, 'ok'), p_odo, coalesce(p_note, ''));

  insert into kx_inspection_photos (inspection_id, slot, path)
  select p_id, x->>'slot', x->>'path'
  from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) x
  where (x->>'path') like v_uid::text || '/%';   -- chỉ nhận ảnh trong thư mục của chính mình

  return p_id;
end;
$$;

-- Quản lý duyệt / trả lại phiếu.
create or replace function public.kx_review_inspection(p_id uuid, p_status text, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.kx_is_manager() then
    raise exception 'Chỉ quản lý được duyệt phiếu';
  end if;
  if p_status not in ('approved','rejected','submitted') then
    raise exception 'Trạng thái không hợp lệ';
  end if;
  update kx_inspections
     set status = p_status, review_note = coalesce(p_note, ''),
         reviewed_by = (select auth.uid()), reviewed_at = now()
   where id = p_id;
end;
$$;

-- ============================================================
-- 4. Nhật ký thao tác (không ai sửa/xóa được qua app)
-- ============================================================
create table if not exists public.kx_audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  action      text not null,
  row_id      text,
  actor_id    uuid,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists kx_audit_log_created_at_idx on public.kx_audit_log (created_at desc);

create or replace function public.kx_write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into kx_audit_log (table_name, action, row_id, actor_id, old_data, new_data)
  values (
    tg_table_name, tg_op,
    (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',
    (select auth.uid()),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

drop trigger if exists kx_audit_members on public.kx_members;
create trigger kx_audit_members after insert or update or delete on public.kx_members
  for each row execute function public.kx_write_audit();
drop trigger if exists kx_audit_vehicles on public.kx_vehicles;
create trigger kx_audit_vehicles after insert or update or delete on public.kx_vehicles
  for each row execute function public.kx_write_audit();
drop trigger if exists kx_audit_inspections on public.kx_inspections;
create trigger kx_audit_inspections after insert or update or delete on public.kx_inspections
  for each row execute function public.kx_write_audit();

-- ============================================================
-- 5. RLS
-- ============================================================
alter table public.kx_members           enable row level security;
alter table public.kx_vehicles          enable row level security;
alter table public.kx_inspections       enable row level security;
alter table public.kx_inspection_photos enable row level security;
alter table public.kx_audit_log         enable row level security;

drop policy if exists kx_members_select on public.kx_members;
create policy kx_members_select on public.kx_members for select to authenticated
  using ((select auth.uid()) = id or public.kx_is_manager());
drop policy if exists kx_members_write on public.kx_members;
create policy kx_members_write on public.kx_members for all to authenticated
  using (public.kx_is_manager()) with check (public.kx_is_manager());

drop policy if exists kx_vehicles_select on public.kx_vehicles;
create policy kx_vehicles_select on public.kx_vehicles for select to authenticated
  using (exists (select 1 from public.kx_members m where m.id = (select auth.uid()) and m.active));
drop policy if exists kx_vehicles_write on public.kx_vehicles;
create policy kx_vehicles_write on public.kx_vehicles for all to authenticated
  using (public.kx_is_manager()) with check (public.kx_is_manager());

-- Phiếu chỉ tạo qua kx_submit_inspection, duyệt qua kx_review_inspection → không có policy insert/update.
drop policy if exists kx_inspections_select on public.kx_inspections;
create policy kx_inspections_select on public.kx_inspections for select to authenticated
  using ((select auth.uid()) = inspector_id or public.kx_is_manager());

drop policy if exists kx_inspection_photos_select on public.kx_inspection_photos;
create policy kx_inspection_photos_select on public.kx_inspection_photos for select to authenticated
  using (exists (
    select 1 from public.kx_inspections i
    where i.id = inspection_id and ((select auth.uid()) = i.inspector_id or public.kx_is_manager())
  ));

drop policy if exists kx_audit_log_select on public.kx_audit_log;
create policy kx_audit_log_select on public.kx_audit_log for select to authenticated
  using (public.kx_is_dev());

-- ============================================================
-- 6. Storage: bucket kx-photos (Private, 5MB)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kx-photos', 'kx-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists kx_photos_insert_own on storage.objects;
create policy kx_photos_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'kx-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.kx_members m where m.id = (select auth.uid()) and m.active)
  );
drop policy if exists kx_photos_select on storage.objects;
create policy kx_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'kx-photos' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or public.kx_is_manager()
  ));

notify pgrst, 'reload schema';
