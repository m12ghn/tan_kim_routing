import { useTheme, type ThemeMode } from '../lib/theme';

const LABEL: Record<ThemeMode, string> = { auto: '◐ Tự động', light: '☀ Sáng', dark: '☾ Tối' };
const NEXT: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' };

export default function ThemeToggle() {
  const [mode, setMode] = useTheme();
  return (
    <button className="btn btn-ghost" onClick={() => setMode(NEXT[mode])} title="Đổi giao diện sáng/tối">
      {LABEL[mode]}
    </button>
  );
}
