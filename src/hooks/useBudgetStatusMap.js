import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
  computeAllBudgetStatuses,
  computeAggregatedParentStatuses,
  buildMonthlySpendIndex,
  currentMonthKey,
} from '../utils/budgetStatus';
import { buildExchangeRateLookup } from '../utils/currencyConversion';
import {
  selectBaseCurrency,
  selectDismissedBudgetAlerts,
} from '../store/selectors';
import { isDismissed, statusSeverity } from '../utils/budgetDismissals';

/**
 * This month's budget status for every budgeted expense category, computed once
 * from the store. The single source the Home cue, the row badge and the budget
 * search all read from — so they can never disagree.
 *
 * Dismissals filter the attention lists only. A dismissed category still shows
 * its badge on a transaction row and still answers a budget search: silencing
 * an alert means "stop calling me about this", not "hide the number".
 *
 * @returns {{
 *   all: Array,                       // every directly-budgeted expense category, worst-first
 *   byCategoryId: Map<string, object>,// quick lookup for a transaction row
 *   over: Array,                      // exceeded budget, not dismissed
 *   near: Array,                      // >= NEAR_BUDGET_THRESHOLD, not over, not dismissed
 *   dismissed: Array,                 // near/over, silenced for this month
 *   searchable: Array,                // `all` + parents whose budget rolls up from children
 *   monthKey: string,                 // the month all of the above was computed for
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
  const dismissals = useSelector(selectDismissedBudgetAlerts);

  // Both sweeps below walk the same transactions and the same rates. Building
  // these once and sharing them means the list is grouped a single time per
  // change, instead of once per sweep.
  //
  // monthKey is pinned here and passed down with the index it was built from,
  // so the two can never disagree — an index grouped for one month combined
  // with a sweep asking about another would report every budget as unspent.
  const shared = useMemo(() => {
    const monthKey = currentMonthKey();
    return {
      monthKey,
      spendIndex: buildMonthlySpendIndex(allTransactions, monthKey),
      rateLookup: buildExchangeRateLookup(exchangeRates),
    };
  }, [allTransactions, exchangeRates]);

  const all = useMemo(
    () =>
      computeAllBudgetStatuses({
        categories,
        budgets,
        transactions: allTransactions,
        exchangeRates,
        baseCurrency,
        ...shared,
      }),
    [categories, budgets, allTransactions, exchangeRates, baseCurrency, shared]
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
        ...shared,
      }),
    [categories, budgets, allTransactions, exchangeRates, baseCurrency, shared]
  );

  return useMemo(() => {
    const { monthKey } = shared;
    const silenced = (s) =>
      isDismissed(dismissals, monthKey, s.categoryId, statusSeverity(s));
    const needsAttention = all.filter((s) => s.over || s.near);
    return {
      all,
      byCategoryId: new Map(all.map((s) => [s.categoryId, s])),
      over: all.filter((s) => s.over && !silenced(s)),
      near: all.filter((s) => s.near && !silenced(s)),
      dismissed: needsAttention.filter(silenced),
      searchable: [...all, ...aggregatedParents].sort((a, b) => b.pct - a.pct),
      monthKey,
    };
  }, [all, aggregatedParents, dismissals, shared]);
}
