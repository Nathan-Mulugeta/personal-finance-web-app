import { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, CircularProgress } from '@mui/material';
import { format } from 'date-fns';
import { createTransaction } from '../../store/slices/transactionsSlice';
import { transactionSchema } from '../../schemas/transactionSchema';
import AppDialog from './AppDialog';
import TransactionFormFields from './TransactionFormFields';
import { useAutoDismissError } from '../../hooks/useAutoDismissError';

/**
 * Global Add Transaction Dialog component.
 * Used for quickly adding transactions from anywhere in the app.
 */
function AddTransactionDialog({ open, onClose, initialValues = null }) {
  const dispatch = useDispatch();

  const { accounts } = useSelector((state) => state.accounts);
  const { categories } = useSelector((state) => state.categories);
  const { settings } = useSelector((state) => state.settings);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  
  // Auto-dismiss error after 8 seconds
  useAutoDismissError(setActionError, actionError);
  
  const amountInputRef = useRef(null); // Ref for Amount field focus chaining
  const categoryInputRef = useRef(null); // Ref for Category field focus chaining
  const hasInitializedRef = useRef(false); // Guard to prevent form reset during background refresh
  const isSubmittingRef = useRef(false); // Synchronous guard to prevent double submissions

  // Get default account from settings
  const getDefaultAccountId = () => {
    const defaultAccountSetting = settings.find(
      (s) => s.setting_key === 'DefaultAccountID'
    );
    const defaultAccountId = defaultAccountSetting?.setting_value || '';
    // Verify the account exists and is active
    const accountExists = accounts.find(
      (acc) => acc.account_id === defaultAccountId && acc.status === 'Active'
    );
    return accountExists ? defaultAccountId : '';
  };

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
      // Date-only format for HTML date input; API will add current time when saving
      date: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const watchedAccountId = watch('accountId');
  const watchedCategoryId = watch('categoryId');
  const watchedType = watch('type');

  // Reset form when dialog opens (only once per dialog session to prevent background refresh from resetting form data)
  useEffect(() => {
    if (open && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const defaultAccountId = getDefaultAccountId();
      const prefilledCategory = initialValues?.categoryId
        ? categories.find(
            (cat) =>
              cat.category_id === initialValues.categoryId && cat.status === 'Active'
          )
        : null;
      const prefilledType =
        initialValues?.type === 'Income' || initialValues?.type === 'Expense'
          ? initialValues.type
          : prefilledCategory?.type === 'Income'
          ? 'Income'
          : 'Expense';
      const prefilledCategoryId =
        prefilledCategory && prefilledCategory.type === prefilledType
          ? prefilledCategory.category_id
          : '';

      reset({
        accountId: defaultAccountId,
        categoryId: prefilledCategoryId,
        amount: '',
        currency: '',
        description: '',
        type: prefilledType,
        status: 'Cleared',
        // Date-only format for HTML date input; API will add current time when saving
        date: format(new Date(), 'yyyy-MM-dd'),
      });
      
      // Set currency if default account is available
      if (defaultAccountId) {
        const account = accounts.find((acc) => acc.account_id === defaultAccountId);
        if (account) {
          setValue('currency', account.currency);
        }
      }
      
      setActionError(null);
      setIsSubmitting(false);
    }
    
    // Reset the initialization flag when dialog closes
    if (!open) {
      hasInitializedRef.current = false;
    }
  }, [open, accounts, settings, reset, setValue, initialValues, categories]);

  // Auto-set currency when account is selected
  useEffect(() => {
    if (watchedAccountId) {
      const account = accounts.find((acc) => acc.account_id === watchedAccountId);
      if (account) {
        setValue('currency', account.currency);
      }
    }
  }, [watchedAccountId, accounts, setValue]);

  // Ensure Category field is auto-focused when dialog opens
  // (especially for quick-add flows launched via PWA shortcut)
  useEffect(() => {
    if (!open) return;

    // Wait a tick for the dialog to fully mount and for default
    // account/type values to be applied, then focus Category.
    if (watchedType && watchedAccountId) {
      const timer = setTimeout(() => {
        if (watchedCategoryId) {
          amountInputRef.current?.focus();
        } else {
          categoryInputRef.current?.focus();
        }
      }, 150);

      return () => clearTimeout(timer);
    }
  }, [open, watchedType, watchedAccountId, watchedCategoryId]);

  const handleClose = () => {
    setActionError(null);
    setIsSubmitting(false);
    isSubmittingRef.current = false; // Reset the synchronous guard
    reset();
    onClose();
  };

  const onSubmit = async (data) => {
    // Synchronous guard to prevent double submissions
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    
    setIsSubmitting(true);
    setActionError(null);
    try {
      await dispatch(createTransaction(data)).unwrap();
      handleClose();
    } catch (err) {
      console.error('Error saving transaction:', err);
      const errorMessage = err?.message || 'Failed to save transaction. Please try again.';
      setActionError(errorMessage);
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={handleClose}
      title="Add Transaction"
      onSubmit={handleSubmit(onSubmit)}
      contentSx={{ pt: { xs: 1, sm: 2 }, pb: 2 }}
      footer={
        <Box
          sx={{
            flexShrink: 0,
            p: { xs: 1.5, sm: 2 },
            gap: 1,
            display: 'flex',
            justifyContent: 'flex-end',
            borderTop: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.paper',
          }}
        >
          <Button
            onClick={handleClose}
            disabled={isSubmitting}
            size="medium"
            sx={{
              textTransform: 'none',
              minWidth: { xs: '45%', sm: 100 },
              flex: { xs: 1, sm: 'none' },
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
            size="medium"
            startIcon={
              isSubmitting ? (
                <CircularProgress size={16} color="inherit" />
              ) : null
            }
            sx={{
              textTransform: 'none',
              minWidth: { xs: '45%', sm: 100 },
              flex: { xs: 1, sm: 'none' },
            }}
          >
            {isSubmitting ? 'Creating...' : 'Create'}
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
            autoFocusAccount={open && !getDefaultAccountId()}
            autoFocusCategory={open}
          />
    </AppDialog>
  );
}

export default AddTransactionDialog;

