import {
  Dialog,
  DialogTitle,
  DialogContent,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useKeyboardAwareHeight } from '../../hooks/useKeyboardAwareHeight';

/**
 * Shared shell for the app's form dialogs. Consolidates the scaffolding that the
 * add/edit form dialogs each hand-rolled identically:
 *   - full-screen on mobile, centered card on desktop
 *   - keyboard-aware: on mobile the whole thing is a flex column and the bottom
 *     padding lifts the sticky footer above the on-screen keyboard
 *   - a `<form onSubmit>` wrapper, a fixed title, a scrollable content area, and
 *     a `footer` slot (each caller passes its own footer bar, since their button
 *     layouts differ)
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {React.ReactNode} title
 * @param {React.ReactNode} children - the scrollable content (fields, alerts…)
 * @param {React.ReactNode} [footer] - the sticky footer bar (caller-styled)
 * @param {(e) => void} [onSubmit] - form submit handler
 * @param {string} [maxWidth]
 * @param {object} [contentSx] - extra sx for the DialogContent (e.g. padding)
 */
export default function AppDialog({
  open,
  onClose,
  title,
  children,
  footer,
  onSubmit,
  maxWidth = 'sm',
  contentSx,
  ...dialogProps
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { keyboardVisible, keyboardHeight } = useKeyboardAwareHeight();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: isMobile
          ? {
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              maxHeight: '100%',
            }
          : {},
      }}
      {...dialogProps}
    >
      <form
        onSubmit={onSubmit}
        style={
          isMobile
            ? {
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
                paddingBottom: keyboardVisible ? `${keyboardHeight}px` : 0,
              }
            : {}
        }
      >
        <DialogTitle sx={{ flexShrink: 0, pb: { xs: 1, sm: 2 } }}>
          {title}
        </DialogTitle>
        <DialogContent sx={[{ flexGrow: 1, overflow: 'auto' }, contentSx]}>
          {children}
        </DialogContent>
        {footer}
      </form>
    </Dialog>
  );
}
