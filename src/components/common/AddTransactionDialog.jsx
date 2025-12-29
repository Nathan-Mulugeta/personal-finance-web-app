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
  FormControl,
  FormHelperText,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { format } from 'date-fns';
import { createTransaction } from '../../store/slices/transactionsSlice';
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
 * Global Add Transaction Dialog component.
 * Used for quickly adding transactions from anywhere in the app.
 */
function AddTransactionDialog({ open, onClose }) {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { keyboardVisible, keyboardHeight } = useKeyboardAwareHeight();
  
  const { accounts } = useSelector((state) => state.accounts);
  const { categories } = useSelector((state) => state.categories);
  const { settings } = useSelector((state) => state.settings);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const amountInputRef = useRef(null); // Ref for Amount field focus chaining
  const categoryInputRef = useRef(null); // Ref for Category field focus chaining
  const hasInitializedRef = useRef(false); // Guard to prevent form reset during background refresh

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
      date: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const watchedAccountId = watch('accountId');
  const watchedCategoryId = watch('categoryId');
  const watchedType = watch('type');
  const watchedStatus = watch('status');

  // Reset form when dialog opens (only once per dialog session to prevent background refresh from resetting form data)
  useEffect(() => {
    if (open && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
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
      
      setActionError(null);
      setIsSubmitting(false);
    }
    
    // Reset the initialization flag when dialog closes
    if (!open) {
      hasInitializedRef.current = false;
    }
  }, [open, accounts, settings, reset, setValue]);

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
    reset();
    onClose();
  };

  const onSubmit = async (data) => {
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
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: isMobile ? {
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          maxHeight: '100%',
        } : {},
      }}
    >
      <form onSubmit={handleSubmit(onSubmit)} style={isMobile ? { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', paddingBottom: keyboardVisible ? `${keyboardHeight}px` : 0 } : {}}>
        <DialogTitle sx={{ flexShrink: 0, pb: { xs: 1, sm: 2 } }}>
          Add Transaction
        </DialogTitle>
        <DialogContent sx={{ 
          flexGrow: 1, 
          overflow: 'auto', 
          pt: { xs: 1, sm: 2 },
          pb: 2,
        }}>
          {actionError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {actionError}
            </Alert>
          )}
          <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mt: { xs: 0.5, sm: 1 } }}>
            <Grid item xs={12} sm={6}>
              <AccountAutocomplete
                accounts={accounts}
                value={watchedAccountId || ''}
                onChange={(id) => setValue('accountId', id)}
                onSelect={() => {
                  // Focus Category field after account selection
                  setTimeout(() => {
                    categoryInputRef.current?.focus();
                  }, 100);
                }}
                label="Account"
                error={!!errors.accountId}
                helperText={errors.accountId?.message}
                required
                autoFocus={open && !getDefaultAccountId()}
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
                  (!watchedType ? 'Please select a transaction type first' : undefined)
                }
                disabled={!watchedType}
                autoFocus={open && !!watchedType && !!watchedAccountId}
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
            size={isMobile ? 'medium' : 'medium'}
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
            size={isMobile ? 'medium' : 'medium'}
            startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ 
              textTransform: 'none',
              minWidth: { xs: '45%', sm: 100 },
              flex: { xs: 1, sm: 'none' },
            }}
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </Button>
        </Box>
      </form>
    </Dialog>
  );
}

export default AddTransactionDialog;

