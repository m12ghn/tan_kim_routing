import { LEVEL_LABEL, STATUS_LABEL, type InspectionStatus, type Level } from '../lib/types';

const LEVEL_TONE: Record<Level, string> = { normal: 'good', review: 'warn', abnormal: 'bad' };
const LEVEL_ICON: Record<Level, string> = { normal: '✓', review: '⚠', abnormal: '✕' };

export function LevelBadge({ level, big }: { level: Level | null | undefined; big?: boolean }) {
  if (!level) return <span className={'badge' + (big ? ' badge-big' : '')}>Chưa kiểm tra</span>;
  return (
    <span className={`badge badge-${LEVEL_TONE[level]}` + (big ? ' badge-big' : '')}>
      {LEVEL_ICON[level]} {LEVEL_LABEL[level]}
    </span>
  );
}

const STATUS_TONE: Record<InspectionStatus, string> = { in_progress: 'warn', completed: 'good', cancelled: '' };

export function StatusBadge({ status }: { status: InspectionStatus }) {
  return <span className={`badge badge-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}
