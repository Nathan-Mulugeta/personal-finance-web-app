import { useRef, useState } from 'react';
import { Box } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

// How far (px) a left-swipe must travel to arm the delete, and how far the row
// is allowed to slide while dragging.
const THRESHOLD = 72;
const MAX_REVEAL = 96;
// Ignore tiny moves and decide the gesture axis only once it's clearly one way.
const AXIS_SLOP = 8;

/**
 * Mobile swipe-to-delete wrapper for a single row. Swiping a row left past the
 * threshold fires `onSwipe` (which opens the delete confirmation) — one swipe,
 * one confirm, as decided. Vertical scrolling is untouched: `touch-action:
 * pan-y` lets the browser own vertical panning while we own horizontal, so no
 * preventDefault gymnastics. A red trash strip is revealed only while dragging,
 * so at rest the row keeps its own background (works on any surface).
 *
 * Touch-only by design — desktop uses a hover delete icon instead, so this adds
 * no behaviour on non-touch devices.
 *
 * @param {() => void} onSwipe - called once when armed and released
 * @param {boolean} [disabled] - e.g. during multi-select
 * @param {React.ReactNode} children
 */
export default function SwipeToDelete({ onSwipe, disabled, children }) {
  const [dx, setDx] = useState(0);
  const start = useRef(null);
  const axis = useRef(null); // null (undecided) | 'h' | 'v'
  // A horizontal drag emits a trailing click; swallow that one so it doesn't
  // reach the row (which would open the editor behind the confirm modal).
  const didSwipe = useRef(false);

  const reset = () => {
    setDx(0);
    start.current = null;
    axis.current = null;
  };

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
    // Only left swipes (ddx < 0) reveal the delete; clamp the travel.
    if (axis.current === 'h') {
      didSwipe.current = true;
      setDx(Math.max(-MAX_REVEAL, Math.min(0, ddx)));
    }
  };

  const onTouchEnd = () => {
    if (disabled) return;
    const armed = axis.current === 'h' && -dx >= THRESHOLD;
    reset();
    if (armed) onSwipe?.();
  };

  const onClickCapture = (e) => {
    if (didSwipe.current) {
      e.stopPropagation();
      e.preventDefault();
      didSwipe.current = false;
    }
  };

  const armed = -dx >= THRESHOLD;

  return (
    <Box
      sx={{ position: 'relative', overflow: 'hidden', touchAction: 'pan-y' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={reset}
      onClickCapture={onClickCapture}
    >
      {dx < 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: `${-dx}px`,
            bgcolor: 'error.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <DeleteOutlineIcon
            sx={{
              fontSize: 20,
              color: 'error.contrastText',
              opacity: armed ? 1 : 0.65,
            }}
          />
        </Box>
      )}
      <Box
        sx={{
          transform: `translateX(${dx}px)`,
          transition: dx === 0 ? 'transform 0.2s ease' : 'none',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
