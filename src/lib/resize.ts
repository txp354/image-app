// Serverless hosts cap request bodies (Vercel: 4.5 MB for the whole upload), so
// large photos are downscaled in the browser before being sent. 2048px is well
// above what image models typically use, so quality is not meaningfully lost.
const MAX_DIMENSION = 2048;
const TARGET_BYTES = 1.8 * 1024 * 1024; // per image; two of these fit under 4.5 MB
const QUALITIES = [0.9, 0.8, 0.7];

export async function prepareForUpload(file: File): Promise<Blob> {
  if (file.size <= TARGET_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not process the image in this browser.');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of QUALITIES) {
        const blob = await encode(canvas, quality);
        if (blob.size <= TARGET_BYTES) return blob;
      }
      scale *= 0.75;
    }
  } finally {
    bitmap.close();
  }
  throw new Error('Could not shrink the image enough to upload. Try a smaller photo.');
}

/** WebP keeps transparency (garment cut-outs); browsers that can't encode it fall back to JPEG. */
async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const webp = await toBlob(canvas, 'image/webp', quality);
  if (webp.type === 'image/webp') return webp;

  const flat = document.createElement('canvas');
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // JPEG has no alpha; avoid transparent areas turning black
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  return toBlob(flat, 'image/jpeg', quality);
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed.'))), type, quality),
  );
}
