import { Typography } from '@mui/material';
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
 * @param {boolean} [trailingSeparator] - emit a "·" after the badge, for rows
 *   that place the date right next to it. Only rendered when the badge itself
 *   renders, so a row without a budget never shows a stray separator.
 * @param {object} [sx]
 */
export default function RowBudgetBadge({
  transaction,
  status,
  enabled,
  trailingSeparator = false,
  sx,
}) {
  if (!enabled || !status) return null;
  if (transaction.type !== 'Expense') return null;

  let inMonth = false;
  try {
    inMonth = isSameMonth(parseISO(transaction.date), new Date());
  } catch {
    inMonth = false;
  }
  if (!inMonth) return null;

  return (
    <>
      <BudgetStatusInline status={status} variant="badge" sx={sx} />
      {trailingSeparator && (
        <Typography
          component="span"
          aria-hidden="true"
          sx={{
            fontSize: '0.6875rem',
            color: 'text.secondary',
            flexShrink: 0,
            // Both callers are flex rows with gap: 1 (8px); pulling 4px back on
            // each side sits this "·" at the same rhythm as the ones inside the
            // badge ("68% · 1,100 Br left") and the date ("Aug 02 · 3:15 PM").
            mx: -0.5,
          }}
        >
          ·
        </Typography>
      )}
    </>
  );
}
