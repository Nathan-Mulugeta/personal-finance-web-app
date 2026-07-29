import { useEffect, useState, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  DialogTitle,
  DialogContent,
  Typography,
} from '@mui/material';
import { format } from 'date-fns';
import { transactionSchema } from '../../schemas/transactionSchema';
import TransactionFormFields from './TransactionFormFields';

/**
 * Batch Transaction Form Component
 * Provides the form for entering a single transaction in batch mode.
 * Has Cancel, Next, and Done buttons with keyboard-aware positioning.
 */
function BatchTransactionForm({
  onNext,
  onDone,
  onCancel,
  editingTransaction,
  onUpdate,
  queuedCount = 0,
  keyboardVisible = false,
  keyboardHeight = 0,
}) {
  const { accounts } = useSelector((state) => state.accounts);
  const { categories } = useSelector((state) => state.categories);
  const { settings } = useSelector((state) => state.settings);

  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [formKey, setFormKey] = useState(0); // Increments to force re-mount for auto-focus
  const amountInputRef = useRef(null); // Ref for Amount field focus chaining
  const categoryInputRef = useRef(null); // Ref for Category field focus chaining
  const initializedForRef = useRef(null); // Track which state has been initialized to prevent refresh reset

  // Get default account from settings
  const getDefaultAccountId = () => {
    const defaultAccountSetting = settings.find(
      (s) => s.setting_key === 'DefaultAccountID'
    );
    const defaultAccountId = defaultAccountSetting?.setting_value || '';
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
      date: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const watchedAccountId = watch('accountId');

  // Reset form or populate with editing transaction (only when the editing state changes, not on background refresh)
  useEffect(() => {
    // Create a key to identify the current form state: editing a specific transaction or entering a new one
    const currentStateKey = editingTransaction ? `edit-${editingTransaction.tempId}` : 'new';
    
    // Only initialize if the state has changed
    if (initializedForRef.current !== currentStateKey) {
      initializedForRef.current = currentStateKey;
      
      if (editingTransaction) {
        reset({
          accountId: editingTransaction.accountId,
          categoryId: editingTransaction.categoryId,
          amount: editingTransaction.amount,
          currency: editingTransaction.currency,
          description: editingTransaction.description || '',
          type: editingTransaction.type,
          status: editingTransaction.status,
          date: editingTransaction.date,
        });
      } else {
        const defaultAccountId = getDefaultAccountId();
        reset({
          accountId: defaultAccountId,
          categoryId: '',
          amount: '',
          currency: '',
          description: '',
          type: 'Expense',
          status: 'Cleared',
          date: format(new Date(), 'yyyy-MM-dd'),
        });

        // Set currency if default account is available
        if (defaultAccountId) {
          const account = accounts.find((acc) => acc.account_id === defaultAccountId);
          if (account) {
            setValue('currency', account.currency);
          }
        }
      }
      setActionError(null);
    }
  }, [editingTransaction, accounts, settings, reset, setValue]);

  // Auto-set currency when account is selected
  useEffect(() => {
    if (watchedAccountId) {
      const account = accounts.find((acc) => acc.account_id === watchedAccountId);
      if (account) {
        setValue('currency', account.currency);
      }
    }
  }, [watchedAccountId, accounts, setValue]);

  // Handle Next button - save and create new
  const handleNext = handleSubmit((data) => {
    setIsProcessing(true);
    try {
      if (editingTransaction) {
        onUpdate(editingTransaction.tempId, data);
      } else {
        onNext(data);
      }
      // Reset form for next entry
      const defaultAccountId = getDefaultAccountId();
      reset({
        accountId: defaultAccountId,
        categoryId: '',
        amount: '',
        currency: '',
        description: '',
        type: 'Expense',
        status: 'Cleared',
        date: format(new Date(), 'yyyy-MM-dd'),
      });
      if (defaultAccountId) {
        const account = accounts.find((acc) => acc.account_id === defaultAccountId);
        if (account) {
          setValue('currency', account.currency);
        }
      }
      // Increment formKey to force CategoryAutocomplete re-mount and auto-focus
      setFormKey((prev) => prev + 1);
    } catch (err) {
      setActionError(err?.message || 'Failed to add transaction');
    } finally {
      setIsProcessing(false);
    }
  });

  // Handle Done button - save current and go to summary
  const handleDone = handleSubmit(
    (data) => {
      // Valid form data
      onDone(data);
    },
    () => {
      // Form has errors - if amount is empty, allow going to summary with existing queue
      if (!watch('amount') && queuedCount > 0) {
        onDone(null);
      }
    }
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        paddingBottom: keyboardVisible ? `${keyboardHeight}px` : 0,
      }}
    >
      <DialogTitle sx={{ flexShrink: 0, pb: { xs: 1, sm: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{editingTransaction ? 'Edit Transaction' : 'Add Transaction'}</span>
          {queuedCount > 0 && (
            <Typography variant="body2" color="text.secondary">
              {queuedCount} queued
            </Typography>
          )}
        </Box>
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
          autoFocusCategory
          collapseDateStatus={false}
          categoryKey={formKey}
        />
      </DialogContent>

      {/* Action Buttons */}
      <Box
        sx={{
          flexShrink: 0,
          p: { xs: 1.5, sm: 2 },
          borderTop: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Button
          onClick={onCancel}
          disabled={isProcessing}          sx={{
            textTransform: 'none',
            flex: 1,
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleNext}
          variant="outlined"
          disabled={isProcessing}          startIcon={isProcessing ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{
            textTransform: 'none',
            flex: 1,
          }}
        >
          {editingTransaction ? 'Save' : 'Next'}
        </Button>
        <Button
          onClick={handleDone}
          variant="contained"
          disabled={isProcessing || (queuedCount === 0 && !watch('amount'))}          sx={{
            textTransform: 'none',
            flex: 1,
          }}
        >
          Done
        </Button>
      </Box>
    </Box>
  );
}

export default BatchTransactionForm;

