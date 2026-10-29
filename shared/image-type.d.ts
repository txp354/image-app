export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';
export const ALLOWED_TYPES: ImageType[];
export const MAX_IMAGE_BYTES: number;
export function sniffImageType(bytes: Uint8Array): ImageType | null;
