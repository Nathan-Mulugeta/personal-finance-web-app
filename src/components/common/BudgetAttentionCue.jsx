import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { formatCurrency } from '../../utils/currencyConversion';
import { computeBudgetsNeedingAttention } from '../../utils/budgetStatus';
import { selectBaseCurrency } from '../../store/selectors';

const MAX_SHOWN = 4;

/**
 * Home cue that surfaces ONLY the expense categories near or over their budget
 * this month, worst-first. Renders nothing when everything is healthy, so Home
 * stays minimal — it appears only when there's a decision to influence.
 * Tapping anywhere jumps to the Reports page for the full picture.
 */
function BudgetAttentionCue() {
  const navigate = useNavigate();
  const { categories } = useSelector((state) => state.categories);
  const { budgets } = useSelector((state) => state.budgets);
  const allTransactions = useSelector(
    (state) => state.transactions.allTransactions
  );
  const { exchangeRates } = useSelector((state) => state.exchangeRates);
  const baseCurrency = useSelector(selectBaseCurrency);

  const items = useMemo(
    () =>
      computeBudgetsNeedingAttention({
        categories,
        budgets,
        transactions: allTransactions,
        exchangeRates,
        baseCurrency,
      }),
    [categories, budgets, allTransactions, exchangeRates, baseCurrency]
  );

  if (items.length === 0) return null;

  const shown = items.slice(0, MAX_SHOWN);
  const overCount = items.filter((i) => i.over).length;
  const nearCount = items.length - overCount;
  // A little breakdown up top: how many are over, and how many are just near.
  const headline =
    overCount > 0
      ? `${overCount} over budget${
          nearCount > 0 ? ` · ${nearCount} near` : ''
        } this month`
      : `${nearCount} near budget this month`;

  return (
    <Box
      onClick={() => navigate('/reports')}
      sx={{
        mb: 1,
        px: 1.5,
        py: 1,
        borderRadius: 2,
        cursor: 'pointer',
        border: '1px solid',
        borderColor: 'divider',
        transition: 'border-color 0.15s ease',
        '@media (hover: hover)': {
          '&:hover': { borderColor: 'text.disabled' },
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          mb: 1,
        }}
      >
        <WarningAmberRoundedIcon
          sx={{
            fontSize: 18,
            display: 'block',
            color: overCount > 0 ? 'error.main' : 'warning.main',
          }}
        />
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            lineHeight: 1,
            color: 'text.primary',
          }}
        >
          {headline}
        </Typography>
      </Box>

      <Box>
        {shown.map((item) => {
          const color = item.over ? 'error.main' : 'warning.main';
          const detail = item.over
            ? `over by ${formatCurrency(
                item.spent - item.budgetAmount,
                item.currency
              )}`
            : `${formatCurrency(item.remaining, item.currency)} left`;
          return (
            <Box
              key={item.categoryId}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 1,
                py: 0.75,
                // A full-width rule ties each name on the left to its figures
                // on the right, and separates one category from the next.
                '&:not(:last-of-type)': {
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                },
              }}
            >
              <Typography
                variant="body2"
                noWrap
                sx={{ fontSize: '0.8125rem', fontWeight: 500, minWidth: 0 }}
              >
                {item.name}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontSize: '0.75rem',
                  color,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <Box component="span" sx={{ fontWeight: 700 }}>
                  {Math.round(item.pct * 100)}%
                </Box>{' '}
                · {detail}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {items.length > MAX_SHOWN && (
        <Typography
          variant="caption"
          sx={{ display: 'block', mt: 1, color: 'text.secondary' }}
        >
          +{items.length - MAX_SHOWN} more · View in Reports
        </Typography>
      )}
    </Box>
  );
}

export default BudgetAttentionCue;
