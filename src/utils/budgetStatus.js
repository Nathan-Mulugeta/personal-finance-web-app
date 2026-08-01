import { getCategoryDescendants } from './categoryHierarchy'
import {
  convertAmountWithLookup,
  buildExchangeRateLookup,
} from './currencyConversion'
import {
  findBudgetForCategoryMonth,
  budgetAppliesToMonth,
} from './budgetMatching'

// "Near budget" begins at this fraction of the monthly budget — shared by the
// Home cue, the Reports insight, and the entry-time cue so they always agree.
export const NEAR_BUDGET_THRESHOLD = 0.8

/**
 * "YYYY-MM" for a Date (local time), matching how budgets store their month.
 *
 * Exported so a caller building a shared spend index can pin the month once and
 * hand the same value to every sweep — an index built for one month and a sweep
 * asking about another would silently report zero spending.
 */
export function currentMonthKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Group the month's spendable transactions by category, once.
 *
 * Every category-level check in spentForCategoryMonth below (status, deleted,
 * type, month) is independent of which category is being asked about — so
 * re-testing all of them for every budgeted category meant walking the whole
 * transaction list dozens of times per render. Bucketing once turns that into
 * a single pass.
 *
 * Rows keep their original array position so a subtree's transactions can be
 * summed back in the order the flat scan visited them. Floating-point addition
 * is not associative, so summing the same set in a different order can shift
 * the last bits of the result — and `spent` decides whether a budget reads as
 * over or under.
 *
 * @returns {Map<string, Array<{txn: Object, i: number}>>} keyed by category_id
 */
export function buildMonthlySpendIndex(
  transactions,
  monthKey = currentMonthKey()
) {
  const index = new Map()
  ;(transactions || []).forEach((txn, i) => {
    if (txn.status === 'Cancelled' || txn.deleted_at) return
    // Expenses only (Transfer Out spends from a category too, matching Reports)
    if (txn.type !== 'Expense' && txn.type !== 'Transfer Out') return
    // Local-time month bucket, matching how Reports groups by date
    if (!txn.date || currentMonthKey(new Date(txn.date)) !== monthKey) return
    let rows = index.get(txn.category_id)
    if (!rows) {
      rows = []
      index.set(txn.category_id, rows)
    }
    rows.push({ txn, i })
  })
  return index
}

/**
 * Sum a category's expense spending for a given "YYYY-MM", including its
 * descendants (a leaf has none, so it's just itself), converted into
 * `targetCurrency` with the cached exchange rates — the same conversion the
 * Reports page uses so the numbers agree.
 *
 * `spendIndex` and `rateLookup` are optional; callers summing many categories
 * build them once and pass them in. Omitted, they are derived here, so a
 * one-off call costs exactly what it did before.
 */
function spentForCategoryMonth({
  categoryId,
  categories,
  transactions,
  exchangeRates,
  targetCurrency,
  monthKey,
  excludeTransactionId,
  spendIndex,
  rateLookup,
}) {
  const index = spendIndex || buildMonthlySpendIndex(transactions, monthKey)
  const lookup = rateLookup || buildExchangeRateLookup(exchangeRates)

  const ids = [
    categoryId,
    ...getCategoryDescendants(categoryId, categories).map((c) => c.category_id),
  ]

  // Gather the subtree's rows, then restore the original scan order — see the
  // note on associativity above.
  let rows = []
  ids.forEach((id) => {
    const bucket = index.get(id)
    if (bucket) rows = rows.length === 0 ? bucket : rows.concat(bucket)
  })
  if (rows.length > 1) rows = rows.slice().sort((a, b) => a.i - b.i)

  let spent = 0
  rows.forEach(({ txn }) => {
    if (excludeTransactionId && txn.transaction_id === excludeTransactionId)
      return
    const amount = Math.abs(parseFloat(txn.amount || 0))
    const txnCurrency = txn.currency || targetCurrency
    const converted = convertAmountWithLookup(
      amount,
      txnCurrency,
      targetCurrency,
      lookup
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
  spendIndex,
  rateLookup,
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
    spendIndex,
    rateLookup,
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
  spendIndex: sharedSpendIndex,
  rateLookup: sharedRateLookup,
}) {
  // Built once for the whole sweep rather than per category. Callers running
  // both sweeps (useBudgetStatusMap) pass a shared one so the transaction list
  // is walked once in total, not once per sweep.
  const spendIndex =
    sharedSpendIndex || buildMonthlySpendIndex(transactions, monthKey)
  const rateLookup = sharedRateLookup || buildExchangeRateLookup(exchangeRates)
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
      spendIndex,
      rateLookup,
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
  spendIndex: sharedSpendIndex,
  rateLookup: sharedRateLookup,
}) {
  // See computeAllBudgetStatuses: shared when both sweeps run together.
  const spendIndex =
    sharedSpendIndex || buildMonthlySpendIndex(transactions, monthKey)
  const rateLookup = sharedRateLookup || buildExchangeRateLookup(exchangeRates)
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
      const converted = convertAmountWithLookup(
        amount,
        currency,
        baseCurrency,
        rateLookup
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
      spendIndex,
      rateLookup,
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
