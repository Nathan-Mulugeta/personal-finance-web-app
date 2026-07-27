import { parseISO, isSameMonth } from 'date-fns';
import BudgetStatusInline from './BudgetStatusInline';

/**
 * The per-row budget badge (F1): on a current-month expense row whose category
 * has a budget this month, shows that category's month-to-date status
 * ("68% · 1,100 Br left") so you can see where the category stands while
 * scanning transactions. Renders nothing when disabled, for non-expense rows,
 * for other months, or for categories without a direct budget.
 *
 * `statusMap` is `byCategoryId` from useBudgetStatusMap — computed once by the
 * list and passed in, so it isn't recomputed per row.
 *
 * @param {Object} transaction
 * @param {Map<string, object>} statusMap - byCategoryId from useBudgetStatusMap
 * @param {boolean} enabled - the ShowBudgetOnRows setting
 * @param {object} [sx]
 */
export default function RowBudgetBadge({ transaction, statusMap, enabled, sx }) {
  if (!enabled || !statusMap) return null;
  if (transaction.type !== 'Expense') return null;

  let inMonth = false;
  try {
    inMonth = isSameMonth(parseISO(transaction.date), new Date());
  } catch {
    inMonth = false;
  }
  if (!inMonth) return null;

  const status = statusMap.get(transaction.category_id);
  if (!status) return null;

  return <BudgetStatusInline status={status} variant="badge" sx={sx} />;
}
