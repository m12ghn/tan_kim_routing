-- schema.sql: toàn bộ cấu trúc DB hiện tại của app Kiểm tra xe (= migration-001 + migration-002).
-- Khi thêm migration mới, cập nhật file này cho khớp.

-- migration-001-init: nền tảng app Kiểm tra xe
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

-- migration-002-checklist-flow: luồng Chọn xe → Chụp hình → Checklist, dữ liệu xe đồng bộ từ Google Sheet.
-- Chạy SAU migration-001. Chạy lại nhiều lần được. Vẫn chỉ đụng đối tượng có tiền tố kx_.

-- ============================================================
-- 1. Xe: thêm cột lấy từ sheet "Data xe"
-- ============================================================
alter table public.kx_vehicles add column if not exists fleet        text not null default '';  -- cột AQ "Đội xe"
alter table public.kx_vehicles add column if not exists brand        text not null default '';  -- D "Hãng xe"
alter table public.kx_vehicles add column if not exists model        text not null default '';  -- E "Model"
alter table public.kx_vehicles add column if not exists payload_kg   integer;                   -- C "Tải trọng"
alter table public.kx_vehicles add column if not exists year         integer;                   -- F "Năm SX"
alter table public.kx_vehicles add column if not exists sheet_status text not null default '';  -- A "Tình trạng"
alter table public.kx_vehicles add column if not exists odo          bigint;                    -- AK "Số ODO"
alter table public.kx_vehicles add column if not exists odo_at       date;                      -- AL "Thời gian up ODO"
alter table public.kx_vehicles add column if not exists synced_at    timestamptz;

-- Đồng bộ cả danh sách xe trong một bước (chỉ server gọi bằng service_role).
-- Xe không còn trong sheet thì active = false.
create or replace function public.kx_sync_vehicles(p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_upserted int;
  v_deactivated int;
begin
  with src as (
    select distinct on (upper(trim(r.plate))) upper(trim(r.plate)) as plate, r.fleet, r.brand, r.model,
           r.payload_kg, r.year, r.sheet_status, r.odo, r.odo_at
    from jsonb_to_recordset(p_rows) as r(
      plate text, fleet text, brand text, model text, payload_kg integer, year integer,
      sheet_status text, odo bigint, odo_at date)
    where coalesce(trim(r.plate), '') <> ''
  )
  insert into kx_vehicles as v (plate, fleet, brand, model, payload_kg, year, sheet_status, odo, odo_at, active, synced_at)
  select plate, coalesce(fleet, ''), coalesce(brand, ''), coalesce(model, ''), payload_kg, year,
         coalesce(sheet_status, ''), odo, odo_at, true, now()
  from src
  on conflict (plate) do update set
    fleet = excluded.fleet, brand = excluded.brand, model = excluded.model,
    payload_kg = excluded.payload_kg, year = excluded.year, sheet_status = excluded.sheet_status,
    odo = excluded.odo, odo_at = excluded.odo_at, active = true, synced_at = excluded.synced_at;
  get diagnostics v_upserted = row_count;

  update kx_vehicles set active = false
   where active and plate not in (
     select upper(trim(r->>'plate')) from jsonb_array_elements(p_rows) r where coalesce(trim(r->>'plate'), '') <> '');
  get diagnostics v_deactivated = row_count;

  return jsonb_build_object('upserted', v_upserted, 'deactivated', v_deactivated);
end;
$$;
revoke all on function public.kx_sync_vehicles(jsonb) from public, anon, authenticated;
grant execute on function public.kx_sync_vehicles(jsonb) to service_role;

-- ============================================================
-- 2. Phiếu kiểm tra: bỏ duyệt, thêm bắt đầu/hoàn tất, mức, checklist
-- ============================================================
alter table public.kx_inspections add column if not exists started_at    timestamptz not null default now();
alter table public.kx_inspections add column if not exists completed_at  timestamptz;
alter table public.kx_inspections add column if not exists level         text;
alter table public.kx_inspections add column if not exists checklist     jsonb not null default '{}'::jsonb;
alter table public.kx_inspections add column if not exists other_note    text not null default '';
alter table public.kx_inspections add column if not exists abnormal_note text not null default '';

-- Phiếu cũ (luồng gửi + duyệt) coi như đã hoàn tất.
alter table public.kx_inspections drop constraint if exists kx_inspections_status_check;
update public.kx_inspections set status = 'completed', completed_at = coalesce(completed_at, created_at),
       level = coalesce(level, 'normal')
 where status not in ('in_progress','completed','cancelled');
alter table public.kx_inspections alter column status set default 'in_progress';
alter table public.kx_inspections add constraint kx_inspections_status_check
  check (status in ('in_progress','completed','cancelled'));
alter table public.kx_inspections drop constraint if exists kx_inspections_level_check;
alter table public.kx_inspections add constraint kx_inspections_level_check
  check (level is null or level in ('normal','review','abnormal'));

alter table public.kx_inspections drop column if exists result;
alter table public.kx_inspections drop column if exists review_note;
alter table public.kx_inspections drop column if exists reviewed_by;
alter table public.kx_inspections drop column if exists reviewed_at;

-- Mỗi xe chỉ có 1 phiếu đang kiểm tra.
create unique index if not exists kx_inspections_one_open_per_vehicle
  on public.kx_inspections (vehicle_id) where status = 'in_progress';
create index if not exists kx_inspections_completed_idx
  on public.kx_inspections (vehicle_id, completed_at desc) where status = 'completed';

-- Ảnh: mỗi vị trí chụp 1 ảnh, chụp lại thì thay.
delete from public.kx_inspection_photos a using public.kx_inspection_photos b
 where a.inspection_id = b.inspection_id and a.slot = b.slot and a.created_at < b.created_at;
create unique index if not exists kx_inspection_photos_slot_uq on public.kx_inspection_photos (inspection_id, slot);

drop function if exists public.kx_submit_inspection(uuid, uuid, text, integer, text, jsonb);
drop function if exists public.kx_review_inspection(uuid, text, text);

create or replace function public.kx_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.kx_members where id = (select auth.uid()) and active);
$$;

