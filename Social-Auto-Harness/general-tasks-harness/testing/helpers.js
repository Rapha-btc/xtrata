export const EMPTY_STATE_SUMMARY = {
  runs: 0,
  posts: 0,
  replies: 0,
  followed_accounts: 0,
};

export function uniqueRunId(prefix = "test") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
