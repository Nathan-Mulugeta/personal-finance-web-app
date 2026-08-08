import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Box, IconButton, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
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

const COLLAPSED_SLOTS = 4;

/**
 * How the collapsed rows are shared between Over and Near.
 *
 * Over is served first, but never all the way: while Near has anything to show
 * it keeps at least one slot, because "what's about to go wrong" is the half
 * still worth acting on. Whatever one group can't fill goes to the other, so a
 * month with no over-budget categories gives Near all four rather than leaving
 * the space empty.
 */
function splitSlots(overCount, nearCount, total = COLLAPSED_SLOTS) {
  const reserved = nearCount > 0 ? 1 : 0;
  let overSlots = Math.min(overCount, total - reserved);
  const nearSlots = Math.min(nearCount, total - overSlots);
  // Hand back anything Near turned out not to need.
  overSlots = Math.min(overCount, total - nearSlots);
  return { overSlots, nearSlots };
}
// The heading's label sets the band; both it and the count centre against it,
// so they sit on one optical line whatever the font does with its line boxes.
const HEADER_BAND = 16;
// The count is deliberately shorter than that band. All-caps has no descenders,
// so its ink stops at the baseline, and a pill tall enough to fill the band
// hangs well below the letters — which is what read as the count sagging. At
// this height, centring it on the band lands within half a pixel of the caps'
// own centre, with no nudge to go stale on a different font.
const COUNT_SIZE = 13;
// The revealed strip behind a swiped row. Muting isn't destructive, so it reads
// as a neutral action rather than the red the delete swipe uses.
const MUTE_COLOR = 'text.secondary';
// Rows have to be opaque to cover the strip a swipe reveals behind them, so
// they carry a background of their own — and it has to be the surface the cue
// sits on, or the rows read as a lighter panel floating inside the card. The
// container sets the same value rather than staying transparent, so the two
// can't disagree wherever the cue is placed.
const CUE_SURFACE = 'background.default';

// sx can look up a palette path for a colour, but not for one it has to fade,
// so resolve "google.orange" to its value before handing it to alpha().
const paletteColor = (theme, path) =>
  path.split('.').reduce((node, key) => node?.[key], theme.palette);

/**
 * Home cue for this month's budgets: one list, worst first, a line per category
 * with the name left and the badge right — the rhythm the transaction rows below
 * already use, so the figures run down a single edge. Counts for Over and Near
 * head the list rather than splitting it into columns. Renders nothing when
 * everything is healthy. Tapping a category opens Reports pre-filtered to it.
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

  // One list, worst first. Splitting Over and Near into columns halved the width
  // every row had to work with, which forced each into two lines and left the
  // shorter column padding out the box with nothing. Merged, each category gets
  // a line of its own and the figures line up down a single edge — and the
  // badge already says which group a row is in, in colour and in wording
  // ("over 775.60 Br" against "305.01 Br left").
  const items = [...over, ...near];
  // Still render for dismissed-only, or the footer that hands them back would
  // disappear along with the last visible alert.
  if (items.length === 0 && dismissed.length === 0) return null;

  const { overSlots, nearSlots } = splitSlots(over.length, near.length);
  const visible = expanded
    ? items
    : [...over.slice(0, overSlots), ...near.slice(0, nearSlots)];
  const overflow = items.length - visible.length;

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

  // Label and count both centre inside HEADER_BAND, so the two sit on one
  // optical line by construction rather than by a nudge measured against one
  // machine's font rendering.
  const countChip = (title, count, tone) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.625, minWidth: 0 }}>
      <Typography
        noWrap
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          height: HEADER_BAND,
          fontSize: '0.6875rem',
          fontWeight: 700,
          lineHeight: 1,
          // Sentence case, so no letter-spacing — that's a device for holding
          // all-caps apart and it only loosens ordinary words.
          color: tone,
          minWidth: 0,
        }}
      >
        {title}
      </Typography>
      <Typography
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: COUNT_SIZE,
          minWidth: COUNT_SIZE,
          // "Over" and "Near" have no descender, so their ink rides half a
          // pixel above the middle of their own line box. The label is centred
          // in the band exactly; this lifts the pill off that centre and onto
          // the letters, which is the alignment the eye actually judges.
          mb: '1px',
          px: 0.5,
          fontSize: '0.625rem',
          fontWeight: 700,
          lineHeight: 1,
          borderRadius: '999px',
          color: tone,
          bgcolor: (theme) => alpha(paletteColor(theme, tone), 0.16),
          flexShrink: 0,
        }}
      >
        {count}
      </Typography>
    </Box>
  );

  // Name left, badge right — the rhythm the transaction rows below already use.
  const itemRow = (item) => (
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
          bgcolor: CUE_SURFACE,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 1,
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
          sx={{ flexShrink: 0 }}
        />
        {/* Desktop counterpart to the swipe. Absolutely positioned so it costs
            the row no width, and only paints on hover. */}
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
            bgcolor: CUE_SURFACE,
            '&:hover': { color: 'text.primary', bgcolor: CUE_SURFACE },
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
        bgcolor: CUE_SURFACE,
      }}
    >
      {items.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 0.625 }}>
          {over.length > 0 &&
            countChip('Over', over.length, BUDGET_OVER_COLOR)}
          {near.length > 0 &&
            countChip('Near', near.length, BUDGET_NEAR_COLOR)}
        </Box>
      )}
      {visible.map((item) => itemRow(item))}

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
