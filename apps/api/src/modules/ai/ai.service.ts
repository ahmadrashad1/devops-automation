import {
  BadRequestException,
  HttpException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';
import {
  extractYamlFromModelOutput,
  parsePipelineYamlContent
} from '../pipeline/pipeline-yaml.util';

const PIPELINE_SYSTEM = `You are an expert CI/CD engineer. Generate a valid YAML pipeline file for this DevOps automation platform.

STRICT FORMAT (no extra commentary outside YAML unless asked — output YAML in a fenced code block):

\`\`\`yaml
pipeline:
  stages: [stageName1, stageName2, ...]

job_key_snake_case:
  stage: stageName1
  image: docker-image:tag
  script:
    - command one
    - command two
\`\`\`

Rules:
- Top-level keys other than \`pipeline\` are job definitions. Each job MUST have: stage, image, script (array of shell strings).
- \`pipeline.stages\` lists stage names in order. Jobs reference a stage by name.
- Use small Alpine-based images when possible (e.g. alpine:3.20, node:20-alpine).
- Keep scripts short and POSIX-sh compatible.
- Include at least two stages when the user asks for build+test style workflows.
`;

const ANALYZE_SYSTEM = `You are a senior DevOps engineer. Given CI job logs, respond with:
1) A short diagnosis (what failed and why).
2) Bullet-point remediation steps.
3) If relevant, a minimal code or config suggestion.
Keep answers concise and actionable.`;

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

type AiProviderKind = 'openai' | 'gemini' | 'groq';

@Injectable()
export class AiService {
  private readonly openaiModel =
    process.env.OPENAI_MODEL || 'gpt-4o-mini';
  /** Must match IDs from https://ai.google.dev/api/models — unversioned names often 404 */
  private readonly geminiModel =
    process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  /** Groq: generous free dev tier — https://console.groq.com/keys */
  private readonly groqModel =
    process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

  /** Last Gemini model that succeeded (for response `model` field) */
  private lastGeminiModelUsed: string | null = null;
  /** Which backend actually served the last `chat()` (after Gemini→Groq fallback) */
  private lastUsedProvider: AiProviderKind | null = null;

  /**
   * Default order when `AI_PROVIDER` is unset: **Groq** (if key) → Gemini → OpenAI.
   * Groq free tier is usually easier for day-to-day dev than Gemini’s strict quotas.
   */
  private provider(): AiProviderKind {
    const explicit = (process.env.AI_PROVIDER || '').toLowerCase().trim();
    const hasGroq = !!process.env.GROQ_API_KEY?.trim();
    const hasGemini = !!process.env.GEMINI_API_KEY?.trim();
    const hasOpenai = !!process.env.OPENAI_API_KEY?.trim();

    if (explicit === 'openai') return 'openai';
    if (explicit === 'gemini') return 'gemini';
    if (explicit === 'groq') return 'groq';

    if (hasGroq) return 'groq';
    if (hasGemini) return 'gemini';
    if (hasOpenai) return 'openai';
    return 'groq';
  }

  private activeProvider(): AiProviderKind {
    return this.lastUsedProvider ?? this.provider();
  }

  /** Nest HttpException may put the user message on `getResponse()` instead of `.message`. */
  private exceptionMessage(e: unknown): string {
    if (e instanceof HttpException) {
      const r = e.getResponse();
      if (typeof r === 'string') return r;
      if (typeof r === 'object' && r !== null && 'message' in r) {
        const m = (r as { message?: unknown }).message;
        if (typeof m === 'string') return m;
        if (Array.isArray(m)) return m.join(' ');
      }
    }
    return e instanceof Error ? e.message : String(e);
  }

  private modelLabel(): string {
    const used = this.activeProvider();
    if (used === 'groq') return this.groqModel;
    if (used === 'gemini' && this.lastGeminiModelUsed) {
      return this.lastGeminiModelUsed;
    }
    return used === 'gemini' ? this.geminiModel : this.openaiModel;
  }

  private geminiModels(): string[] {
    const extra = (process.env.GEMINI_FALLBACK_MODELS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // Order: user primary, extras, then known-good Flash IDs (404 = try next)
    const defaults = [
      'gemini-2.0-flash',
      'gemini-2.0-flash-001',
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash-002',
      'gemini-1.5-flash-8b',
      'gemini-1.5-flash'
    ];
    return [...new Set([this.geminiModel, ...extra, ...defaults])];
  }

  private ensureConfigured(): void {
    const explicit = (process.env.AI_PROVIDER || '').toLowerCase().trim();
    const hasGroq = !!process.env.GROQ_API_KEY?.trim();
    const hasGemini = !!process.env.GEMINI_API_KEY?.trim();
    const hasOpenai = !!process.env.OPENAI_API_KEY?.trim();

    if (explicit === 'openai') {
      if (!hasOpenai) {
        throw new ServiceUnavailableException(
          'AI_PROVIDER=openai but OPENAI_API_KEY is missing.'
        );
      }
      return;
    }
    if (explicit === 'gemini' && !hasGemini) {
      throw new ServiceUnavailableException(
        'AI_PROVIDER=gemini but GEMINI_API_KEY is missing. Get a free key at https://aistudio.google.com/apikey'
      );
    }
    if (explicit === 'gemini') return;
    if (explicit === 'groq' && !hasGroq) {
      throw new ServiceUnavailableException(
        'AI_PROVIDER=groq but GROQ_API_KEY is missing. Get a free key at https://console.groq.com/keys'
      );
    }
    if (explicit === 'groq') return;

    if (hasGroq || hasGemini || hasOpenai) return;

    throw new ServiceUnavailableException(
      'No AI API key configured. Add GROQ_API_KEY (recommended free dev tier — https://console.groq.com/keys) and/or GEMINI_API_KEY / OPENAI_API_KEY in the **repo root** `.env`, then restart the API.'
    );
  }

  /** OpenAI-compatible chat (Groq free tier) */
  private async chatGroq(messages: ChatMsg[]) {
    const key = process.env.GROQ_API_KEY!.trim();
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.groqModel,
        messages,
        temperature: 0.2
      })
    });

    const raw = await res.text();
    if (!res.ok) {
      throw new BadRequestException(
        `Groq request failed (${res.status}): ${raw.slice(0, 2000)}`
      );
    }

    let data: { choices?: Array<{ message?: { content?: string } }> };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      throw new BadRequestException('Invalid JSON from Groq');
    }

    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new BadRequestException('Empty response from Groq');
    }
    return text;
  }

  private async chatOpenAI(messages: ChatMsg[]) {
    const key = process.env.OPENAI_API_KEY!.trim();
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.openaiModel,
        messages,
        temperature: 0.2
      })
    });

    const raw = await res.text();
    if (!res.ok) {
      throw new BadRequestException(
        `OpenAI request failed (${res.status}): ${raw.slice(0, 2000)}`
      );
    }

    let data: { choices?: Array<{ message?: { content?: string } }> };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      throw new BadRequestException('Invalid JSON from OpenAI');
    }

    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new BadRequestException('Empty response from OpenAI');
    }
    return text;
  }

  /** Google AI Studio / Gemini API (free tier Flash models) */
  private async chatGemini(messages: ChatMsg[]) {
    this.lastGeminiModelUsed = null;
    const key = process.env.GEMINI_API_KEY!.trim();
    const systemText = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const rest = messages.filter((m) => m.role !== 'system');
    const userBlob = rest
      .map((m) => `(${m.role})\n${m.content}`)
      .join('\n\n');

    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: userBlob }] }],
      generationConfig: { temperature: 0.2 }
    };
    if (systemText) {
      body.systemInstruction = { parts: [{ text: systemText }] };
    }

    let lastError = 'Unknown Gemini error';
    let quotaHit = false;

    for (const model of this.geminiModels()) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(key)}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const raw = await res.text();
      if (!res.ok) {
        const lower = raw.toLowerCase();
        const isQuota =
          res.status === 429 ||
          lower.includes('resource_exhausted') ||
          lower.includes('quota') ||
          lower.includes('rate limit');
        const isModelMissing =
          res.status === 404 ||
          lower.includes('not found') ||
          lower.includes('was not found') ||
          lower.includes('invalid model') ||
          lower.includes('unknown model');
        if (isQuota) {
          quotaHit = true;
          lastError = `Gemini quota exhausted for model ${model}`;
          continue;
        }
        if (isModelMissing) {
          lastError = `Gemini model not available (${res.status}) for model ${model}`;
          continue;
        }
        lastError = `Gemini request failed (${res.status}) for model ${model}`;
        throw new BadRequestException(`${lastError}: ${raw.slice(0, 800)}`);
      }

      let data: {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        throw new BadRequestException('Invalid JSON from Gemini');
      }

      const text = data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('')
        .trim();
      if (!text) {
        lastError = `Empty response from Gemini model ${model}`;
        continue;
      }
      this.lastGeminiModelUsed = model;
      return text;
    }

    if (quotaHit) {
      throw new ServiceUnavailableException(
        'GEMINI_QUOTA_EXHAUSTED'
      );
    }
    throw new ServiceUnavailableException(
      `No working Gemini model found. Last error: ${lastError}. Set GEMINI_MODEL to a valid ID (try gemini-2.0-flash) or GEMINI_FALLBACK_MODELS. See https://ai.google.dev/api/models`
    );
  }

  private async chat(messages: ChatMsg[]) {
    this.ensureConfigured();
    this.lastUsedProvider = null;
    const primary = this.provider();

    if (primary === 'groq') {
      const text = await this.chatGroq(messages);
      this.lastUsedProvider = 'groq';
      return text;
    }

    if (primary === 'gemini') {
      try {
        const text = await this.chatGemini(messages);
        this.lastUsedProvider = 'gemini';
        return text;
      } catch (e) {
        const msg = this.exceptionMessage(e);
        const quota =
          msg.includes('GEMINI_QUOTA_EXHAUSTED') ||
          msg.includes('429') ||
          msg.includes('quota');
        if (
          quota &&
          process.env.GROQ_API_KEY?.trim() &&
          primary === 'gemini'
        ) {
          const text = await this.chatGroq(messages);
          this.lastUsedProvider = 'groq';
          return text;
        }
        if (msg.includes('GEMINI_QUOTA_EXHAUSTED')) {
          throw new ServiceUnavailableException(
            'Gemini free-tier quota is exhausted. Add GROQ_API_KEY (free — https://console.groq.com/keys) to `.env` and restart the API, or wait and retry.'
          );
        }
        throw e;
      }
    }

    const text = await this.chatOpenAI(messages);
    this.lastUsedProvider = 'openai';
    return text;
  }

  async generatePipeline(prompt: string) {
    if (!prompt?.trim()) {
      throw new BadRequestException('prompt is required');
    }

    const raw = await this.chat([
      { role: 'system', content: PIPELINE_SYSTEM },
      { role: 'user', content: prompt.trim() }
    ]);

    const yaml = extractYamlFromModelOutput(raw);
    const model = this.modelLabel();
    try {
      parsePipelineYamlContent(yaml);
      return {
        yaml,
        valid: true as const,
        model,
        provider: this.activeProvider(),
        rawResponse: raw
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        yaml,
        valid: false as const,
        validationError: message,
        model,
        provider: this.activeProvider(),
        rawResponse: raw
      };
    }
  }

  async fixPipeline(params: { yaml: string; validationError: string; hint?: string }) {
    if (!params.yaml?.trim()) {
      throw new BadRequestException('yaml is required');
    }
    if (!params.validationError?.trim()) {
      throw new BadRequestException('validationError is required');
    }

    const user = [
      'Fix this pipeline YAML. Return ONLY a corrected yaml in a ```yaml fenced block.',
      '',
      'Current YAML:',
      params.yaml.trim(),
      '',
      'Validation error:',
      params.validationError.trim(),
      params.hint ? `\nExtra hint:\n${params.hint}` : ''
    ].join('\n');

    const raw = await this.chat([
      { role: 'system', content: PIPELINE_SYSTEM },
      { role: 'user', content: user }
    ]);

    const yaml = extractYamlFromModelOutput(raw);
    const model = this.modelLabel();
    try {
      parsePipelineYamlContent(yaml);
      return {
        yaml,
        valid: true as const,
        model,
        provider: this.activeProvider(),
        rawResponse: raw
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        yaml,
        valid: false as const,
        validationError: message,
        model,
        provider: this.activeProvider(),
        rawResponse: raw
      };
    }
  }

  async analyzeLogs(params: { logs: string; jobName?: string; context?: string }) {
    if (!params.logs?.trim()) {
      throw new BadRequestException('logs is required');
    }

    const user = [
      params.jobName ? `Job: ${params.jobName}` : '',
      params.context ? `Context: ${params.context}` : '',
      '',
      '--- LOGS ---',
      params.logs.slice(-120_000)
    ]
      .filter(Boolean)
      .join('\n');

    const analysis = await this.chat([
      { role: 'system', content: ANALYZE_SYSTEM },
      { role: 'user', content: user }
    ]);

    return {
      analysis,
      model: this.modelLabel(),
      provider: this.activeProvider()
    };
  }
}
