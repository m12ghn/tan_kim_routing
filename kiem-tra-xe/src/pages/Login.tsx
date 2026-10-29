import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { APP_NAME, APP_VERSION } from '../lib/version';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
  const { signIn, error: authError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) return setError('Nhập tên đăng nhập và mật khẩu.');
    setBusy(true);
    setError('');
    const err = await signIn(username, password);
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  const msg = error || authError;
  return (
    <div className="login">
      <div className="login-theme">
        <ThemeToggle />
      </div>
      <form className="card login-card stack" onSubmit={submit}>
        <div className="brand">
          <img src="/favicon.svg" alt="" width={36} height={36} />
          <span className="brand-name" style={{ fontSize: 22 }}>
            {APP_NAME}
          </span>
        </div>
        <label className="field">
          <span>Tên đăng nhập</span>
          <input
            autoComplete="username"
            inputMode="text"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Ví dụ 10001"
          />
        </label>
        <label className="field">
          <span>Mật khẩu</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {msg && <p className="error-text">{msg}</p>}
        <button className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        <p className="muted small center">v{APP_VERSION}</p>
      </form>
    </div>
  );
}
