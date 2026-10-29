// Khối "Điểm sáng / Điểm cần lưu ý", nội dung tự sinh từ dữ liệu.
export default function Insights({ good, bad }: { good: string[]; bad: string[] }) {
  return (
    <div className="insights">
      <div className="insight insight-good">
        <h3>✓ Điểm sáng</h3>
        {good.length ? (
          <ul>{good.map((t, i) => <li key={i}>{t}</li>)}</ul>
        ) : (
          <p className="muted">Chưa có điểm nổi bật.</p>
        )}
      </div>
      <div className="insight insight-bad">
        <h3>⚠ Điểm cần lưu ý</h3>
        {bad.length ? (
          <ul>{bad.map((t, i) => <li key={i}>{t}</li>)}</ul>
        ) : (
          <p className="muted">Không có cảnh báo.</p>
        )}
      </div>
    </div>
  );
}
