import { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormHelperText,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { format } from 'date-fns';
import {
  updateTransaction,
  deleteTransaction,
} from '../../store/slices/transactionsSlice';
import { transactionSchema } from '../../schemas/transactionSchema';
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from '../../lib/api/transactions';
import CategoryAutocomplete from './CategoryAutocomplete';
import AccountAutocomplete from './AccountAutocomplete';
import { flattenCategoryTree } from '../../utils/categoryHierarchy';
import { useKeyboardAwareHeight } from '../../hooks/useKeyboardAwareHeight';

/**
 * Reusable Edit Transaction Dialog component.
 * Used for editing existing transactions from anywhere in the app.
 * 
 * @param {Object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onClose - Callback when the dialog should close
 * @param {Object} props.transaction - The transaction object to edit
 */
function EditTransactionDialog({ open, onClose, transaction }) {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { keyboardVisible, keyboardHeight } = useKeyboardAwareHeight();

  const { accounts } = useSelector((state) => state.accounts);
  const { categories } = useSelector((state) => state.categories);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const amountInputRef = useRef(null);
  const categoryInputRef = useRef(null); // Ref for Category field focus chaining
  const initializedTransactionIdRef = useRef(null); // Track which transaction has been initialized to prevent refresh reset

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      accountId: '',
      categoryId: '',
      amount: '',
      currency: '',
      description: '',
      type: 'Expense',
      status: 'Cleared',
      date: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const watchedAccountId = watch('accountId');
  const watchedCategoryId = watch('categoryId');
  const watchedType = watch('type');
  const watchedStatus = watch('status');

  // Reset form when dialog opens with transaction data (only once per transaction to prevent background refresh from resetting form data)
  useEffect(() => {
    const transactionId = transaction?.transaction_id;
    
    if (open && transaction && initializedTransactionIdRef.current !== transactionId) {
      initializedTransactionIdRef.current = transactionId;
      // Format date for HTML date input (YYYY-MM-DD) - the date field now stores full datetime
      const dateForInput = transaction.date 
        ? format(new Date(transaction.date), 'yyyy-MM-dd')
        : format(new Date(), 'yyyy-MM-dd');
      reset({
        accountId: transaction.account_id,
        categoryId: transaction.category_id,
        amount: transaction.amount,
        currency: transaction.currency,
        description: transaction.description || '',
        type: transaction.type,
        status: transaction.status,
        date: dateForInput,
      });

      setActionError(null);
      setIsSubmitting(false);
      setDeleteError(null);
      setIsDeleting(false);
      setDeleteConfirmOpen(false);

      // Focus amount field after a short delay to ensure the dialog is rendered
      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 100);
    }
    
    // Reset the initialization flag when dialog closes
    if (!open) {
      initializedTransactionIdRef.current = null;
    }
  }, [open, transaction, reset]);

  // Auto-set currency when account is selected
  useEffect(() => {
    if (watchedAccountId) {
      const account = accounts.find((acc) => acc.account_id === watchedAccountId);
      if (account) {
        setValue('currency', account.currency);
      }
    }
  }, [watchedAccountId, accounts, setValue]);

  // Filter categories by type and flatten with hierarchy
  const getFilteredCategories = () => {
    if (!watchedType) return flattenCategoryTree(categories);
    let filtered;
    if (watchedType === 'Income') {
      filtered = categories.filter((cat) => cat.type === 'Income');
    } else if (watchedType === 'Expense') {
      filtered = categories.filter((cat) => cat.type === 'Expense');
    } else {
      filtered = categories;
    }
    return flattenCategoryTree(filtered);
  };

  const handleClose = () => {
    setActionError(null);
    setIsSubmitting(false);
    setDeleteError(null);
    setIsDeleting(false);
    setDeleteConfirmOpen(false);
    reset();
    onClose();
  };

  const onSubmit = async (data) => {
    if (!transaction) return;

    setIsSubmitting(true);
    setActionError(null);
    try {
      await dispatch(
        updateTransaction({
          transactionId: transaction.transaction_id,
          updates: data,
        })
      ).unwrap();

      handleClose();
    } catch (err) {
      console.error('Error updating transaction:', err);
      const errorMessage =
        err?.message || 'Failed to update transaction. Please try again.';
      setActionError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = () => {
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!transaction) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await dispatch(deleteTransaction(transaction.transaction_id)).unwrap();

      setDeleteConfirmOpen(false);
      handleClose();
    } catch (err) {
      console.error('Error deleting transaction:', err);
      const errorMessage =
        err?.message || 'Failed to delete transaction. Please try again.';
      setDeleteError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setDeleteError(null);
  };

  if (!transaction) return null;

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
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
      >
        <form
          onSubmit={handleSubmit(onSubmit)}
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
            Edit Transaction
          </DialogTitle>
          <DialogContent
            sx={{
              flexGrow: 1,
              overflow: 'auto',
              pt: { xs: 1, sm: 2 },
              pb: 2,
            }}
          >
            {actionError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {actionError}
              </Alert>
            )}
            <Grid
              container
              spacing={{ xs: 1.5, sm: 2 }}
              sx={{ mt: { xs: 0.5, sm: 1 } }}
            >
              <Grid item xs={12} sm={6}>
                <AccountAutocomplete
                  accounts={accounts}
                  value={watchedAccountId || ''}
                  onChange={(id) => setValue('accountId', id)}
                  label="Account"
                  error={!!errors.accountId}
                  helperText={errors.accountId?.message}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!errors.type}>
                  <InputLabel>Type *</InputLabel>
                  <Select
                    {...register('type')}
                    label="Type *"
                    value={watchedType || ''}
                    onChange={(e) => setValue('type', e.target.value)}
                  >
                    {TRANSACTION_TYPES.filter(
                      (t) => !t.includes('Transfer')
                    ).map((type) => (
                      <MenuItem key={type} value={type}>
                        {type}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.type && (
                    <FormHelperText>{errors.type.message}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <CategoryAutocomplete
                  categories={getFilteredCategories()}
                  value={watchedCategoryId || ''}
                  onChange={(id) => setValue('categoryId', id)}
                  onSelect={() => {
                    // Focus Amount field after category selection
                    setTimeout(() => {
                      amountInputRef.current?.focus();
                    }, 50);
                  }}
                  label="Category *"
                  error={!!errors.categoryId}
                  helperText={
                    errors.categoryId?.message ||
                    (!watchedType
                      ? 'Please select a transaction type first'
                      : undefined)
                  }
                  disabled={!watchedType}
                  inputRef={categoryInputRef}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="date"
                  label="Date *"
                  {...register('date')}
                  error={!!errors.date}
                  helperText={errors.date?.message}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Amount *"
                  {...register('amount', { valueAsNumber: true })}
                  inputRef={amountInputRef}
                  error={!!errors.amount}
                  helperText={errors.amount?.message}
                  inputProps={{ step: '0.01', min: '0.01' }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Currency"
                  {...register('currency')}
                  error={!!errors.currency}
                  helperText={
                    errors.currency?.message ||
                    'Auto-filled from account selection'
                  }
                  disabled
                  InputLabelProps={{
                    shrink: !!watch('currency'),
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Description"
                  {...register('description')}
                  error={!!errors.description}
                  helperText={errors.description?.message}
                  multiline
                  rows={2}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!errors.status}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    {...register('status')}
                    label="Status"
                    value={watchedStatus || ''}
                    onChange={(e) => setValue('status', e.target.value)}
                  >
                    {TRANSACTION_STATUSES.map((status) => (
                      <MenuItem key={status} value={status}>
                        {status}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.status && (
                    <FormHelperText>{errors.status.message}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
            </Grid>
          </DialogContent>
          {/* Button Bar - Delete | Cancel | Update on same line */}
          <Box
            sx={{
              flexShrink: 0,
              p: { xs: 1.5, sm: 2 },
              display: 'flex',
              gap: 1,
              borderTop: '1px solid',
              borderColor: 'divider',
              backgroundColor: 'background.paper',
            }}
          >
            <Button
              onClick={handleDeleteClick}
              color="error"
              disabled={isSubmitting}
              startIcon={<DeleteIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />}
              sx={{
                textTransform: 'none',
                flex: 1,
              }}
            >
              Delete
            </Button>
            <Button
              onClick={handleClose}
              disabled={isSubmitting}
              sx={{
                textTransform: 'none',
                flex: 1,
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting}
              startIcon={
                isSubmitting ? (
                  <CircularProgress size={16} color="inherit" />
                ) : null
              }
              sx={{
                textTransform: 'none',
                flex: 1,
              }}
            >
              {isSubmitting ? 'Updating...' : 'Update'}
            </Button>
          </Box>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog - Popup Modal */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleDeleteCancel}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            p: 1,
          },
        }}
      >
        <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
          Delete Transaction?
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center', pb: 2 }}>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            This action cannot be undone.
            {transaction?.type?.includes('Transfer') && (
              <> Both transfer transactions will be deleted.</>
            )}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', gap: 2, px: 3, pb: 3 }}>
          <Button
            onClick={handleDeleteCancel}
            disabled={isDeleting}
            variant="outlined"
            size="large"
            sx={{
              textTransform: 'none',
              minWidth: 120,
              py: 1.5,
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={isDeleting}
            size="large"
            startIcon={
              isDeleting ? <CircularProgress size={20} color="inherit" /> : null
            }
            sx={{
              textTransform: 'none',
              minWidth: 120,
              py: 1.5,
            }}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default EditTransactionDialog;

