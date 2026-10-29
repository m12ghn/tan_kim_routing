export default function NotConfigured() {
  return (
    <div className="content content-narrow" style={{ paddingTop: 48 }}>
      <div className="card stack">
        <h2>App chưa được nối với Supabase</h2>
        <p>
          Thêm 2 biến <code>SUPABASE_URL</code> và <code>SUPABASE_ANON_KEY</code> trong Vercel → Settings → Environment
          Variables, rồi bấm <strong>Redeploy</strong>.
        </p>
        <p className="muted">Chạy thử trên máy: tạo file .env theo mẫu .env.example.</p>
      </div>
    </div>
  );
}
