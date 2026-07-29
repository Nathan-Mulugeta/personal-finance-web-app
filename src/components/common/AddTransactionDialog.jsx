import { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  FormControl,
  FormHelperText,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { format } from 'date-fns';
import { currencyLabel } from '../../utils/currencyConversion';
import { createTransaction } from '../../store/slices/transactionsSlice';
import { transactionSchema } from '../../schemas/transactionSchema';
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from '../../lib/api/transactions';
import CategoryAutocomplete from './CategoryAutocomplete';
import BudgetInlineCue from './BudgetInlineCue';
import AccountAutocomplete from './AccountAutocomplete';
import AppDialog from './AppDialog';
import { flattenCategoryTree } from '../../utils/categoryHierarchy';
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
  const watchedStatus = watch('status');
  // Date + Status live behind "More options"; both default sensibly (today /
  // Cleared), so the common path stays short.
  const [showMore, setShowMore] = useState(false);

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
              {/* Type as two tap-to-select chips (faster + more thumb-friendly
                  than a dropdown), filling the field's width */}
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mb: 0.5,
                  ml: 0.25,
                  color: errors.type ? 'error.main' : 'text.secondary',
                }}
              >
                Type *
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {TRANSACTION_TYPES.filter((t) => !t.includes('Transfer')).map(
                  (type) => {
                    const selected = watchedType === type;
                    return (
                      <Chip
                        key={type}
                        label={type}
                        onClick={() =>
                          setValue('type', type, {
                            shouldValidate: true,
                            shouldDirty: true,
                          })
                        }
                        color={selected ? 'primary' : 'default'}
                        variant={selected ? 'filled' : 'outlined'}
                        sx={{ flex: 1, fontWeight: 500 }}
                      />
                    );
                  }
                )}
              </Box>
              {errors.type && (
                <FormHelperText error sx={{ ml: 0.25 }}>
                  {errors.type.message}
                </FormHelperText>
              )}
            </Grid>
            <Grid item xs={12} sm={6}>
              <CategoryAutocomplete
                categories={getFilteredCategories()}
                leafOnly
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
                type="number"
                label="Amount *"
                {...register('amount', { valueAsNumber: true })}
                inputRef={amountInputRef}
                error={!!errors.amount}
                helperText={errors.amount?.message}
                inputProps={{ step: '0.01', min: '0.01' }}
                InputProps={
                  watch('currency')
                    ? {
                        startAdornment: (
                          <InputAdornment position="start">
                            {currencyLabel(watch('currency'))}
                          </InputAdornment>
                        ),
                      }
                    : undefined
                }
              />
              <BudgetInlineCue
                categoryId={watchedCategoryId}
                type={watchedType}
                amount={watch('amount')}
                amountCurrency={watch('currency')}
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
            <Grid item xs={12}>
              {/* Date + Status default sensibly, so they stay out of the way
                  behind "More options" until you actually need them. */}
              <Button
                onClick={() => setShowMore((v) => !v)}
                size="small"
                endIcon={
                  <ExpandMoreIcon
                    sx={{
                      transition: 'transform 0.2s',
                      transform: showMore ? 'rotate(180deg)' : 'none',
                    }}
                  />
                }
                sx={{ textTransform: 'none', color: 'text.secondary', px: 0.5 }}
              >
                More options
              </Button>
              <Collapse in={showMore || !!errors.date || !!errors.status}>
                <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mt: 0 }}>
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
              </Collapse>
            </Grid>
          </Grid>
    </AppDialog>
  );
}

export default AddTransactionDialog;

