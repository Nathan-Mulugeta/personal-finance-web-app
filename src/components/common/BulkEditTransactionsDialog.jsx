import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { bulkUpdateTransactions } from '../../store/slices/transactionsSlice';
import { TRANSACTION_STATUSES } from '../../lib/api/transactions';
import CategoryAutocomplete from './CategoryAutocomplete';

/**
 * Apply the same field changes to many transactions at once — headline use
 * is moving a batch of transactions to a new category. Only the fields the
 * user sets are applied; transfers can't be bulk-edited and are skipped by
 * the caller (transferCount is shown for transparency).
 *
 * @param {boolean} open
 * @param {Function} onClose
 * @param {string[]} transactionIds - plain transaction ids (no transfers)
 * @param {number} transferCount - transfers in the selection, skipped
 */
function BulkEditTransactionsDialog({
  open,
  onClose,
  onApplied,
  transactionIds = [],
  transferCount = 0,
}) {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { categories } = useSelector((state) => state.categories);

  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    if (open) {
      setCategoryId('');
      setStatus('');
      setActionError(null);
      setIsSubmitting(false);
    }
  }, [open]);

  const count = transactionIds.length;
  const hasChanges = !!categoryId || !!status;

  const handleApply = async () => {
    if (!hasChanges || count === 0) return;

    const updates = {};
    if (categoryId) updates.categoryId = categoryId;
    if (status) updates.status = status;

    setIsSubmitting(true);
    setActionError(null);
    try {
      const result = await dispatch(
        bulkUpdateTransactions({ transactionIds, updates })
      ).unwrap();

      const failed = result?.failed?.length || 0;
      if (failed > 0) {
        // Some rows updated, some didn't (e.g. category/currency mismatch) —
        // keep the dialog open so the partial result is visible
        setActionError(
          `${failed} of ${count} couldn't be updated (they may not match the new category or account currency).`
        );
      } else {
        onApplied?.();
        onClose();
      }
    } catch (err) {
      setActionError(
        err?.message || 'Failed to update transactions. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={isSubmitting ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>
        Edit {count} transaction{count !== 1 ? 's' : ''}
      </DialogTitle>
      <DialogContent>
        {transferCount > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {transferCount} transfer{transferCount !== 1 ? 's' : ''} in your
            selection can&apos;t be bulk-edited and will be left unchanged.
          </Alert>
        )}
        {actionError && (
          <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
            {actionError}
          </Alert>
        )}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 2, fontSize: '0.8125rem' }}
        >
          Set only the fields you want to change. Empty fields are left as they
          are.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 0.5 }}>
          <CategoryAutocomplete
            categories={categories}
            value={categoryId}
            onChange={(id) => setCategoryId(id || '')}
            label="Move to category"
          />
          <FormControl fullWidth>
            <InputLabel>Set status</InputLabel>
            <Select
              value={status}
              label="Set status"
              onChange={(e) => setStatus(e.target.value)}
            >
              <MenuItem value="">
                <em>Leave unchanged</em>
              </MenuItem>
              {TRANSACTION_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleApply}
          disabled={isSubmitting || !hasChanges || count === 0}
          startIcon={
            isSubmitting ? <CircularProgress size={20} color="inherit" /> : null
          }
        >
          {isSubmitting ? 'Applying...' : 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default BulkEditTransactionsDialog;
