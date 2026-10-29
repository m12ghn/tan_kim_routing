import { useTheme, type ThemeMode } from '../lib/theme';

const ICON: Record<ThemeMode, string> = { auto: '◐', light: '☀', dark: '☾' };
const LABEL: Record<ThemeMode, string> = { auto: 'Tự động', light: 'Sáng', dark: 'Tối' };
const NEXT: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' };

export default function ThemeToggle() {
  const [mode, setMode] = useTheme();
  return (
    <button className="btn btn-ghost" onClick={() => setMode(NEXT[mode])} title={`Giao diện: ${LABEL[mode]} (bấm để đổi)`}>
      {ICON[mode]} <span className="hide-sm">{LABEL[mode]}</span>
    </button>
  );
}
