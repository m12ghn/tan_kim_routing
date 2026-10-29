import { useEffect, useRef, useState } from 'react';
import { canvasToJpeg, compressImage } from '../lib/image';

const MAX_SIDE = 1280;

// Chụp ảnh ngay trong trang (không mở app camera ngoài, tránh trình duyệt reload mất dữ liệu).
// Luôn cho chọn ảnh có sẵn khi camera không dùng được.
export default function CameraCapture(props: { title: string; onDone: (photo: Blob) => void; onClose: () => void }) {
  const { title, onDone, onClose } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Trình duyệt này không mở được camera trong trang. Hãy chọn ảnh có sẵn.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setReady(true);
      } catch {
        setError('Không mở được camera. Hãy cho phép quyền camera trong trình duyệt, hoặc chọn ảnh có sẵn.');
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setBusy(true);
    try {
      const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
      onDone(await canvasToJpeg(c, 0.8));
    } catch {
      setError('Không chụp được ảnh. Hãy thử lại.');
      setBusy(false);
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onDone(await compressImage(file, MAX_SIDE, 0.8));
    } catch {
      setError('Không đọc được ảnh này. Hãy chọn ảnh khác.');
      setBusy(false);
    }
  }

  return (
    <div className="camera" role="dialog" aria-label={title}>
      <div className="camera-head">
        <strong>{title}</strong>
        <button className="btn btn-ghost camera-close" onClick={onClose}>
          Đóng
        </button>
      </div>
      <div className="camera-view">
        <video ref={videoRef} playsInline muted />
        {!ready && !error && <p className="camera-msg">Đang mở camera…</p>}
        {error && <p className="camera-msg">{error}</p>}
      </div>
      <div className="camera-actions">
        <button className="btn btn-ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
          Chọn ảnh có sẵn
        </button>
        <button className="shutter" aria-label="Chụp" disabled={!ready || busy} onClick={shoot} />
        <span style={{ width: 120 }} />
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
