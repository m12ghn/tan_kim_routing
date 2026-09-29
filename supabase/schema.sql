-- Chạy 1 lần trong Supabase > SQL Editor.
-- Lưu bộ tuyến cấu hình chung (1 dòng id='main') để mọi người mở trang đều thấy cùng 1 bản.
create table if not exists public.tk_config (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,   -- { savedAt, ruleSeq, months:{T10:{excluded,custom},...} }
  version    integer not null default 0,           -- tăng 1 mỗi lần lưu, dùng để phát hiện 2 người sửa cùng lúc
  updated_at timestamptz not null default now()
);

-- Lịch sử mỗi lần lưu (để xem lại / khôi phục nếu lỡ tay).
create table if not exists public.tk_config_history (
  id         bigserial primary key,
  version    integer not null,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

insert into public.tk_config (id) values ('main') on conflict (id) do nothing;

-- Chỉ cho server (service_role key, giữ ở biến môi trường Vercel) đọc/ghi.
-- Bật RLS và KHÔNG tạo policy nào => key public (anon) không đụng được vào 2 bảng này.
alter table public.tk_config enable row level security;
alter table public.tk_config_history enable row level security;
