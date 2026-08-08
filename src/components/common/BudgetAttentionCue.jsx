import { Fragment, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Box, IconButton, Typography } from '@mui/material';
import NotificationsOffOutlinedIcon from '@mui/icons-material/NotificationsOffOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import { useBudgetStatusMap } from '../../hooks/useBudgetStatusMap';
import { selectDismissedBudgetAlerts } from '../../store/selectors';
import { updateSetting } from '../../store/slices/settingsSlice';
import {
  DISMISSED_BUDGET_ALERTS_KEY,
  addDismissal,
  removeDismissal,
  statusSeverity,
} from '../../utils/budgetDismissals';
import SwipeAction from './SwipeAction';
import BudgetStatusInline, {
  BUDGET_OVER_COLOR,
  BUDGET_NEAR_COLOR,
} from './BudgetStatusInline';

const COLLAPSED_PER_COLUMN = 4;
// The revealed strip behind a swiped row. Muting isn't destructive, so it reads
// as a neutral action rather than the red the delete swipe uses.
const MUTE_COLOR = 'text.secondary';

/**
 * Home cue for this month's budgets. Collapsed, it shows Over and Near as two
 * compact columns so both are glanceable without eating vertical space (a single
 * group takes the full width rather than leaving an empty column) — there each
 * item stacks name over badge since the columns are narrow. Expanded, it stacks
 * the groups full-width and lays each item on one line (name left, badge right),
 * so a long list stays dense. Renders nothing when everything is healthy.
 * Tapping a category opens Reports pre-filtered to it.
 *
 * An alert you've already acted on is noise for the rest of the month — a
 * category paid in one go sits at 90% until the 1st with nothing to decide. Swipe
 * a row (or use the hover icon on desktop) to silence it until next month; the
 * footer keeps count and hands them back. Silencing is per category per month and
 * remembers the severity, so a near-budget alert you waved away still returns if
 * it later goes over.
 */
