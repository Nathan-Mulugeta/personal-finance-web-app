/**
 * Budget alerts you've chosen not to see again this month.
 *
 * Stored as a single JSON settings value so it syncs across devices with
 * everything else:
 *
 *   { "2026-08": { "CAT_123": "near", "CAT_456": "over" } }
 *
 * The stored value is the severity the alert had when it was dismissed, so a
 * dismissal only silences what you actually saw. Waving away a near-budget
 * warning silences that warning — not the breach it may later turn into.
 *
 * Keying by month is what makes "until next month" free: come the 1st, last
 * month's key simply stops matching. Writes keep only the month being written,
 * so the value can't grow without bound.
 */

export const DISMISSED_BUDGET_ALERTS_KEY = 'DismissedBudgetAlerts'

// Dismissing at 'near' is undone by a rise to 'over'; 'over' is the ceiling, so
// dismissing there holds for the rest of the month.
const SEVERITY_RANK = { near: 0, over: 1 }

/** The severity of a computed budget status, as stored in a dismissal. */
export function statusSeverity(status) {
  return status.over ? 'over' : 'near'
}

/**
 * Read the stored value into an object. A missing or malformed value hides
 * nothing rather than throwing — the next write replaces it.
 */
export function parseDismissals(raw) {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

/**
 * Is this alert silenced right now? Only while it is no worse than it was when
 * dismissed.
 */
export function isDismissed(dismissals, monthKey, categoryId, severity) {
  const dismissedAt = dismissals?.[monthKey]?.[categoryId]
  if (!dismissedAt) return false
  return SEVERITY_RANK[severity] <= SEVERITY_RANK[dismissedAt]
}

/**
 * The stored value with one alert silenced. Older months are dropped — nothing
 * reads them, and this keeps the setting a fixed size.
 */
export function addDismissal(dismissals, monthKey, categoryId, severity) {
  return {
    [monthKey]: { ...(dismissals[monthKey] || {}), [categoryId]: severity },
  }
}

/** The stored value with one alert brought back. */
export function removeDismissal(dismissals, monthKey, categoryId) {
  const month = { ...(dismissals[monthKey] || {}) }
  delete month[categoryId]
  return { [monthKey]: month }
}
