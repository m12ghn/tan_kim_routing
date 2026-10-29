export function SkeletonLine({ w = '100%', h = 14 }: { w?: string | number; h?: number }) {
  return <div className="skeleton" style={{ width: w, height: h }} />;
}

export function SkeletonCards({ n = 4 }: { n?: number }) {
  return (
    <div className="kpi-grid">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="kpi">
          <SkeletonLine w="60%" h={12} />
          <SkeletonLine w="40%" h={30} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ n = 6 }: { n?: number }) {
  return (
    <div className="card stack">
      {Array.from({ length: n }, (_, i) => (
        <SkeletonLine key={i} h={18} />
      ))}
    </div>
  );
}
