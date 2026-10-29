import { ALLOWED_TYPES, MAX_IMAGE_BYTES, sniffImageType } from '../../shared/image-type.js';

export const ACCEPTED_TYPES = ALLOWED_TYPES;

/** Checks size and actual file contents (not just the extension/MIME the browser reports). */
export async function validateImage(file: File): Promise<string | null> {
  if (file.size > MAX_IMAGE_BYTES) {
    return `File is ${formatBytes(file.size)}. Maximum is 10 MB.`;
  }
  const type = sniffImageType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!type) {
    return 'Unsupported or corrupted file. Use a JPEG, PNG or WebP image.';
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
