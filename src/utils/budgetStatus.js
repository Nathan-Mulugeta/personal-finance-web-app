import { getCategoryDescendants } from './categoryHierarchy'
import { convertAmountWithExchangeRates } from './currencyConversion'
import { findBudgetForCategoryMonth } from './budgetMatching'

/**
 * "YYYY-MM" for a Date (local time), matching how budgets store their month.
 */
export function currentMonthKey(date = new Date()) {
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
 * All expense categories that need attention this month — near or over their
 * budget — sorted worst-first. Returns [] when everything is healthy, so the
 * Home cue can render nothing and keep Home minimal.
 *
 * @param {number} nearThreshold - fraction (0-1) at which "near" begins (0.8 = 80%)
 * @returns {Array<{categoryId, name, budgetAmount, currency, spent, remaining, pct, over, near}>}
 */
export function computeBudgetsNeedingAttention({
  categories,
  budgets,
  transactions,
  exchangeRates,
  baseCurrency,
  monthKey = currentMonthKey(),
  nearThreshold = 0.8,
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
    const near = status.pct >= nearThreshold
    if (!near && !status.over) return
    results.push({
      categoryId: cat.category_id,
      name: cat.name,
      ...status,
      near: near && !status.over,
    })
  })
  results.sort((a, b) => b.pct - a.pct)
  return results
}
