import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '../../lib/api';
import type { JobRow, PipelineSummary, StageRow } from '../../lib/types';
import { StatusBadge } from '../../components/StatusBadge';

type DetailResponse = {
  pipeline: PipelineSummary;
  stages: StageRow[];
  jobs: JobRow[];
};

export default function PipelineDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const pipelineId = typeof id === 'string' ? id : '';

  const [data, setData] = useState<DetailResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const load = () => {
    if (!pipelineId) return;
    setErr(null);
    fetchJson<DetailResponse>(`/pipelines/${pipelineId}`)
      .then(setData)
      .catch((e: Error) => setErr(e.message));
  };

  useEffect(() => {
    load();
  }, [pipelineId]);

  useEffect(() => {
    if (!pipelineId) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [pipelineId]);

  const jobs = data?.jobs ?? [];
  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) ?? jobs[0],
    [jobs, selectedJobId]
  );

  useEffect(() => {
    if (jobs.length && !selectedJobId) {
      setSelectedJobId(jobs[0].id);
    }
  }, [jobs, selectedJobId]);

  async function analyzeLogs() {
    if (!selectedJob?.logs?.trim()) {
      setAiErr('No logs captured for this job yet.');
      return;
    }
    setAiLoading(true);
    setAiErr(null);
    setAiText(null);
    try {
      const res = await fetchJson<{ analysis: string }>('/ai/analyze-logs', {
        method: 'POST',
        body: JSON.stringify({
          logs: selectedJob.logs,
          jobName: selectedJob.name,
          context: `Pipeline ${pipelineId}`
        })
      });
      setAiText(res.analysis);
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : 'Analyze failed');
    } finally {
      setAiLoading(false);
    }
  }

  if (!router.isReady) {
    return <p className="muted">Loading…</p>;
  }

  if (!pipelineId) {
    return <p className="muted">Invalid pipeline id</p>;
  }

  return (
    <div>
      <p>
        <Link href="/pipelines">← Pipelines</Link>
      </p>
      <h1>Pipeline</h1>
      {err && <p className="err">{err}</p>}
      {!data && !err && <p className="muted">Loading…</p>}
      {data && (
        <>
          <div className="card">
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge status={data.pipeline.status} />
              <span className="muted">
                <strong style={{ color: 'var(--text)' }}>{data.pipeline.branch}</strong> ·{' '}
                <code>{data.pipeline.commit_sha.slice(0, 12)}</code>
              </span>
              <span className="muted">source: {data.pipeline.source}</span>
            </div>
            <p style={{ marginBottom: 0, marginTop: '0.75rem' }} className="muted">
              Live updates every ~2.5s · id <code>{data.pipeline.id}</code>
            </p>
          </div>

          <h2 style={{ marginTop: '1.5rem' }}>Stages</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.stages.map((s) => (
                  <tr key={s.id}>
                    <td>{s.position}</td>
                    <td>{s.name}</td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: '1.5rem' }}>Jobs</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Image</th>
                  <th>Status</th>
                  <th>Logs</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => setSelectedJobId(j.id)}
                        className="btn"
                        style={{
                          padding: '0.2rem 0.5rem',
                          fontSize: '0.85rem',
                          borderColor:
                            selectedJob?.id === j.id ? 'var(--accent-dim)' : undefined
                        }}
                      >
                        {j.name}
                      </button>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.78rem' }}>{j.image}</code>
                    </td>
                    <td>
                      <StatusBadge status={j.status} />
                    </td>
                    <td className="muted" style={{ fontSize: '0.8rem' }}>
                      {(j.logs || '').length} chars
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: '1.5rem' }}>Logs · {selectedJob?.name ?? '—'}</h2>
          <div className="log-box">{selectedJob?.logs || '—'}</div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={aiLoading || !selectedJob?.logs?.trim()}
              onClick={() => void analyzeLogs()}
            >
              {aiLoading ? 'Analyzing…' : 'AI: explain failure / next steps'}
            </button>
            <span className="muted" style={{ fontSize: '0.85rem', alignSelf: 'center' }}>
              Uses <code>POST /api/ai/analyze-logs</code> (API needs <code>GEMINI_API_KEY</code> or{' '}
              <code>OPENAI_API_KEY</code>)
            </span>
          </div>
          {aiErr && <p className="err">{aiErr}</p>}
          {aiText && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3 style={{ marginTop: 0 }}>AI analysis</h3>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font)',
                  fontSize: '0.95rem',
                  margin: 0
                }}
              >
                {aiText}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
