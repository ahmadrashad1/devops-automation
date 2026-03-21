import { load as loadYaml } from 'js-yaml';

export type ParsedPipelineYaml = {
  stages: string[];
  jobs: Array<{ name: string; stage: string; image: string; script: string[] }>;
};

type PipelineYamlDoc = {
  pipeline?: {
    stages?: string[];
  };
  [jobName: string]: unknown;
};

/**
 * Parses and validates pipeline YAML matching `PipelineService` expectations.
 */
export function parsePipelineYamlContent(yamlText: string): ParsedPipelineYaml {
  const doc = loadYaml(yamlText) as PipelineYamlDoc;
  const stageList = doc?.pipeline?.stages;
  if (!Array.isArray(stageList) || stageList.length === 0) {
    throw new Error('Invalid pipeline yaml: pipeline.stages missing or empty');
  }

  const jobs: ParsedPipelineYaml['jobs'] = [];
  for (const [key, value] of Object.entries(doc)) {
    if (key === 'pipeline') continue;
    if (!value || typeof value !== 'object') continue;
    const stage = (value as { stage?: string }).stage;
    const image = (value as { image?: string }).image;
    const script = (value as { script?: string[] }).script;
    if (!stage || !image || !Array.isArray(script)) continue;
    jobs.push({ name: key, stage, image, script });
  }

  if (jobs.length === 0) {
    throw new Error('Invalid pipeline yaml: no job blocks found (need stage, image, script)');
  }

  return { stages: stageList, jobs };
}

/** Strips ```yaml fences if the model wrapped output in markdown. */
export function extractYamlFromModelOutput(text: string): string {
  const trimmed = text.trim();
  const loose = /```(?:yaml|yml)?\s*([\s\S]*?)```/;
  const m = trimmed.match(loose);
  if (m) return m[1].trim();
  return trimmed;
}