function BudgetAttentionCue() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { over, near, dismissed, monthKey } = useBudgetStatusMap();
  const dismissals = useSelector(selectDismissedBudgetAlerts);
  const [expanded, setExpanded] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);

  const groups = [];
  if (over.length)
    groups.push({ title: 'Over budget', items: over, tone: BUDGET_OVER_COLOR });
  if (near.length)
    groups.push({ title: 'Near budget', items: near, tone: BUDGET_NEAR_COLOR });
  // Still render for dismissed-only, or the footer that hands them back would
  // disappear along with the last visible alert.
  if (groups.length === 0 && dismissed.length === 0) return null;

  const overflow = groups.reduce(
    (n, g) => n + Math.max(0, g.items.length - COLLAPSED_PER_COLUMN),
    0
  );

  const openCategory = (name) =>
    navigate('/reports', { state: { categorySearch: name } });

  // updateSetting applies optimistically and reverts on failure, so the row
  // goes immediately. The setting syncs, so silencing on the phone silences on
  // every other device too.
  const persist = (next) =>
    dispatch(
      updateSetting({
        key: DISMISSED_BUDGET_ALERTS_KEY,
        value: JSON.stringify(next),
      })
    );
  const dismiss = (item) =>
    persist(
      addDismissal(dismissals, monthKey, item.categoryId, statusSeverity(item))
    );
  const restore = (item) =>
    persist(removeDismissal(dismissals, monthKey, item.categoryId));

  const groupHeader = (title, count, tone) => (
    <Typography
      sx={{
        fontSize: '0.625rem',
        fontWeight: 700,
        lineHeight: 1.2,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: tone,
        pb: 0.25,
        mb: 0.25,
        // Rule under the header so it reads as a heading, not another row
        borderBottom: '2px solid',
        borderColor: tone,
      }}
    >
      {title} · {count}
    </Typography>
  );

  // `inline` puts name + badge on one line (full-width expanded rows); otherwise
  // they stack (narrow collapsed columns, where the name needs the width).
  const itemRow = (item, inline) => (
    <SwipeAction
      key={item.categoryId}
      onSwipe={() => dismiss(item)}
      icon={NotificationsOffOutlinedIcon}
      color={MUTE_COLOR}
    >
      <Box
        onClick={() => openCategory(item.name)}
        sx={{
          py: 0.375,
          cursor: 'pointer',
          position: 'relative',
          bgcolor: 'background.paper',
          ...(inline && {
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 1,
          }),
          '&:not(:last-of-type)': {
            borderBottom: '1px solid',
            borderColor: 'divider',
          },
          '&:hover .cue-mute-btn': { opacity: 1 },
        }}
      >
        <Typography
          noWrap
          sx={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            lineHeight: 1.3,
            minWidth: 0,
          }}
        >
          {item.name}
        </Typography>
        <BudgetStatusInline
          status={item}
          variant="badge"
          sx={inline ? { flexShrink: 0 } : undefined}
        />
        {/* Desktop counterpart to the swipe. Absolutely positioned so it costs
            the narrow collapsed columns no width, and only paints on hover. */}
        <IconButton
          size="small"
          className="cue-mute-btn"
          aria-label={`Hide ${item.name} until next month`}
          onClick={(e) => {
            e.stopPropagation();
            dismiss(item);
          }}
          sx={{
            position: 'absolute',
            right: -4,
            top: '50%',
            transform: 'translateY(-50%)',
            opacity: 0,
            transition: 'opacity 0.15s',
            color: 'text.disabled',
            bgcolor: 'background.paper',
            '&:hover': { color: 'text.primary', bgcolor: 'background.paper' },
          }}
        >
          <NotificationsOffOutlinedIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </SwipeAction>
  );

  const footerLink = (label, onClick) => (
    <Typography
      onClick={onClick}
      sx={{
        mt: 0.5,
        fontSize: '0.75rem',
        fontWeight: 500,
        color: 'text.secondary',
        cursor: 'pointer',
        textAlign: 'center',
      }}
    >
      {label}
    </Typography>
  );

  return (
    <Box
      sx={{
        mb: 1,
        px: 1.5,
        py: 0.75,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      {expanded ? (
        // Full-width stacked sections — a long Over list next to a short Near
        // list would otherwise leave one column mostly empty.
        <Box>
          {groups.map((group, i) => (
            <Box key={group.title} sx={{ mt: i > 0 ? 1 : 0 }}>
              {groupHeader(group.title, group.items.length, group.tone)}
              {group.items.map((item) => itemRow(item, true))}
            </Box>
          ))}
        </Box>
      ) : (
        // Two compact columns so both groups are glanceable at once
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          {groups.map((group, i) => (
            <Fragment key={group.title}>
              {i > 0 && (
                <Box
                  sx={{ width: '1px', alignSelf: 'stretch', bgcolor: 'divider' }}
                />
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {groupHeader(group.title, group.items.length, group.tone)}
                {group.items
                  .slice(0, COLLAPSED_PER_COLUMN)
                  .map((item) => itemRow(item, false))}
              </Box>
            </Fragment>
          ))}
        </Box>
      )}

      {(overflow > 0 || expanded) &&
        footerLink(expanded ? 'Show less' : `Show ${overflow} more`, () =>
          setExpanded((v) => !v)
        )}

      {dismissed.length > 0 && (
        <>
          {footerLink(
            showDismissed
              ? 'Hide silenced'
              : `${dismissed.length} silenced this month`,
            () => setShowDismissed((v) => !v)
          )}
          {showDismissed && (
            <Box sx={{ mt: 0.5 }}>
              {dismissed.map((item) => (
                // Tapping anywhere brings it back — these rows exist only to be
                // undone, so they don't navigate the way live rows do.
                <Box
                  key={item.categoryId}
                  onClick={() => restore(item)}
                  sx={{
                    py: 0.375,
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 1,
                    cursor: 'pointer',
                    opacity: 0.6,
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
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      flexShrink: 0,
                    }}
                  >
                    <BudgetStatusInline status={item} variant="badge" />
                    <UndoIcon
                      sx={{ fontSize: 14, color: 'text.secondary' }}
                      aria-label={`Bring back ${item.name}`}
                    />
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

export default BudgetAttentionCue;
