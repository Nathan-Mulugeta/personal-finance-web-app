import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { useBudgetStatusMap } from '../../hooks/useBudgetStatusMap';
import BudgetStatusInline, {
  BUDGET_OVER_COLOR,
  BUDGET_NEAR_COLOR,
} from './BudgetStatusInline';

const COLLAPSED_PER_COLUMN = 3;

/**
 * Home cue for this month's budgets. When both an Over and a Near group exist it
 * shows them as two compact columns (Over left, Near right) so both are glance-
 * able without eating vertical space. When only one group has entries it takes
 * the full width instead of leaving an empty column. Expands in place to the
 * full set; renders nothing when everything is healthy. Tapping a category opens
 * Reports pre-filtered to it.
 */
function BudgetAttentionCue() {
  const navigate = useNavigate();
  const { over, near } = useBudgetStatusMap();
  const [expanded, setExpanded] = useState(false);

  const groups = [];
  if (over.length) groups.push({ title: 'Over budget', items: over, tone: BUDGET_OVER_COLOR });
  if (near.length) groups.push({ title: 'Near budget', items: near, tone: BUDGET_NEAR_COLOR });
  if (groups.length === 0) return null;

  const hidden = groups.reduce(
    (n, g) => n + Math.max(0, g.items.length - COLLAPSED_PER_COLUMN),
    0
  );

  const openCategory = (name) =>
    navigate('/reports', { state: { categorySearch: name } });

  const column = ({ title, items, tone }) => {
    const shown = expanded ? items : items.slice(0, COLLAPSED_PER_COLUMN);
    return (
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: '0.625rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: tone,
            pb: 0.5,
            mb: 0.5,
            // Rule under the header so it reads as a heading, not another row
            borderBottom: '2px solid',
            borderColor: tone,
          }}
        >
          {title} · {items.length}
        </Typography>
        {shown.map((item) => (
          <Box
            key={item.categoryId}
            onClick={() => openCategory(item.name)}
            sx={{
              py: 0.5,
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
              {item.name}
            </Typography>
            <BudgetStatusInline status={item} variant="badge" />
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Box
      sx={{
        mb: 1,
        px: 1.5,
        py: 1,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        {groups.map((group, i) => (
          <Fragment key={group.title}>
            {i > 0 && (
              <Box sx={{ width: '1px', alignSelf: 'stretch', bgcolor: 'divider' }} />
            )}
            {column(group)}
          </Fragment>
        ))}
      </Box>

      {(hidden > 0 || expanded) && (
        <Typography
          onClick={() => setExpanded((v) => !v)}
          sx={{
            mt: 0.75,
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'text.secondary',
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          {expanded ? 'Show less' : `Show ${hidden} more`}
        </Typography>
      )}
    </Box>
  );
}

export default BudgetAttentionCue;
