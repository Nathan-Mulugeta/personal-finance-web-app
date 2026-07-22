import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Box, Typography } from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  formatCurrency,
  convertAmountWithExchangeRates,
} from '../../utils/currencyConversion';
import { computeCategoryBudgetStatus } from '../../utils/budgetStatus';
import { selectBaseCurrency } from '../../store/selectors';

/**
 * The "enforce it in the moment" cue: while adding/editing an expense, shows how
 * much budget the chosen category has left this month, and turns red when the
 * amount being entered would push it over. Renders nothing unless the category
 * is an expense with a budget this month. Amount is projected on top of what's
 * already spent (excluding the row being edited, if any).
 *
 * @param {string} categoryId
 * @param {string} type - transaction type; only 'Expense' shows a cue
 * @param {number} amount - the amount being entered (in amountCurrency)
 * @param {string} amountCurrency - currency of `amount` (the account's currency)
 * @param {string} [excludeTransactionId] - the row being edited, so it isn't double-counted
 */
function BudgetInlineCue({
  categoryId,
  type,
  amount,
  amountCurrency,
  excludeTransactionId,
}) {
  const { categories } = useSelector((state) => state.categories);
  const { budgets } = useSelector((state) => state.budgets);
  const allTransactions = useSelector(
    (state) => state.transactions.allTransactions
  );
  const { exchangeRates } = useSelector((state) => state.exchangeRates);
  const baseCurrency = useSelector(selectBaseCurrency);

  const status = useMemo(() => {
    if (type !== 'Expense') return null;
    return computeCategoryBudgetStatus({
      categoryId,
      categories,
      budgets,
      transactions: allTransactions,
      exchangeRates,
      baseCurrency,
      excludeTransactionId,
    });
  }, [
    categoryId,
    type,
    categories,
    budgets,
    allTransactions,
    exchangeRates,
    baseCurrency,
    excludeTransactionId,
  ]);

  if (!status) return null;

  // Project the amount being entered onto what's already spent this month
  const entered = parseFloat(amount);
  let addition = 0;
  if (!Number.isNaN(entered) && entered > 0) {
    const converted = convertAmountWithExchangeRates(
      entered,
      amountCurrency || status.currency,
      status.currency,
      exchangeRates
    );
    addition = converted !== null ? converted : entered;
  }
  const projected = status.spent + addition;
  const remaining = status.budgetAmount - projected;
  const over = projected > status.budgetAmount;
  const near = !over && projected >= status.budgetAmount * 0.8;

  const color = over ? 'error.main' : near ? 'warning.main' : 'text.secondary';
  const message = over
    ? `Over budget by ${formatCurrency(
        projected - status.budgetAmount,
        status.currency
      )} this month`
    : `${formatCurrency(remaining, status.currency)} left in budget this month`;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        mt: 0.5,
        color,
      }}
    >
      {(over || near) && (
        <WarningAmberRoundedIcon sx={{ fontSize: 14, flexShrink: 0 }} />
      )}
      <Typography variant="caption" sx={{ color: 'inherit', lineHeight: 1.3 }}>
        {message}
      </Typography>
    </Box>
  );
}

export default BudgetInlineCue;
