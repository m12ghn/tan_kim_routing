import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { supabaseConfigured } from './lib/supabase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Inspect from './pages/Inspect';
import InspectionReport from './pages/InspectionReport';
import NotConfigured from './pages/NotConfigured';
import { SkeletonRows } from './components/Skeleton';

export default function App() {
  const { loading, profile, isManager } = useAuth();

  if (!supabaseConfigured) return <NotConfigured />;
  if (loading)
    return (
      <div className="content content-narrow" style={{ paddingTop: 48 }}>
        <SkeletonRows n={4} />
      </div>
    );
  if (!profile) return <Login />;

  const home = isManager ? '/tong-quan' : '/kiem-tra';
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/tong-quan" element={<Overview />} />
        <Route path="/kiem-tra" element={<Inspect />} />
        <Route path="/phieu/:id" element={<InspectionReport />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  );
}
