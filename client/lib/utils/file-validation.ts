const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const JPEG_START_BYTES = new Uint8Array([0xFF, 0xD8, 0xFF]);

export const ALLOWED_TYPES = ["image/png", "image/jpeg"] as const;
export const MAX_SIZE = 2 * 1024 * 1024;

export function validateFileBasic(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type as typeof ALLOWED_TYPES[number])) {
    return "Only PNG and JPEG images are accepted";
  }
  if (file.size > MAX_SIZE) {
    return "File must be under 2MB";
  }
  return null;
}

export async function validateFileSignature(file: File): Promise<string | null> {
  try {
    const buffer = await file.slice(0, 8).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const isPng =
      bytes[0] === PNG_SIGNATURE[0] &&
      bytes[1] === PNG_SIGNATURE[1] &&
      bytes[2] === PNG_SIGNATURE[2] &&
      bytes[3] === PNG_SIGNATURE[3];

    if (isPng) return null;

    const isJpeg =
      bytes[0] === JPEG_START_BYTES[0] &&
      bytes[1] === JPEG_START_BYTES[1] &&
      bytes[2] === JPEG_START_BYTES[2];

    if (isJpeg) return null;

    return "File appears to be invalid — only PNG and JPEG images are accepted";
  } catch {
    return "Could not verify file signature";
  }
}

export async function validateFile(file: File): Promise<string | null> {
  const basicError = validateFileBasic(file);
  if (basicError) return basicError;

  return validateFileSignature(file);
}
