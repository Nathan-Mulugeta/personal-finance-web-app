import { getCategoryDescendants } from './categoryHierarchy'
import { convertAmountWithExchangeRates } from './currencyConversion'
import {
  findBudgetForCategoryMonth,
  budgetAppliesToMonth,
} from './budgetMatching'

// "Near budget" begins at this fraction of the monthly budget — shared by the
// Home cue, the Reports insight, and the entry-time cue so they always agree.
export const NEAR_BUDGET_THRESHOLD = 0.8

/**
 * "YYYY-MM" for a Date (local time), matching how budgets store their month.
 */
function currentMonthKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Sum a category's expense spending for a given "YYYY-MM", including its
 * descendants (a leaf has none, so it's just itself), converted into
 * `targetCurrency` with the cached exchange rates — the same conversion the
 * Reports page uses so the numbers agree.
 */
function spentForCategoryMonth({
  categoryId,
  categories,
  transactions,
  exchangeRates,
  targetCurrency,
  monthKey,
  excludeTransactionId,
}) {
  const ids = new Set([
    categoryId,
    ...getCategoryDescendants(categoryId, categories).map((c) => c.category_id),
  ])
  let spent = 0
  transactions.forEach((txn) => {
    if (!ids.has(txn.category_id)) return
    if (excludeTransactionId && txn.transaction_id === excludeTransactionId)
      return
    if (txn.status === 'Cancelled' || txn.deleted_at) return
    // Expenses only (Transfer Out spends from a category too, matching Reports)
    if (txn.type !== 'Expense' && txn.type !== 'Transfer Out') return
    // Local-time month bucket, matching how Reports groups by date
    if (!txn.date || currentMonthKey(new Date(txn.date)) !== monthKey) return
    const amount = Math.abs(parseFloat(txn.amount || 0))
    const txnCurrency = txn.currency || targetCurrency
    const converted = convertAmountWithExchangeRates(
      amount,
      txnCurrency,
      targetCurrency,
      exchangeRates
    )
    spent += converted !== null ? converted : amount
  })
  return spent
}

/**
 * Budget health for a single expense category in a month, or null when it has
 * no budget for that month. Used by the entry-time cue in Add/Edit.
 *
 * @returns {null | {budgetAmount, currency, spent, remaining, pct, over}}
 */
export function computeCategoryBudgetStatus({
  categoryId,
  categories,
  budgets,
  transactions,
  exchangeRates,
  baseCurrency,
  monthKey = currentMonthKey(),
  excludeTransactionId,
}) {
  if (!categoryId) return null
  const cat = categories.find((c) => c.category_id === categoryId)
  if (!cat || cat.type !== 'Expense') return null
  const budget = findBudgetForCategoryMonth(budgets, categoryId, monthKey)
  if (!budget) return null
  const budgetAmount = parseFloat(budget.amount || 0)
  if (!(budgetAmount > 0)) return null
  const currency = budget.currency || baseCurrency
  const spent = spentForCategoryMonth({
    categoryId,
    categories,
    transactions,
    exchangeRates,
    targetCurrency: currency,
    monthKey,
    excludeTransactionId,
  })
  return {
    budgetAmount,
    currency,
    spent,
    remaining: budgetAmount - spent,
    pct: budgetAmount > 0 ? spent / budgetAmount : 0,
    over: spent > budgetAmount,
  }
}

/**
 * Budget status for EVERY active expense category that has a budget this month
 * (healthy, near, and over alike), sorted worst-first. The single source the
 * Home cue, the row badge and the budget search all read from.
 *
 * @param {number} nearThreshold - fraction (0-1) at which "near" begins (0.8 = 80%)
 * @returns {Array<{categoryId, name, budgetAmount, currency, spent, remaining, pct, over, near}>}
 */
export function computeAllBudgetStatuses({
  categories,
  budgets,
  transactions,
  exchangeRates,
  baseCurrency,
  monthKey = currentMonthKey(),
  nearThreshold = NEAR_BUDGET_THRESHOLD,
}) {
  const results = []
  categories.forEach((cat) => {
    if (cat.type !== 'Expense' || cat.status !== 'Active') return
    const status = computeCategoryBudgetStatus({
      categoryId: cat.category_id,
      categories,
      budgets,
      transactions,
      exchangeRates,
      baseCurrency,
      monthKey,
    })
    if (!status) return
    results.push({
      categoryId: cat.category_id,
      name: cat.name,
      ...status,
      // "Near" = approaching the limit, strictly under it. A category sitting
      // exactly at 100% (a fixed expense like rent whose spend equals its
      // budget every month) is neither near nor over — it's not actionable, so
      // it stays out of the attention cue.
      near: status.pct >= nearThreshold && status.pct < 1,
    })
  })
  results.sort((a, b) => b.pct - a.pct)
  return results
}

/**
 * The subset of computeAllBudgetStatuses that needs attention — near or over.
 * Returns [] when everything is healthy, so the Home cue renders nothing.
 */
export function computeBudgetsNeedingAttention(params) {
  return computeAllBudgetStatuses(params).filter((s) => s.over || s.near)
}

/**
 * Budget status for PARENT categories that have no budget of their own but whose
 * children do — the aggregated view the Reports page shows. Budget is the sum of
 * self+descendant active budgets applying this month (converted to base
 * currency); spend already rolls up descendants. This lets a parent be found by
 * a budget search even though the budget lives on its children.
 *
 * Excludes parents that have a direct budget (those are already in
 * `computeAllBudgetStatuses`), so there's no overlap.
 *
 * @returns {Array<{categoryId, name, budgetAmount, currency, spent, remaining, pct, over, near, aggregated}>}
 */
export function computeAggregatedParentStatuses({
  categories,
  budgets,
  transactions,
  exchangeRates,
  baseCurrency,
  monthKey = currentMonthKey(),
  nearThreshold = NEAR_BUDGET_THRESHOLD,
}) {
  const results = []
  categories.forEach((cat) => {
    if (cat.type !== 'Expense' || cat.status !== 'Active') return
    const descendants = getCategoryDescendants(cat.category_id, categories)
    if (descendants.length === 0) return
    // A direct budget means it's already covered by computeAllBudgetStatuses.
    if (findBudgetForCategoryMonth(budgets, cat.category_id, monthKey)) return

    // Sum the descendants' budgets that apply this month, in base currency.
    const descendantIds = new Set(descendants.map((d) => d.category_id))
    let budgetAmount = 0
    let hasBudget = false
    budgets.forEach((budget) => {
      if (!descendantIds.has(budget.category_id)) return
      if (budget.status !== 'Active') return
      if (!budgetAppliesToMonth(budget, monthKey)) return
      const amount = parseFloat(budget.amount || 0)
      if (!(amount > 0)) return
      hasBudget = true
      const currency = budget.currency || baseCurrency
      const converted = convertAmountWithExchangeRates(
        amount,
        currency,
        baseCurrency,
        exchangeRates
      )
      budgetAmount += converted !== null ? converted : amount
    })
    if (!hasBudget || !(budgetAmount > 0)) return

    const spent = spentForCategoryMonth({
      categoryId: cat.category_id,
      categories,
      transactions,
      exchangeRates,
      targetCurrency: baseCurrency,
      monthKey,
    })
    const pct = budgetAmount > 0 ? spent / budgetAmount : 0
    results.push({
      categoryId: cat.category_id,
      name: cat.name,
      budgetAmount,
      currency: baseCurrency,
      spent,
      remaining: budgetAmount - spent,
      pct,
      over: spent > budgetAmount,
      near: pct >= nearThreshold && pct < 1,
      aggregated: true,
    })
  })
  results.sort((a, b) => b.pct - a.pct)
  return results
}
