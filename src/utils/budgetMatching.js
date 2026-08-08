import { parseISO, startOfMonth, endOfMonth } from 'date-fns'

/**
 * Normalize a month value to its 'YYYY-MM' key. Accepts 'YYYY-MM',
 * 'YYYY-MM-DD' (budgets store months anchored to a day, e.g. '2026-07-06'),
 * or null/undefined.
 */
export function monthKey(value) {
  if (!value) return null
  const [year, month] = value.split('-')
  return year && month ? `${year}-${month}` : null
}

/**
 * Single source of truth for "does this budget apply to this month?".
 * Used by the Budgets page filter, the Reports page budget lookup, and any
 * future consumer — so the matching rules cannot drift between pages.
 *
 * @param {Object} budget - budget record (recurring or one-time)
 * @param {string} monthStr - target month as 'YYYY-MM'
 */
export function budgetAppliesToMonth(budget, monthStr) {
  if (!budget || !monthStr) return false

  if (budget.recurring) {
    const target = parseISO(`${monthStr}-01`)
    if (budget.start_month) {
      const start = startOfMonth(parseISO(budget.start_month))
      if (target < start) return false
    }
    if (budget.end_month) {
      const end = endOfMonth(parseISO(budget.end_month))
      if (target > end) return false
    }
    return true
  }

  // One-time budget: same calendar month
  return monthKey(budget.month) === monthStr
}

/**
 * Every Active budget a category holds for a month.
 *
 * A category can carry more than one — "Wifi" and a phone line both budgeted
 * under Internet, say — and its plan for that month is their sum, which is what
 * the Reports page reports. Anything measuring spending against a plan must sum
 * these rather than pick one record with findBudgetForCategoryMonth below, or
 * it charges the category's whole spend against a fraction of its budget.
 *
 * @returns {Array<Object>}
 */
export function findBudgetsForCategoryMonth(budgets, categoryId, monthStr) {
  return (budgets || []).filter(
    (budget) =>
      budget.category_id === categoryId &&
      budget.status === 'Active' &&
      budgetAppliesToMonth(budget, monthStr)
  )
}

/**
 * Find A budget record for a category that applies to a month, preferring an
 * Active one over paused/inactive matches.
 *
 * For picking a single record to act on — the one an edit dialog opens. Not for
 * measuring: see findBudgetsForCategoryMonth above.
 *
 * @returns {Object|null}
 */
export function findBudgetForCategoryMonth(budgets, categoryId, monthStr) {
  const matches = (budgets || []).filter(
    (budget) =>
      budget.category_id === categoryId &&
      budgetAppliesToMonth(budget, monthStr)
  )
  return matches.find((budget) => budget.status === 'Active') || matches[0] || null
}