-- Bắt đầu kiểm tra (ghi log bắt đầu). Đang kiểm tra dở xe này thì trả về phiếu cũ.
create or replace function public.kx_start_inspection(p_id uuid, p_vehicle_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_open record;
  v_odo bigint;
begin
  if not public.kx_is_member() then
    raise exception 'Tài khoản chưa được cấp quyền hoặc đã bị khóa';
  end if;
  if exists (select 1 from kx_inspections where id = p_id) then
    return p_id;
  end if;
  select odo into v_odo from kx_vehicles where id = p_vehicle_id and active;
  if not found then
    raise exception 'Xe không có trong danh sách. Báo quản lý đồng bộ lại dữ liệu xe.';
  end if;

  select i.id, i.inspector_id, i.started_at, m.full_name, m.username into v_open
    from kx_inspections i join kx_members m on m.id = i.inspector_id
   where i.vehicle_id = p_vehicle_id and i.status = 'in_progress';
  if found then
    if v_open.inspector_id = v_uid then
      return v_open.id;
    elsif v_open.started_at > now() - interval '12 hours' then
      raise exception 'Xe đang được % kiểm tra từ %. Đợi xong hoặc báo quản lý hủy phiếu đó.',
        coalesce(nullif(v_open.full_name, ''), v_open.username),
        to_char(v_open.started_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM');
    else
      update kx_inspections set status = 'cancelled' where id = v_open.id;  -- bỏ dở quá 12 giờ
    end if;
  end if;

  insert into kx_inspections (id, vehicle_id, inspector_id, status, odo, started_at)
  values (p_id, p_vehicle_id, v_uid, 'in_progress', v_odo, now());
  return p_id;
end;
$$;

-- Gắn ảnh vào một vị trí. Trả về đường dẫn ảnh cũ (nếu chụp lại) để máy khách xóa file.
create or replace function public.kx_set_photo(p_inspection_id uuid, p_slot text, p_path text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_old text;
begin
  if p_slot not in ('front','left','back','tire','right','odo','cabin','extra1','extra2','extra3') then
    raise exception 'Vị trí ảnh không hợp lệ';
  end if;
  if p_path is null or p_path not like v_uid::text || '/%' then
    raise exception 'Đường dẫn ảnh không hợp lệ';
  end if;
  if not exists (select 1 from kx_inspections where id = p_inspection_id and inspector_id = v_uid and status = 'in_progress') then
    raise exception 'Phiếu không còn ở trạng thái đang kiểm tra';
  end if;
  select path into v_old from kx_inspection_photos where inspection_id = p_inspection_id and slot = p_slot;
  insert into kx_inspection_photos (inspection_id, slot, path) values (p_inspection_id, p_slot, p_path)
  on conflict (inspection_id, slot) do update set path = excluded.path, created_at = now();
  return case when v_old is distinct from p_path then v_old end;
end;
$$;

create or replace function public.kx_remove_photo(p_inspection_id uuid, p_slot text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_old text;
begin
  if not exists (select 1 from kx_inspections where id = p_inspection_id and inspector_id = (select auth.uid()) and status = 'in_progress') then
    raise exception 'Phiếu không còn ở trạng thái đang kiểm tra';
  end if;
  delete from kx_inspection_photos where inspection_id = p_inspection_id and slot = p_slot returning path into v_old;
  return v_old;
end;
$$;

-- Hoàn tất kiểm tra (ghi log hoàn tất). Mức do server tính:
--   có đánh dấu Bất thường → abnormal; có ít nhất 1 mục ✗ → review; còn lại → normal.
create or replace function public.kx_complete_inspection(
  p_id uuid, p_checklist jsonb, p_other_note text, p_abnormal boolean, p_abnormal_note text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_items text[] := array['body','spare','fuel','battery','parts','tire','lights','door_seal'];
  v_required text[] := array['front','left','back','tire','right','odo','cabin'];
  v_item text;
  v_ok boolean;
  v_note text;
  v_clean jsonb := '{}'::jsonb;
  v_failed int := 0;
  v_missing text[];
  v_level text;
  v_status text;
begin
  select status into v_status from kx_inspections where id = p_id and inspector_id = (select auth.uid());
  if v_status is null then
    raise exception 'Không tìm thấy phiếu kiểm tra';
  end if;
  if v_status = 'completed' then
    return (select level from kx_inspections where id = p_id);   -- gửi lại: không làm gì thêm
  end if;
  if v_status <> 'in_progress' then
    raise exception 'Phiếu đã bị hủy. Hãy bắt đầu kiểm tra lại.';
  end if;

  select array_agg(s) into v_missing from unnest(v_required) s
   where not exists (select 1 from kx_inspection_photos where inspection_id = p_id and slot = s);
  if v_missing is not null then
    raise exception 'Còn thiếu % ảnh bắt buộc', array_length(v_missing, 1);
  end if;

  foreach v_item in array v_items loop
    v_ok := coalesce((p_checklist -> v_item ->> 'ok')::boolean, true);
    v_note := trim(coalesce(p_checklist -> v_item ->> 'note', ''));
    if not v_ok then
      if v_note = '' then
        raise exception 'Mục đánh dấu ✗ cần có chú thích';
      end if;
      v_failed := v_failed + 1;
    end if;
    v_clean := v_clean || jsonb_build_object(v_item, jsonb_build_object('ok', v_ok, 'note', case when v_ok then '' else v_note end));
  end loop;

  if coalesce(p_abnormal, false) and trim(coalesce(p_abnormal_note, '')) = '' then
    raise exception 'Đánh dấu Bất thường cần ghi note';
  end if;
  v_level := case when coalesce(p_abnormal, false) then 'abnormal' when v_failed > 0 then 'review' else 'normal' end;

  update kx_inspections set
    status = 'completed', completed_at = now(), level = v_level, checklist = v_clean,
    other_note = trim(coalesce(p_other_note, '')),
    abnormal_note = case when coalesce(p_abnormal, false) then trim(p_abnormal_note) else '' end
  where id = p_id;
  return v_level;
end;
$$;

-- Hủy phiếu đang kiểm tra (người kiểm tra hoặc quản lý).
create or replace function public.kx_cancel_inspection(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update kx_inspections set status = 'cancelled'
   where id = p_id and status = 'in_progress'
     and (inspector_id = (select auth.uid()) or public.kx_is_manager());
  if not found then
    raise exception 'Không hủy được: phiếu không còn đang kiểm tra hoặc bạn không có quyền';
  end if;
end;
$$;

-- Tóm tắt mỗi xe: lần hoàn tất gần nhất (ngày, mức, người) + phiếu đang kiểm tra (nếu có).
create or replace function public.kx_vehicle_summary()
returns table (
  vehicle_id uuid, last_inspection_id uuid, last_completed_at timestamptz, last_level text,
  last_inspector text, completed_count bigint,
  open_inspection_id uuid, open_inspector_id uuid, open_inspector text, open_started_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select v.id,
         lc.id, lc.completed_at, lc.level, lc.inspector, coalesce(cnt.n, 0),
         op.id, op.inspector_id, op.inspector, op.started_at
  from kx_vehicles v
  left join lateral (
    select i.id, i.completed_at, i.level, coalesce(nullif(m.full_name, ''), m.username) as inspector
    from kx_inspections i join kx_members m on m.id = i.inspector_id
    where i.vehicle_id = v.id and i.status = 'completed'
    order by i.completed_at desc limit 1
  ) lc on true
  left join lateral (
    select count(*) as n from kx_inspections i where i.vehicle_id = v.id and i.status = 'completed'
  ) cnt on true
  left join lateral (
    select i.id, i.inspector_id, i.started_at, coalesce(nullif(m.full_name, ''), m.username) as inspector
    from kx_inspections i join kx_members m on m.id = i.inspector_id
    where i.vehicle_id = v.id and i.status = 'in_progress'
    limit 1
  ) op on true
  where public.kx_is_member();
$$;

-- ============================================================
-- 3. Quyền đọc: mọi thành viên xem được tổng quan và báo cáo của mọi xe
-- ============================================================
drop policy if exists kx_inspections_select on public.kx_inspections;
create policy kx_inspections_select on public.kx_inspections for select to authenticated
  using (public.kx_is_member());

drop policy if exists kx_inspection_photos_select on public.kx_inspection_photos;
create policy kx_inspection_photos_select on public.kx_inspection_photos for select to authenticated
  using (public.kx_is_member());

drop policy if exists kx_members_select on public.kx_members;
create policy kx_members_select on public.kx_members for select to authenticated
  using (public.kx_is_member());

drop policy if exists kx_photos_select on storage.objects;
create policy kx_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'kx-photos' and public.kx_is_member());

drop policy if exists kx_photos_delete_own on storage.objects;
create policy kx_photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'kx-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

notify pgrst, 'reload schema';
