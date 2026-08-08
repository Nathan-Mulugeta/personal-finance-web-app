/**
 * Extract a human-readable message from a thrown/rejected value.
 *
 * Redux Toolkit thunks here reject via `rejectWithValue(error.message)`, so the
 * value surfaced by `.unwrap()` (and carried in `action.payload`) is a plain
 * STRING, not an Error. Handlers that only read `err?.message` therefore miss
 * the real reason and fall back to a generic message. This normalizes both
 * shapes (string payloads and Error objects).
 *
 * @param {unknown} err - a string, an Error, or an action payload
 * @param {string} [fallback] - used when no message can be extracted
 * @returns {string}
 */
// Transport failures arrive as browser-level text ("TypeError: Failed to
// fetch", "AbortError") that names the mechanism rather than anything the
// reader can act on. Since an optimistic save reports nothing but its
// failures, these are the messages that actually get read.
const TRANSPORT_MESSAGES = [
  [/abort|timed? ?out/i, 'The server took too long to respond.'],
  [
    /failed to fetch|network ?error|network request failed|load failed/i,
    "Can't reach the server — check your connection.",
  ],
];

export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;
  const raw =
    typeof err === 'string'
      ? err
      : typeof err.message === 'string' && err.message
      ? err.message
      : '';
  if (!raw) return fallback;
  const transport = TRANSPORT_MESSAGES.find(([pattern]) => pattern.test(raw));
  return transport ? transport[1] : raw;
}
