import { useMemo, useRef, useState } from 'react';
import { normalize } from '../lib/format';

export interface Option {
  value: string;
  label: string;
}

// Ô lọc: gõ để tìm (không cần dấu) + chọn nhiều giá trị (hiện thành thẻ có ×). Để trống = tất cả.
export default function MultiSelect(props: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const { label, options, value, onChange, placeholder = 'Tất cả' } = props;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const nq = normalize(q);
    return options.filter((o) => !value.includes(o.value) && (!nq || normalize(o.label).includes(nq))).slice(0, 50);
  }, [q, options, value]);

  const add = (v: string) => {
    onChange([...value, v]);
    setQ('');
    inputRef.current?.focus();
  };

  return (
    <label className="ms" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <span className="ms-label">{label}</span>
      <div className="ms-box" onClick={() => inputRef.current?.focus()}>
        {value.map((v) => (
          <span key={v} className="chip">
            {options.find((o) => o.value === v)?.label ?? v}
            <button type="button" aria-label="Bỏ" onClick={() => onChange(value.filter((x) => x !== v))}>
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={q}
          placeholder={value.length ? '' : placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) {
              e.preventDefault();
              add(matches[0].value);
            } else if (e.key === 'Backspace' && !q && value.length) onChange(value.slice(0, -1));
          }}
        />
      </div>
      {open && matches.length > 0 && (
        <ul className="ms-menu">
          {matches.map((o) => (
            <li key={o.value}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(o.value)}>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
