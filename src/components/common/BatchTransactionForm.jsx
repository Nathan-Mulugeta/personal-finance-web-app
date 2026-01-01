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
import { format } from 'date-fns';
import { transactionSchema } from '../../schemas/transactionSchema';
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from '../../lib/api/transactions';
import CategoryAutocomplete from './CategoryAutocomplete';
import { flattenCategoryTree } from '../../utils/categoryHierarchy';

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { accounts } = useSelector((state) => state.accounts);
  const { categories } = useSelector((state) => state.categories);
  const { settings } = useSelector((state) => state.settings);

  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [formKey, setFormKey] = useState(0); // Increments to force re-mount for auto-focus
  const amountInputRef = useRef(null); // Ref for Amount field focus chaining
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
  const watchedCategoryId = watch('categoryId');
  const watchedType = watch('type');
  const watchedStatus = watch('status');

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

        <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mt: { xs: 0.5, sm: 1 } }}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth error={!!errors.accountId}>
              <InputLabel>Account *</InputLabel>
              <Select
                {...register('accountId')}
                label="Account *"
                value={watchedAccountId || ''}
                onChange={(e) => setValue('accountId', e.target.value)}
              >
                {accounts
                  .filter((acc) => acc.status === 'Active')
                  .map((account) => (
                    <MenuItem key={account.account_id} value={account.account_id}>
                      {account.name} ({account.currency})
                    </MenuItem>
                  ))}
              </Select>
              {errors.accountId && (
                <FormHelperText>{errors.accountId.message}</FormHelperText>
              )}
            </FormControl>
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
                {TRANSACTION_TYPES.filter((t) => !t.includes('Transfer')).map(
                  (type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  )
                )}
              </Select>
              {errors.type && (
                <FormHelperText>{errors.type.message}</FormHelperText>
              )}
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <CategoryAutocomplete
              key={formKey}
              categories={getFilteredCategories()}
              value={watchedCategoryId || ''}
              onChange={(id) => setValue('categoryId', id)}
              onSelect={() => {
                // Focus Amount field after category selection
                amountInputRef.current?.focus();
              }}
              label="Category *"
              error={!!errors.categoryId}
              helperText={
                errors.categoryId?.message ||
                (!watchedType ? 'Please select a transaction type first' : undefined)
              }
              disabled={!watchedType}
              autoFocus={!!watchedType}
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
                errors.currency?.message || 'Auto-filled from account selection'
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
          disabled={isProcessing}
          size={isMobile ? 'medium' : 'medium'}
          sx={{
            textTransform: 'none',
            flex: 1,
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleNext}
          variant="outlined"
          disabled={isProcessing}
          size={isMobile ? 'medium' : 'medium'}
          startIcon={isProcessing ? <CircularProgress size={16} color="inherit" /> : null}
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
          disabled={isProcessing || (queuedCount === 0 && !watch('amount'))}
          size={isMobile ? 'medium' : 'medium'}
          sx={{
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

