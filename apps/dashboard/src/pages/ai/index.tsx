import React, { useState } from 'react';
import { fetchJson } from '../../lib/api';

type GenRes = {
  yaml: string;
  valid: boolean;
  validationError?: string;
  model: string;
  rawResponse?: string;
};

export default function AiWorkflowPage() {
  const [prompt, setPrompt] = useState(
    'A two-stage pipeline: build runs `npm ci` and `npm run build` in node:20-alpine; test runs `npm test`.'
  );
  const [yaml, setYaml] = useState('');
  const [valid, setValid] = useState<boolean | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fixLoading, setFixLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setErr(null);
    setValid(null);
    setValidationError(null);
    try {
      const res = await fetchJson<GenRes>('/ai/pipeline', {
        method: 'POST',
        body: JSON.stringify({ prompt })
      });
      setYaml(res.yaml);
      setValid(res.valid);
      setValidationError(res.validationError ?? null);
      setModel(res.model);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  async function fix() {
    if (!yaml || !validationError) return;
    setFixLoading(true);
    setErr(null);
    try {
      const res = await fetchJson<GenRes>('/ai/pipeline/fix', {
        method: 'POST',
        body: JSON.stringify({
          yaml,
          validationError,
          hint: prompt
        })
      });
      setYaml(res.yaml);
      setValid(res.valid);
      setValidationError(res.validationError ?? null);
      setModel(res.model);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fix failed');
    } finally {
      setFixLoading(false);
    }
  }

  function copy() {
    void navigator.clipboard.writeText(yaml);
  }

  return (
    <div>
      <h1>AI workflow</h1>
      <p style={{ maxWidth: '60ch' }}>
        Describe the CI job in plain language. The API uses <strong style={{ color: 'var(--text)' }}>Groq</strong> when{' '}
        <code>GROQ_API_KEY</code> is set (recommended free dev tier), or <strong style={{ color: 'var(--text)' }}>Gemini</strong> /{' '}
        OpenAI if configured, then{' '}
        <strong style={{ color: 'var(--text)' }}>validates YAML</strong> with the same parser as the
        pipeline engine. Save the output to <code>.saas/pipeline.yaml</code> in your repo.
      </p>

      <div className="card" style={{ marginTop: '1rem' }}>
        <label htmlFor="prompt">Prompt</label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
        />
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void generate()}>
            {loading ? 'Generating…' : 'Generate pipeline YAML'}
          </button>
          {model && (
            <span className="muted" style={{ alignSelf: 'center', fontSize: '0.85rem' }}>
              Model: <code>{model}</code>
            </span>
          )}
        </div>
      </div>

      {err && <p className="err">{err}</p>}

      {yaml && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Result</h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {valid === true && <span className="badge badge-success">Valid</span>}
              {valid === false && <span className="badge badge-failed">Invalid</span>}
              <button type="button" className="btn" onClick={copy}>
                Copy YAML
              </button>
            </div>
          </div>
          {validationError && (
            <p className="err" style={{ marginTop: '0.75rem' }}>
              {validationError}
            </p>
          )}
          <pre
            style={{
              marginTop: '1rem',
              padding: '1rem',
              background: '#07090d',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              overflow: 'auto',
              fontSize: '0.82rem'
            }}
          >
            {yaml}
          </pre>
          {valid === false && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: '0.75rem' }}
              disabled={fixLoading}
              onClick={() => void fix()}
            >
              {fixLoading ? 'Fixing…' : 'Ask AI to fix YAML'}
            </button>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ marginTop: 0 }}>Requirements</h3>
        <ul className="muted" style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li>
            API should set <code>GROQ_API_KEY</code> (recommended —{' '}
            <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
              Groq Console
            </a>
            ) in <strong>repo root</strong> <code>.env</code> for Docker, or export it before <code>pnpm dev:api</code>.
            Optional: <code>GEMINI_API_KEY</code> (
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              Google AI Studio
            </a>
            ) or <code>OPENAI_API_KEY</code>. Use <code>AI_PROVIDER=groq|gemini|openai</code> to force a provider.
          </li>
          <li>
            CORS: API allows dashboard origins; override with <code>DASHBOARD_ORIGIN</code> on the API.
          </li>
          <li>
            Browser calls the API directly — keep <code>NEXT_PUBLIC_API_URL</code> in sync with{' '}
            <code>PORT</code>.
          </li>
        </ul>
      </div>
    </div>
  );
}
