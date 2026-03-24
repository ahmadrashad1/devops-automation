export function getApiBase(): string {
  // Use same-origin calls and let Next.js rewrites proxy to the API.
  return '';
}

export function apiPath(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBase()}/api${p}`;
}

export async function fetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(apiPath(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 800)}`);
  }
  return res.json() as Promise<T>;
}
