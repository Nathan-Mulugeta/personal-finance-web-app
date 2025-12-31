/**
 * Calculate effective budget for a category
 * Logic: sum of own budget + sum of children budgets
 */
export function calculateEffectiveBudget(categoryId, ownBudget, childrenBudgets) {
  const childrenTotal = childrenBudgets.reduce((sum, budget) => sum + (budget || 0), 0)
  return (ownBudget || 0) + childrenTotal
}

