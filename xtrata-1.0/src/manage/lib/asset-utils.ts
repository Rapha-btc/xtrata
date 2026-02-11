export const DEFAULT_CHUNK_SIZE = 16384;

export const chunkCount = (totalBytes: number, chunkSize = DEFAULT_CHUNK_SIZE) =>
  Math.max(1, Math.ceil(totalBytes / chunkSize));

export const hexDigest = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};
