import { useNavigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { useBudgetStatusMap } from '../../hooks/useBudgetStatusMap';
import BudgetStatusInline from './BudgetStatusInline';

const MAX_MATCHES = 5;

/**
 * When the Home search query matches budgeted expense categories, show their
 * this-month budget status right above the transaction results — so you can
 * check "how close am I / how much over" without opening Reports. Renders
 * nothing when the query matches no budgeted category. Tapping one opens Reports
 * filtered to it.
 */
export default function BudgetSearchHint({ query }) {
  const navigate = useNavigate();
  const { all } = useBudgetStatusMap();

  const q = (query || '').trim().toLowerCase();
  if (!q) return null;
  const matches = all
    .filter((s) => s.name.toLowerCase().includes(q))
    .slice(0, MAX_MATCHES);
  if (matches.length === 0) return null;

  return (
    <Box
      sx={{
        mb: 1.5,
        px: 1.5,
        py: 1,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Typography
        sx={{
          fontSize: '0.625rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: 'text.secondary',
          mb: 0.5,
        }}
      >
        Budget this month
      </Typography>
      {matches.map((s) => (
        <Box
          key={s.categoryId}
          onClick={() =>
            navigate('/reports', { state: { categorySearch: s.name } })
          }
          sx={{
            py: 0.5,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 1,
            cursor: 'pointer',
            '&:not(:last-of-type)': {
              borderBottom: '1px solid',
              borderColor: 'divider',
            },
          }}
        >
          <Typography
            noWrap
            sx={{ fontSize: '0.8125rem', fontWeight: 500, minWidth: 0 }}
          >
            {s.name}
          </Typography>
          <BudgetStatusInline status={s} variant="badge" sx={{ flexShrink: 0 }} />
        </Box>
      ))}
    </Box>
  );
}
