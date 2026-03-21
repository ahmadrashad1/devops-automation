import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { fetchJson } from '../../lib/api';
import type { ProjectRow } from '../../lib/types';

type Res = { items: ProjectRow[] };

export default function ProjectsPage() {
  const [items, setItems] = useState<ProjectRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<Res>('/projects?limit=100')
      .then((r) => setItems(r.items))
      .catch((e: Error) => setErr(e.message));
  }, []);

  return (
    <div>
      <h1>Projects</h1>
      <p className="muted">Repositories created from Git webhooks (default tenant).</p>
      {err && <p className="err">{err}</p>}
      <div className="table-wrap" style={{ marginTop: '1rem' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Repo</th>
              <th>Branch</th>
              <th>Provider</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                </td>
                <td>
                  <code style={{ fontSize: '0.78rem' }}>{p.repo_url}</code>
                </td>
                <td>{p.default_branch}</td>
                <td>{p.provider}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && !err && (
          <p style={{ padding: '1rem' }} className="muted">
            No projects yet. Send a GitHub webhook to register a repo, or use the{' '}
            <Link href="/pipelines">pipelines</Link> view after triggering a run.
          </p>
        )}
      </div>
    </div>
  );
}
