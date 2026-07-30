import { useRef, useState, useEffect, useCallback } from 'react';
import { Box, IconButton } from '@mui/material';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

// How far (px) a left-swipe must travel to snap open.
const THRESHOLD = 48;
// Width of the revealed reorder strip.
const REVEAL_WIDTH = 80;
// Ignore tiny moves and decide the gesture axis only once.
const AXIS_SLOP = 8;

/**
 * Mobile swipe-to-reorder wrapper. Swiping left reveals up/down arrows that
 * stay visible until the user taps outside or swipes the row back. Only fires
 * on touch devices; on desktop this is a transparent pass-through.
 *
 * @param {() => void} onMoveUp   - called when the up arrow is tapped
 * @param {() => void} onMoveDown - called when the down arrow is tapped
 * @param {boolean} [disableUp]   - grey out the up arrow
 * @param {boolean} [disableDown] - grey out the down arrow
 * @param {boolean} [disabled]    - disable the whole gesture
 * @param {React.ReactNode} children
 */
export default function SwipeToReorder({
  onMoveUp,
  onMoveDown,
  disableUp,
  disableDown,
  disabled,
  children,
}) {
  // `open` means the reorder strip is snapped into view.
  const [open, setOpen] = useState(false);
  // `dx` tracks live drag offset during touch (0 when not dragging).
  const [dx, setDx] = useState(0);
  const start = useRef(null);
  const axis = useRef(null);
  const didSwipe = useRef(false);
  const containerRef = useRef(null);

  // Close when the user taps outside this row.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('touchstart', handler, true);
    return () => document.removeEventListener('touchstart', handler, true);
  }, [open]);

  const reset = useCallback(() => {
    setDx(0);
    start.current = null;
    axis.current = null;
  }, []);

  const onTouchStart = (e) => {
    if (disabled) return;
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    axis.current = null;
  };

  const onTouchMove = (e) => {
    if (disabled || !start.current) return;
    const t = e.touches[0];
    const ddx = t.clientX - start.current.x;
    const ddy = t.clientY - start.current.y;
    if (!axis.current) {
      if (Math.abs(ddx) > AXIS_SLOP || Math.abs(ddy) > AXIS_SLOP) {
        axis.current = Math.abs(ddx) > Math.abs(ddy) ? 'h' : 'v';
      }
    }
    if (axis.current === 'h') {
      didSwipe.current = true;
      if (open) {
        // Already open — allow swiping right to close.
        setDx(Math.max(0, Math.min(REVEAL_WIDTH, ddx)));
      } else {
        // Closed — allow swiping left to open.
        setDx(Math.max(-REVEAL_WIDTH, Math.min(0, ddx)));
      }
    }
  };

  const onTouchEnd = () => {
    if (disabled) return;
    if (axis.current === 'h') {
      if (open) {
        // If swiped right past threshold, close.
        setOpen(dx >= THRESHOLD);
      } else {
        // If swiped left past threshold, open.
        setOpen(-dx >= THRESHOLD);
      }
    }
    reset();
  };

  const onClickCapture = (e) => {
    if (didSwipe.current) {
      e.stopPropagation();
      e.preventDefault();
      didSwipe.current = false;
    }
  };

  // Effective translateX: when open, the row is shifted left by REVEAL_WIDTH.
  // During a drag we overlay the live `dx` on top of the snap state.
  const effectiveDx = open ? -REVEAL_WIDTH + dx : dx;

  return (
    <Box
      ref={containerRef}
      sx={{ position: 'relative', overflow: 'hidden', touchAction: 'pan-y' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={reset}
      onClickCapture={onClickCapture}
    >
      {/* Reorder strip behind the row */}
      {(effectiveDx < 0 || open) && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: `${REVEAL_WIDTH}px`,
            bgcolor: 'action.hover',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
          }}
        >
          <IconButton
            size="small"
            disabled={disableUp}
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp?.();
            }}
            sx={{ p: 0.5, color: disableUp ? 'text.disabled' : 'text.primary' }}
          >
            <KeyboardArrowUpIcon sx={{ fontSize: '1.25rem' }} />
          </IconButton>
          <IconButton
            size="small"
            disabled={disableDown}
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown?.();
            }}
            sx={{ p: 0.5, color: disableDown ? 'text.disabled' : 'text.primary' }}
          >
            <KeyboardArrowDownIcon sx={{ fontSize: '1.25rem' }} />
          </IconButton>
        </Box>
      )}
      <Box
        sx={{
          transform: `translateX(${effectiveDx}px)`,
          transition: dx === 0 ? 'transform 0.2s ease' : 'none',
          bgcolor: 'background.paper',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
