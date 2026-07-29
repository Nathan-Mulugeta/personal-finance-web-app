import { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, CircularProgress } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { format } from 'date-fns';
import {
  updateTransaction,
  deleteTransaction,
} from '../../store/slices/transactionsSlice';
import { transactionSchema } from '../../schemas/transactionSchema';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import AppDialog from './AppDialog';
import TransactionFormFields from './TransactionFormFields';

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
      <AppDialog
        open={open}
        onClose={handleClose}
        title="Edit Transaction"
        onSubmit={handleSubmit(onSubmit)}
        contentSx={{ pt: { xs: 1, sm: 2 }, pb: 2 }}
        footer={
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
              sx={{ textTransform: 'none', flex: 1 }}
            >
              Delete
            </Button>
            <Button
              onClick={handleClose}
              disabled={isSubmitting}
              sx={{ textTransform: 'none', flex: 1 }}
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
              sx={{ textTransform: 'none', flex: 1 }}
            >
              {isSubmitting ? 'Updating...' : 'Update'}
            </Button>
          </Box>
        }
      >
            {actionError && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
                {actionError}
              </Alert>
            )}
            <TransactionFormFields
              register={register}
              setValue={setValue}
              watch={watch}
              errors={errors}
              accounts={accounts}
              categories={categories}
              amountInputRef={amountInputRef}
              categoryInputRef={categoryInputRef}
              excludeTransactionId={transaction?.transaction_id}
            />
      </AppDialog>

      {/* Delete confirmation — shared destructive-confirm modal */}
      <ConfirmDeleteDialog
        open={deleteConfirmOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Transaction?"
        description={
          transaction?.type?.includes('Transfer')
            ? "This can't be undone. Both transfer transactions will be deleted."
            : "This can't be undone."
        }
        isDeleting={isDeleting}
        error={deleteError}
      />
    </>
  );
}

export default EditTransactionDialog;

