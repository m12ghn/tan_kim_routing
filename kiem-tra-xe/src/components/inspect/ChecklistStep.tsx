import { useState } from 'react';
import { CHECK_ITEMS, type Checklist } from '../../lib/checklist';

// Bước ③ Checklist: 8 mục mặc định ✓, bấm ✗ thì bắt buộc ghi chú; mục Khác; nút Bất thường mở bảng nhập note.
export default function ChecklistStep(props: {
  checklist: Checklist;
  otherNote: string;
  abnormal: boolean;
  abnormalNote: string;
  showErrors: boolean;
  onChange: (patch: { checklist?: Checklist; otherNote?: string; abnormal?: boolean; abnormalNote?: string }) => void;
}) {
  const { checklist, otherNote, abnormal, abnormalNote, showErrors, onChange } = props;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [sheetError, setSheetError] = useState('');

  const set = (key: string, entry: { ok: boolean; note: string }) => onChange({ checklist: { ...checklist, [key]: entry } });

  function openSheet() {
    setNoteDraft(abnormalNote);
    setSheetError('');
    setSheetOpen(true);
  }

  function saveAbnormal() {
    if (!noteDraft.trim()) return setSheetError('Ghi rõ tình trạng bất thường cần sửa chữa.');
    onChange({ abnormal: true, abnormalNote: noteDraft.trim() });
    setSheetOpen(false);
  }

  return (
    <>
      <ul className="checklist">
        {CHECK_ITEMS.map((c) => {
          const e = checklist[c.key] ?? { ok: true, note: '' };
          const missing = showErrors && !e.ok && !e.note.trim();
          return (
            <li key={c.key} className={e.ok ? '' : 'failed'}>
              <div className="check-row">
                <span className="check-label">{c.label}</span>
                <div className="check-toggle" role="group" aria-label={c.label}>
                  <button
                    className={'tick' + (e.ok ? ' on' : '')}
                    aria-pressed={e.ok}
                    aria-label="Đạt"
                    onClick={() => set(c.key, { ok: true, note: '' })}
                  >
                    ✓
                  </button>
                  <button
                    className={'cross' + (!e.ok ? ' on' : '')}
                    aria-pressed={!e.ok}
                    aria-label="Không đạt"
                    onClick={() => set(c.key, { ok: false, note: e.note })}
                  >
                    ✗
                  </button>
                </div>
              </div>
              {!e.ok && (
                <>
                  <textarea
                    className="input"
                    rows={2}
                    autoFocus={!e.note}
                    placeholder={`Chú thích ${c.label.toLowerCase()}: hư gì, ở đâu…`}
                    value={e.note}
                    onChange={(ev) => set(c.key, { ok: false, note: ev.target.value })}
                  />
                  {missing && <p className="error-text">Ghi chú thích cho mục này.</p>}
                </>
              )}
            </li>
          );
        })}
        <li>
          <label className="field">
            <span>Khác</span>
            <textarea
              className="input"
              rows={2}
              placeholder="Ghi thêm nếu cần (không bắt buộc)"
              value={otherNote}
              onChange={(e) => onChange({ otherNote: e.target.value })}
            />
          </label>
        </li>
      </ul>

      {abnormal ? (
        <div className="abnormal-box">
          <div>
            <strong>✕ Đã đánh dấu Bất thường — Cần sửa chữa</strong>
            <p>{abnormalNote}</p>
          </div>
          <div className="row">
            <button className="btn btn-sm" onClick={openSheet}>
              Sửa note
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => onChange({ abnormal: false })}>
              Bỏ đánh dấu
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-danger btn-lg btn-block" onClick={openSheet}>
          Bất thường — Cần sửa chữa
        </button>
      )}

      {sheetOpen && (
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="sheet" role="dialog" aria-label="Bất thường — Cần sửa chữa" onClick={(e) => e.stopPropagation()}>
            <h2>Bất thường — Cần sửa chữa</h2>
            <textarea
              className="input"
              rows={4}
              autoFocus
              placeholder="Mô tả tình trạng cần sửa chữa"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            {sheetError && <p className="error-text">{sheetError}</p>}
            <div className="sheet-actions">
              <button className="btn btn-ghost btn-lg" onClick={() => setSheetOpen(false)}>
                Hủy
              </button>
              <button className="btn btn-danger-solid btn-lg" onClick={saveAbnormal}>
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
