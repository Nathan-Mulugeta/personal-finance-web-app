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
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { bulkUpdateTransactions } from '../../store/slices/transactionsSlice';
import { TRANSACTION_STATUSES } from '../../lib/api/transactions';
import { flattenCategoryTree } from '../../utils/categoryHierarchy';
import CategoryAutocomplete from './CategoryAutocomplete';

// Non-transfer transactions can only be Income or Expense (transfers are
// excluded from bulk edit by the caller)
const BULK_TYPES = ['Income', 'Expense'];

/**
 * Apply the same field changes to many transactions at once — any field an
 * update supports (account, category, type, amount, date, description, status)
 * can be set, and only the fields the user fills are applied. Transfers can't
 * be bulk-edited and are skipped by the caller (transferCount is shown).
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
  const { accounts } = useSelector((state) => state.accounts);

  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    if (open) {
      setAccountId('');
      setCategoryId('');
      setType('');
      setAmount('');
      setDate('');
      setDescription('');
      setStatus('');
      setActionError(null);
      setIsSubmitting(false);
    }
  }, [open]);

  const count = transactionIds.length;
  const amountValid = amount !== '' && !Number.isNaN(parseFloat(amount));
  const hasChanges =
    !!accountId ||
    !!categoryId ||
    !!type ||
    amountValid ||
    !!date ||
    description !== '' ||
    !!status;

  const handleApply = async () => {
    if (!hasChanges || count === 0) return;

    const updates = {};
    if (accountId) {
      updates.accountId = accountId;
      // Keep currency in step with the account so validation passes
      const acc = accounts.find((a) => a.account_id === accountId);
      if (acc) updates.currency = acc.currency;
    }
    if (categoryId) updates.categoryId = categoryId;
    if (type) updates.type = type;
    if (amountValid) updates.amount = parseFloat(amount);
    if (date) updates.date = date;
    if (description !== '') updates.description = description;
    if (status) updates.status = status;

    setIsSubmitting(true);
    setActionError(null);
    try {
      const result = await dispatch(
        bulkUpdateTransactions({ transactionIds, updates })
      ).unwrap();

      const failed = result?.failed?.length || 0;
      if (failed > 0) {
        // Some rows updated, some didn't (e.g. a value that isn't valid for
        // them) — keep the dialog open so the partial result is visible
        setActionError(
          `${failed} of ${count} couldn't be updated (some values may not be valid for them, e.g. a currency that doesn't match the account).`
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
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            onClose={() => setActionError(null)}
          >
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
          <FormControl fullWidth>
            <InputLabel>Move to account</InputLabel>
            <Select
              value={accountId}
              label="Move to account"
              onChange={(e) => setAccountId(e.target.value)}
            >
              <MenuItem value="">
                <em>Leave unchanged</em>
              </MenuItem>
              {accounts
                .filter((a) => a.status === 'Active')
                .map((a) => (
                  <MenuItem key={a.account_id} value={a.account_id}>
                    {a.name} ({a.currency})
                  </MenuItem>
                ))}
            </Select>
          </FormControl>

          <CategoryAutocomplete
            categories={flattenCategoryTree(categories)}
            leafOnly
            value={categoryId}
            onChange={(id) => setCategoryId(id || '')}
            label="Move to category"
          />

          <FormControl fullWidth>
            <InputLabel>Set type</InputLabel>
            <Select
              value={type}
              label="Set type"
              onChange={(e) => setType(e.target.value)}
            >
              <MenuItem value="">
                <em>Leave unchanged</em>
              </MenuItem>
              {BULK_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Set amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputProps={{ step: 'any', min: 0 }}
            placeholder="Leave unchanged"
            fullWidth
          />

          <TextField
            label="Set date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />

          <TextField
            label="Set description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Leave unchanged"
            fullWidth
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
