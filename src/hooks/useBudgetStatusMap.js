import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
  computeAllBudgetStatuses,
  computeAggregatedParentStatuses,
} from '../utils/budgetStatus';
import { selectBaseCurrency } from '../store/selectors';

/**
 * This month's budget status for every budgeted expense category, computed once
 * from the store. The single source the Home cue, the row badge and the budget
 * search all read from — so they can never disagree.
 *
 * @returns {{
 *   all: Array,                       // every directly-budgeted expense category, worst-first
 *   byCategoryId: Map<string, object>,// quick lookup for a transaction row
 *   over: Array,                      // exceeded budget
 *   near: Array,                      // >= NEAR_BUDGET_THRESHOLD, not over
 *   searchable: Array,                // `all` + parents whose budget rolls up from children
 * }}
 */
export function useBudgetStatusMap() {
  const { categories } = useSelector((state) => state.categories);
  const { budgets } = useSelector((state) => state.budgets);
  const allTransactions = useSelector(
    (state) => state.transactions.allTransactions
  );
  const { exchangeRates } = useSelector((state) => state.exchangeRates);
  const baseCurrency = useSelector(selectBaseCurrency);

  const all = useMemo(
    () =>
      computeAllBudgetStatuses({
        categories,
        budgets,
        transactions: allTransactions,
        exchangeRates,
        baseCurrency,
      }),
    [categories, budgets, allTransactions, exchangeRates, baseCurrency]
  );

  // Parents whose budget aggregates from their children — search-only, so the
  // cue and row badge (which read `all`/`byCategoryId`) don't double-count.
  const aggregatedParents = useMemo(
    () =>
      computeAggregatedParentStatuses({
        categories,
        budgets,
        transactions: allTransactions,
        exchangeRates,
        baseCurrency,
      }),
    [categories, budgets, allTransactions, exchangeRates, baseCurrency]
  );

  return useMemo(
    () => ({
      all,
      byCategoryId: new Map(all.map((s) => [s.categoryId, s])),
      over: all.filter((s) => s.over),
      near: all.filter((s) => s.near),
      searchable: [...all, ...aggregatedParents].sort((a, b) => b.pct - a.pct),
    }),
    [all, aggregatedParents]
  );
}
