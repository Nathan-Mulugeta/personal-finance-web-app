import { parseISO, isSameMonth } from 'date-fns';
import BudgetStatusInline from './BudgetStatusInline';

/**
 * The per-row budget badge (F1): on a current-month expense row whose category
 * has a budget this month, shows that category's month-to-date status
 * ("68% · 1,100 Br left") so you can see where the category stands while
 * scanning transactions. Renders nothing when disabled, for non-expense rows,
 * for other months, or for categories without a direct budget.
 *
 * `status` is the already-resolved status for this row's category (from
 * `useBudgetStatusMap().byCategoryId.get(categoryId)`, or undefined). Callers
 * resolve it so memoized rows only re-render when their own status changes.
 *
 * @param {Object} transaction
 * @param {Object|undefined} status - resolved budget status for the category
 * @param {boolean} enabled - the ShowBudgetOnRows setting
 * @param {object} [sx]
 */
export default function RowBudgetBadge({ transaction, status, enabled, sx }) {
  if (!enabled || !status) return null;
  if (transaction.type !== 'Expense') return null;

  let inMonth = false;
  try {
    inMonth = isSameMonth(parseISO(transaction.date), new Date());
  } catch {
    inMonth = false;
  }
  if (!inMonth) return null;

  return <BudgetStatusInline status={status} variant="badge" sx={sx} />;
}
