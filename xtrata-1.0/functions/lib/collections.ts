const slugPattern = /^[a-z0-9-]{3,64}$/;

export const normalizeSlug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

export const isValidSlug = (value: string) => slugPattern.test(value);

export const staysWithinLimit = (
  currentBytes: number,
  upcomingBytes: number,
  limitBytes: number
) => currentBytes + upcomingBytes <= limitBytes;
