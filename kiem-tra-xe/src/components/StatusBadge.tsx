import { RESULT_LABEL, STATUS_LABEL, type InspectionResult, type InspectionStatus } from '../lib/types';

const STATUS_TONE: Record<InspectionStatus, string> = { submitted: 'warn', approved: 'good', rejected: 'bad' };

export function StatusBadge({ status }: { status: InspectionStatus }) {
  return <span className={`badge badge-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function ResultBadge({ result }: { result: InspectionResult }) {
  return <span className={`badge badge-${result === 'ok' ? 'good' : 'bad'}`}>{RESULT_LABEL[result]}</span>;
}
