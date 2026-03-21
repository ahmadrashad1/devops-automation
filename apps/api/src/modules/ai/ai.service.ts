import {
  BadRequestException,
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

@Injectable()
export class AiService {
  private readonly openaiModel =
    process.env.OPENAI_MODEL || 'gpt-4o-mini';
  private readonly geminiModel =
    process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  /**
   * Default: **Gemini (free)** when GEMINI_API_KEY is set — including if OpenAI is also set.
   * Set AI_PROVIDER=openai to force OpenAI when both keys exist.
   */
  private provider(): 'openai' | 'gemini' {
    const explicit = (process.env.AI_PROVIDER || '').toLowerCase().trim();
    const hasGemini = !!process.env.GEMINI_API_KEY?.trim();
    const hasOpenai = !!process.env.OPENAI_API_KEY?.trim();

    if (explicit === 'openai') return 'openai';
    if (explicit === 'gemini') return 'gemini';

    if (hasGemini) return 'gemini';
    if (hasOpenai) return 'openai';
    return 'gemini';
  }

  private modelLabel(): string {
    return this.provider() === 'gemini' ? this.geminiModel : this.openaiModel;
  }

  private ensureConfigured(): void {
    const explicit = (process.env.AI_PROVIDER || '').toLowerCase().trim();
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

    if (hasGemini || hasOpenai) return;

    throw new ServiceUnavailableException(
      'No AI key on the API. Set GEMINI_API_KEY (free Gemini Flash — https://aistudio.google.com/apikey) in the **repo root** `.env` file (same folder as docker-compose.yml), then restart the API. OpenAI is optional via OPENAI_API_KEY.'
    );
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
    const key = process.env.GEMINI_API_KEY!.trim();
    const systemText = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const rest = messages.filter((m) => m.role !== 'system');
    const userBlob = rest
      .map((m) => `(${m.role})\n${m.content}`)
      .join('\n\n');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.geminiModel
    )}:generateContent?key=${encodeURIComponent(key)}`;

    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: userBlob }] }],
      generationConfig: { temperature: 0.2 }
    };
    if (systemText) {
      body.systemInstruction = { parts: [{ text: systemText }] };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const raw = await res.text();
    if (!res.ok) {
      throw new BadRequestException(
        `Gemini request failed (${res.status}): ${raw.slice(0, 2000)}`
      );
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
      throw new BadRequestException('Empty response from Gemini');
    }
    return text;
  }

  private async chat(messages: ChatMsg[]) {
    this.ensureConfigured();
    return this.provider() === 'gemini'
      ? this.chatGemini(messages)
      : this.chatOpenAI(messages);
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
        provider: this.provider(),
        rawResponse: raw
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        yaml,
        valid: false as const,
        validationError: message,
        model,
        provider: this.provider(),
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
        provider: this.provider(),
        rawResponse: raw
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        yaml,
        valid: false as const,
        validationError: message,
        model,
        provider: this.provider(),
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

    return { analysis, model: this.modelLabel(), provider: this.provider() };
  }
}
