import { useRef, useState } from 'react';
import { EXTRA_SLOTS, REQUIRED_SLOTS, type PhotoSlot } from '../../lib/photoSlots';
import { compressImage } from '../../lib/image';
import CameraCapture from '../CameraCapture';

export interface PhotoState {
  url: string; // ảnh xem trước (object URL hoặc signed URL)
  state: 'uploading' | 'done' | 'error';
}

// Bước ② Chụp hình: 7 ảnh bắt buộc + tối đa 3 ảnh thêm. Mỗi ô: chụp ngay trong trang hoặc chọn từ máy.
export default function PhotoStep(props: {
  photos: Record<string, PhotoState>;
  onPhoto: (slot: string, blob: Blob) => void;
  onRetry: (slot: string) => void;
  onRemove: (slot: string) => void;
}) {
  const { photos, onPhoto, onRetry, onRemove } = props;
  const [camera, setCamera] = useState<PhotoSlot | null>(null);
  const [pickError, setPickError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const pickSlot = useRef<string>('');

  const extrasUsed = EXTRA_SLOTS.filter((s) => photos[s.key]);
  const nextExtra = EXTRA_SLOTS.find((s) => !photos[s.key]);

  function pick(slot: string) {
    pickSlot.current = slot;
    setPickError('');
    fileRef.current?.click();
  }

  async function onFile(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    try {
      onPhoto(pickSlot.current, await compressImage(file));
    } catch {
      setPickError('Không đọc được ảnh này. Hãy chọn ảnh khác.');
    }
  }

  const tile = (s: PhotoSlot) => {
    const p = photos[s.key];
    return (
      <div key={s.key} className={'ptile' + (p ? ' has' : '') + (p?.state === 'error' ? ' err' : '')}>
        <div className="ptile-img">
          {p ? <img src={p.url} alt={s.label} /> : <span className="ptile-empty">📷</span>}
          {p?.state === 'uploading' && <span className="ptile-flag">⟳ Đang tải</span>}
          {p?.state === 'done' && <span className="ptile-flag ok">✓</span>}
          {p?.state === 'error' && (
            <button className="ptile-flag bad" onClick={() => onRetry(s.key)}>
              ⚠ Lỗi · Thử lại
            </button>
          )}
          {!s.required && p && (
            <button className="ptile-remove" aria-label="Bỏ ảnh" onClick={() => onRemove(s.key)}>
              ×
            </button>
          )}
        </div>
        <div className="ptile-label">
          {s.label}
          {s.required && !p && <span className="req"> *</span>}
        </div>
        <div className="ptile-actions">
          <button className="btn btn-sm" onClick={() => setCamera(s)}>
            📷 Chụp
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => pick(s.key)}>
            🖼 Tải lên
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="ptiles">{REQUIRED_SLOTS.map(tile)}</div>

      <div className="section-sub">
        <h3>
          Ảnh thêm <span className="muted small">(không bắt buộc · {extrasUsed.length}/{EXTRA_SLOTS.length})</span>
        </h3>
      </div>
      <div className="ptiles">
        {extrasUsed.map(tile)}
        {nextExtra && (
          <div className="ptile ptile-add">
            <div className="ptile-img">
              <span className="ptile-empty">＋</span>
            </div>
            <div className="ptile-label">Thêm ảnh</div>
            <div className="ptile-actions">
              <button className="btn btn-sm" onClick={() => setCamera(nextExtra)}>
                📷 Chụp
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => pick(nextExtra.key)}>
                🖼 Tải lên
              </button>
            </div>
          </div>
        )}
      </div>
      {pickError && <p className="error-text">{pickError}</p>}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />

      {camera && (
        <CameraCapture
          title={camera.label}
          onClose={() => setCamera(null)}
          onDone={(blob) => {
            onPhoto(camera.key, blob);
            setCamera(null);
          }}
        />
      )}
    </>
  );
}
