import { useRef, useState } from 'react';
import { Box } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

// Swipe travel is measured against the row's own width, capped at these values.
// A full-width list row hits the caps, so those rows behave exactly as they did
// when these were the only numbers; a narrow row (the Home budget cue lays its
// items out in two columns) scales down instead of sliding most of itself off.
const MAX_THRESHOLD = 72;
const MAX_REVEAL = 96;
const THRESHOLD_RATIO = 0.35;
const REVEAL_RATIO = 0.5;
// Ignore tiny moves and decide the gesture axis only once it's clearly one way.
const AXIS_SLOP = 8;

/**
 * Mobile swipe-to-act wrapper for a single row. Swiping a row left past the
 * threshold fires `onSwipe` — one swipe, one action, as decided. Vertical
 * scrolling is untouched: `touch-action: pan-y` lets the browser own vertical
 * panning while we own horizontal, so no preventDefault gymnastics. The
 * coloured strip is revealed only while dragging, so at rest the row keeps its
 * own background (works on any surface).
 *
 * Touch-only by design — desktop rows pair this with a hover icon instead, so
 * it adds no behaviour on non-touch devices.
 *
 * Defaults to the delete look (red, trash), its first use; pass `icon` and
 * `color` for anything else.
 *
 * @param {() => void} onSwipe - called once when armed and released
 * @param {boolean} [disabled] - e.g. during multi-select
 * @param {React.ElementType} [icon] - revealed behind the row
 * @param {string} [color] - theme colour for the revealed strip
 * @param {React.ReactNode} children
 */
export default function SwipeAction({
  onSwipe,
  disabled,
  icon: Icon = DeleteOutlineIcon,
  color = 'error.main',
  children,
}) {
  const [dx, setDx] = useState(0);
  const start = useRef(null);
  const axis = useRef(null); // null (undecided) | 'h' | 'v'
  // Sized from the row at gesture start, before dx can move — so the values
  // read while rendering a drag are always the ones this drag began with.
  const geometry = useRef({ threshold: MAX_THRESHOLD, reveal: MAX_REVEAL });
  // A horizontal drag emits a trailing click; swallow that one so it doesn't
  // reach the row (which would fire whatever tapping the row does).
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
    const width = e.currentTarget.offsetWidth || 0;
    geometry.current = {
      threshold: Math.min(MAX_THRESHOLD, width * THRESHOLD_RATIO),
      reveal: Math.min(MAX_REVEAL, width * REVEAL_RATIO),
    };
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
    // Only left swipes (ddx < 0) reveal the action; clamp the travel.
    if (axis.current === 'h') {
      didSwipe.current = true;
      setDx(Math.max(-geometry.current.reveal, Math.min(0, ddx)));
    }
  };

  const onTouchEnd = () => {
    if (disabled) return;
    const armed = axis.current === 'h' && -dx >= geometry.current.threshold;
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

  const armed = -dx >= geometry.current.threshold;

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
            bgcolor: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            sx={{
              fontSize: 20,
              color: 'common.white',
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
