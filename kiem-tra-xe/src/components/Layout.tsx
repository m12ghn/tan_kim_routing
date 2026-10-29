import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL } from '../lib/types';
import { APP_NAME, APP_UPDATED, APP_VERSION } from '../lib/version';
import { fmtDate } from '../lib/format';
import ThemeToggle from './ThemeToggle';

const TABS = [
  { to: '/tong-quan', label: 'Tổng quan', managerOnly: true },
  { to: '/kiem-tra', label: 'Kiểm tra xe', managerOnly: false },
];

export default function Layout() {
  const { profile, isManager, signOut } = useAuth();
  const { pathname } = useLocation();
  const tabs = TABS.filter((t) => !t.managerOnly || isManager);
  const current = tabs.find((t) => pathname.startsWith(t.to))?.label ?? '';
  // Trang hiện trường dùng khung hẹp như điện thoại.
  const narrow = pathname.startsWith('/kiem-tra');

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src="/favicon.svg" alt="" width={28} height={28} />
            <span className="brand-name">{APP_NAME}</span>
            {current && <span className="brand-page">· {current}</span>}
          </div>
          <div className="topbar-right">
            {profile && (
              <span className="who" title={ROLE_LABEL[profile.role]}>
                {profile.full_name || profile.username}
              </span>
            )}
            <ThemeToggle />
            <button className="btn btn-ghost" onClick={signOut}>
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {tabs.length > 1 && (
        <nav className="tabs" aria-label="Trang">
          <div className="tabs-inner">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
                {t.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}

      <main className={narrow ? 'content content-narrow' : 'content'}>
        <Outlet />
      </main>

      <footer className="footer">
        {APP_NAME} v{APP_VERSION} · cập nhật {fmtDate(APP_UPDATED)}
      </footer>
    </div>
  );
}
