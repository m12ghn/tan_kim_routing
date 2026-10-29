import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Chỉ nhúng đúng 2 biến công khai vào trình duyệt. Mọi biến khác (kể cả service_role) không bao giờ lọt ra.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      __SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL ?? ''),
      __SUPABASE_ANON_KEY__: JSON.stringify(env.SUPABASE_ANON_KEY ?? ''),
    },
  };
});
