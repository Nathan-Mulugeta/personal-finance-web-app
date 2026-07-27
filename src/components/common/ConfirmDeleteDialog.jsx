import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

/**
 * The shared destructive-confirm modal — round red icon badge, title, subtext,
 * Cancel / Delete. Used for both single-row and bulk transaction deletes so
 * they look and behave identically (and can't drift).
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {() => void} onConfirm
 * @param {string} title - e.g. "Delete this transaction?"
 * @param {string} [description]
 * @param {string} [confirmLabel]
 * @param {boolean} [isDeleting]
 * @param {string|null} [error]
 */
export default function ConfirmDeleteDialog({
  open,
  onClose,
  onConfirm,
  title,
  description = "This can't be undone.",
  confirmLabel = 'Delete',
  isDeleting = false,
  error = null,
}) {
  return (
    <Dialog
      open={open}
      onClose={() => !isDeleting && onClose()}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogContent sx={{ textAlign: 'center', pt: 3.5, pb: 1 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>
            {error}
          </Alert>
        )}
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            bgcolor: 'error.light',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
          }}
        >
          <DeleteOutlineIcon sx={{ fontSize: 28, color: 'error.main' }} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, pt: 1, gap: 1.5 }}>
        <Button
          fullWidth
          variant="outlined"
          onClick={onClose}
          disabled={isDeleting}
          sx={{ textTransform: 'none', py: 1 }}
        >
          Cancel
        </Button>
        <Button
          fullWidth
          color="error"
          variant="contained"
          onClick={onConfirm}
          disabled={isDeleting}
          startIcon={
            isDeleting ? <CircularProgress size={18} color="inherit" /> : null
          }
          sx={{ textTransform: 'none', py: 1 }}
        >
          {isDeleting ? 'Deleting…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
