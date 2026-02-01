export const createObjectUrl = (bytes: Uint8Array, mimeType: string | null) => {
  // Ensure the BlobPart is backed by an ArrayBuffer (not a SharedArrayBuffer).
  const safeBytes = new Uint8Array(bytes);
  const blob = new Blob([safeBytes], {
    type: mimeType ?? 'application/octet-stream'
  });
  return URL.createObjectURL(blob);
};
