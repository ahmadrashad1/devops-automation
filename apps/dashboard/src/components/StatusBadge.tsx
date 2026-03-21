import React from 'react';

const map: Record<string, string> = {
  queued: 'badge-queued',
  running: 'badge-running',
  success: 'badge-success',
  failed: 'badge-failed',
  pending: 'badge-pending',
  cancelled: 'badge-pending'
};

export function StatusBadge({ status }: { status: string }) {
  const cls = map[status] ?? 'badge-queued';
  return <span className={`badge ${cls}`}>{status}</span>;
}
