// Shared by the browser (src/lib/validate.ts) and the proxy (server/proxy.js).
// MIME types reported by the browser or by n8n can be spoofed, so files are
// identified by their leading "magic" bytes instead.

export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * @param {Uint8Array} bytes  At least the first 12 bytes of the file.
 * @returns {'image/jpeg' | 'image/png' | 'image/webp' | null}
 */
export function sniffImageType(bytes) {
  const at = (offset, ...values) => values.every((v, i) => bytes[offset + i] === v);
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  // "RIFF" .... "WEBP"
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}
