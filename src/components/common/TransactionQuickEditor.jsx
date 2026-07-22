import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Button,
  CircularProgress,
  Drawer,
  Popover,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { updateTransaction } from '../../store/slices/transactionsSlice';
import { flattenCategoryTree } from '../../utils/categoryHierarchy';
import CategoryAutocomplete from './CategoryAutocomplete';

/**
 * Row-level state for the quick editor. `open(field)` returns a click handler
 * that stops row propagation (so the full-edit row click doesn't also fire) and
 * anchors the popover to the tapped element. Spread nothing — wire the returned
 * pieces onto a single <TransactionQuickEditor/> per row.
 */
export function useTransactionQuickEdit() {
  const [state, setState] = useState(null); // { field, anchorEl, transaction }
  // `transaction` is optional — per-row callers pass the row's transaction
  // straight to <TransactionQuickEditor>; a shared component-level editor (e.g.
  // an inline table) passes it here so state.transaction identifies the row.
  const open = useCallback(
    (field, transaction) => (event) => {
      event.stopPropagation();
      setState({ field, anchorEl: event.currentTarget, transaction });
    },
    []
  );
  const close = useCallback(() => setState(null), []);
  return { state, open, close };
}

/**
 * In-place editor for a single transaction field (category, amount or
 * description), shared by every transaction list. Renders as a bottom sheet on
 * mobile and a small popover on desktop. Success/error toasts come from the
 * notifications middleware on updateTransaction, so this only handles the
 * form + dispatch. Not for transfers (their amount/category span two legs) —
 * callers gate that by not opening this for transfer rows.
 *
 * @param {Object} transaction - the row transaction
 * @param {'category'|'amount'|'description'|null} field - which field to edit
 * @param {HTMLElement|null} anchorEl - element to anchor the desktop popover to
 * @param {boolean} open
 * @param {Function} onClose
 */
function TransactionQuickEditor({ transaction, field, anchorEl, open, onClose }) {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { categories } = useSelector((state) => state.categories);

  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Seed the field value each time the editor opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (field === 'amount') {
      setValue(String(Math.abs(parseFloat(transaction?.amount || 0)) || ''));
    } else if (field === 'description') {
      setValue(transaction?.description || '');
    }
  }, [open, field, transaction]);

  // Type-scoped, indented, leaf-only category options (matches the create modal)
  const categoryOptions = useMemo(() => {
    const type = transaction?.type;
    const filtered = categories.filter(
      (cat) =>
        cat.status === 'Active' && (type ? cat.type === type : true)
    );
    return flattenCategoryTree(filtered);
  }, [categories, transaction?.type]);

  const apply = async (updates) => {
    setSubmitting(true);
    setError(null);
    try {
      await dispatch(
        updateTransaction({
          transactionId: transaction.transaction_id,
          updates,
        })
      ).unwrap();
      onClose();
    } catch (err) {
      // The middleware also toasts this; keep the sheet open with the reason
      setError(typeof err === 'string' ? err : err?.message || 'Update failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCategory = (categoryId) => {
    // Only act on an actual pick. Clearing the field (the × button or backspace)
    // must keep the sheet open so the user can search and choose a new one —
    // clearing is a normal step, not a cancel.
    if (categoryId && categoryId !== transaction.category_id) {
      apply({ categoryId });
    }
  };

  const handleAmountSave = () => {
    const num = parseFloat(value);
    if (Number.isNaN(num) || num <= 0) {
      setError('Enter an amount greater than 0');
      return;
    }
    if (num === Math.abs(parseFloat(transaction.amount || 0))) {
      onClose();
      return;
    }
    apply({ amount: num });
  };

  const handleDescriptionSave = () => {
    const next = value.trim();
    if (next === (transaction.description || '')) {
      onClose();
      return;
    }
    apply({ description: next });
  };

  const title =
    field === 'category'
      ? 'Change category'
      : field === 'amount'
      ? 'Edit amount'
      : field === 'description'
      ? 'Edit note'
      : '';

  const body = (
    <Box
      sx={{
        p: 2,
        width: isMobile ? 'auto' : 320,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Typography variant="subtitle2" color="text.secondary">
        {title}
      </Typography>

      {field === 'category' && (
        <CategoryAutocomplete
          categories={categoryOptions}
          leafOnly
          value={transaction.category_id}
          onChange={handleCategory}
          label="Category"
          autoFocus
          openOnFocus
          // The options popper must sit above the sheet/popover it opens inside
          slotProps={{
            popper: { sx: { zIndex: (theme) => theme.zIndex.modal + 3 } },
          }}
        />
      )}

      {field === 'amount' && (
        <>
          <TextField
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAmountSave()}
            type="number"
            label={`Amount (${transaction.currency || ''})`}
            inputProps={{ step: 'any', min: 0, inputMode: 'decimal' }}
            autoFocus
            fullWidth
          />
          <Button
            variant="contained"
            onClick={handleAmountSave}
            disabled={submitting}
            startIcon={
              submitting ? <CircularProgress size={16} color="inherit" /> : null
            }
          >
            Save
          </Button>
        </>
      )}

      {field === 'description' && (
        <>
          <TextField
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDescriptionSave()}
            label="Note"
            placeholder="Add a note"
            autoFocus
            fullWidth
            multiline
            maxRows={3}
          />
          <Button
            variant="contained"
            onClick={handleDescriptionSave}
            disabled={submitting}
            startIcon={
              submitting ? <CircularProgress size={16} color="inherit" /> : null
            }
          >
            Save
          </Button>
        </>
      )}

      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
    </Box>
  );

  if (isMobile) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        // Sit above the Reports drill-down Dialog (both default to zIndex.modal),
        // otherwise the sheet opens hidden behind that modal
        sx={{ zIndex: (theme) => theme.zIndex.modal + 2 }}
        PaperProps={{
          sx: { borderTopLeftRadius: 12, borderTopRightRadius: 12, pb: 2 },
        }}
      >
        {body}
      </Drawer>
    );
  }

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      sx={{ zIndex: (theme) => theme.zIndex.modal + 2 }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
    >
      {body}
    </Popover>
  );
}

export default TransactionQuickEditor;
