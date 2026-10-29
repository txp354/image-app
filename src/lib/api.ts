import { ALLOWED_TYPES, sniffImageType } from '../../shared/image-type.js';

// Same-origin proxy (server/proxy.js). The real webhook URL never reaches the browser.
const ENDPOINT = '/api/generate';
// Slightly longer than the server's upstream timeout so the server's message wins.
const TIMEOUT_MS = 75_000;

export interface GenerateResult {
  url: string;
  type: string;
}

export async function generateImage(file1: File, file2: File): Promise<GenerateResult> {
  const formData = new FormData();
  formData.append('image1', file1);
  formData.append('image2', file2);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        credentials: 'same-origin',
      });
    } catch (err) {
      if (isAbort(err)) throw timeoutError();
      throw new Error('Could not reach the server. Check your connection and try again.');
    }

    if (!res.ok) throw new Error(await readErrorMessage(res));

    const blob = await res.blob();
    // Only render types we explicitly allow, verified by content, never e.g. SVG,
    // which could run script if the blob URL were opened directly.
    const type = sniffImageType(new Uint8Array(await blob.slice(0, 16).arrayBuffer()));
    if (!type || !ALLOWED_TYPES.includes(type)) {
      throw new Error('The server did not return a valid image.');
    }
    return { url: URL.createObjectURL(new Blob([blob], { type })), type };
  } catch (err) {
    if (isAbort(err)) throw timeoutError();
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function timeoutError(): Error {
  return new Error('The server took too long to respond. Please try again.');
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.error === 'string') return data.error.slice(0, 300);
  } catch {
    // fall through
  }
  return `Server returned HTTP ${res.status}.`;
}
