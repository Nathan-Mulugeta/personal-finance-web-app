/**
 * Calculate effective budget for a category
 * Logic: max(own budget, sum of children budgets) if both exist
 *        own budget if only own exists
 *        sum of children if only children exist
 */
export function calculateEffectiveBudget(categoryId, ownBudget, childrenBudgets) {
  const childrenTotal = childrenBudgets.reduce((sum, budget) => sum + (budget || 0), 0)

  if (ownBudget > 0 && childrenTotal > 0) {
    return Math.max(ownBudget, childrenTotal)
  } else if (ownBudget > 0) {
    return ownBudget
  } else {
    return childrenTotal
  }
}

