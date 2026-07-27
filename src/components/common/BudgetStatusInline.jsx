import { Box, Typography } from '@mui/material';
import { formatCurrency } from '../../utils/currencyConversion';

// Severity colours for budget status, shared so the cue, its headers, the badge
// and the entry-time cue all read the same. Near uses a warm orange (kinder on
// the eyes than the yellow warning tone).
export const BUDGET_OVER_COLOR = 'error.main';
export const BUDGET_NEAR_COLOR = 'google.orange';
export const BUDGET_HEALTHY_COLOR = 'text.secondary';

/**
 * The single compact renderer for a category's budget status —
 * "68% · 1,100 Br left" or "112% · over 400 Br" — coloured by severity (grey
 * healthy, amber near, red over). Used by the Home cue, the budget search and
 * the per-row badge so the read is identical everywhere.
 *
 * @param {Object|null} status - a computed budget status (from budgetStatus.js)
 * @param {'row'|'badge'} [variant] - 'badge' is smaller, for dense rows
 */
export default function BudgetStatusInline({ status, variant = 'row', sx }) {
  if (!status) return null;
  const color = status.over
    ? BUDGET_OVER_COLOR
    : status.near
    ? BUDGET_NEAR_COLOR
    : BUDGET_HEALTHY_COLOR;
  const detail = status.over
    ? `over ${formatCurrency(status.spent - status.budgetAmount, status.currency)}`
    : `${formatCurrency(status.remaining, status.currency)} left`;
  return (
    <Typography
      component="span"
      sx={[
        {
          fontSize: variant === 'badge' ? '0.6875rem' : '0.75rem',
          color,
          whiteSpace: 'nowrap',
        },
        sx,
      ]}
    >
      <Box component="span" sx={{ fontWeight: 700 }}>
        {Math.round(status.pct * 100)}%
      </Box>{' '}
      · {detail}
    </Typography>
  );
}
