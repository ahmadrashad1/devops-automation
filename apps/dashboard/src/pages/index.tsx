import Link from 'next/link';
import React from 'react';

export default function HomePage() {
  return (
    <div>
      <section className="hero">
        <p className="hero-eyebrow">Control plane</p>
        <h1>Run pipelines, watch workers, ship with confidence.</h1>
        <p style={{ maxWidth: '52ch', fontSize: '1.05rem' }}>
          Webhook-triggered builds, staged jobs, live logs, and an{' '}
          <strong style={{ color: 'var(--text)' }}>AI workflow</strong> that drafts valid{' '}
          <code>.saas/pipeline.yaml</code> from plain English.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <Link href="/pipelines" className="btn btn-primary">
            View pipelines
          </Link>
          <Link href="/ai" className="btn">
            AI Workflow
          </Link>
        </div>
      </section>

      <div className="grid grid-2" style={{ marginTop: '2rem' }}>
        <div className="card">
          <h3>Pipelines</h3>
          <p>Inspect runs, stages, and per-job Docker logs with auto-refresh.</p>
          <Link href="/pipelines">Go to pipelines →</Link>
        </div>
        <div className="card">
          <h3>Projects</h3>
          <p>Repositories registered for your tenant (from webhooks).</p>
          <Link href="/projects">Browse projects →</Link>
        </div>
        <div className="card">
          <h3>AI workflow</h3>
          <p>Generate pipeline YAML, auto-validate, and one-click repair with the model.</p>
          <Link href="/ai">Launch assistant →</Link>
        </div>
        <div className="card">
          <h3>API health</h3>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            Point <code>NEXT_PUBLIC_API_URL</code> at your Nest API (default{' '}
            <code>http://localhost:3010</code>).
          </p>
        </div>
      </div>
    </div>
  );
}
