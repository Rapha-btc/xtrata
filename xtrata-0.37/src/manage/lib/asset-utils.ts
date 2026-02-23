import { chunkBytes, computeExpectedHash } from '../../lib/chunking/hash';
import { bytesToHex } from '../../lib/utils/encoding';

export const DEFAULT_CHUNK_SIZE = 16384;

export const chunkCount = (totalBytes: number, chunkSize = DEFAULT_CHUNK_SIZE) =>
  Math.max(1, Math.ceil(totalBytes / chunkSize));

export const hexDigest = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return bytesToHex(computeExpectedHash(chunkBytes(bytes)));
};
