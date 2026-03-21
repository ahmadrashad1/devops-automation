import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { fetchJson } from '../../lib/api';
import type { PipelineSummary } from '../../lib/types';
import { StatusBadge } from '../../components/StatusBadge';

type ListResponse = { items: PipelineSummary[] };

export default function PipelinesPage() {
  const [items, setItems] = useState<PipelineSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setErr(null);
    fetchJson<ListResponse>('/pipelines?limit=100')
      .then((r) => setItems(r.items))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Pipelines</h1>
          <p className="muted">Recent runs (auto-refresh every 8s)</p>
        </div>
        <button type="button" className="btn" onClick={() => { setLoading(true); load(); }}>
          Refresh
        </button>
      </div>

      {err && <p className="err">{err}</p>}
      {loading && !items.length ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Branch</th>
                <th>Commit</th>
                <th>Source</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td>{p.branch}</td>
                  <td>
                    <code style={{ fontSize: '0.8rem' }}>{p.commit_sha.slice(0, 7)}</code>
                  </td>
                  <td>{p.source}</td>
                  <td className="muted" style={{ fontSize: '0.85rem' }}>
                    {new Date(p.created_at).toLocaleString()}
                  </td>
                  <td>
                    <Link href={`/pipelines/${p.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && !loading && (
            <p style={{ padding: '1rem' }} className="muted">
              No pipelines yet. Trigger <code>POST /api/webhooks/github</code> or enqueue a test job.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
