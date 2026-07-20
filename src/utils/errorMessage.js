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
export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (typeof err.message === 'string' && err.message) return err.message;
  return fallback;
}
