import { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
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
import { createTransfer } from '../../store/slices/transfersSlice';
import { transferSchema } from '../../schemas/transferSchema';
import { TRANSACTION_STATUSES } from '../../lib/api/transactions';
import CategoryAutocomplete from './CategoryAutocomplete';
import AccountAutocomplete from './AccountAutocomplete';
import AppDialog from './AppDialog';
import { flattenCategoryTree } from '../../utils/categoryHierarchy';
import { selectAccountMap } from '../../store/selectors';

/**
 * Global Add Transfer Dialog component.
 * Used for quickly adding transfers from anywhere in the app.
 */
function AddTransferDialog({ open, onClose }) {
  const dispatch = useDispatch();

  const { accounts } = useSelector((state) => state.accounts);
  const { categories } = useSelector((state) => state.categories);
  const accountMap = useSelector(selectAccountMap);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const toAccountInputRef = useRef(null); // Ref for To Account field focus chaining
  const amountInputRef = useRef(null); // Ref for Amount field focus chaining
  const fromAmountInputRef = useRef(null); // Ref for From Amount field focus chaining
  const toAmountInputRef = useRef(null); // Ref for To Amount field focus chaining
  const hasInitializedRef = useRef(false); // Guard to prevent form reset during background refresh

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setError,
    setValue,
    watch,
  } = useForm({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      fromAccountId: '',
      toAccountId: '',
      amount: '',
      fromAmount: '',
      toAmount: '',
      categoryId: '',
      description: '',
      rateNote: '',
      status: 'Cleared',
      date: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const watchedFromAccountId = watch('fromAccountId');
  const watchedToAccountId = watch('toAccountId');
  const watchedStatus = watch('status');
  const watchedFromAmount = watch('fromAmount');
  const watchedToAmount = watch('toAmount');
  // Date + Status live behind "More options" (both default sensibly)
  const [showMore, setShowMore] = useState(false);

  // Helper function to check if both accounts have the same currency
  const isSameCurrency = () => {
    if (!watchedFromAccountId || !watchedToAccountId) return true;
    const fromAccount = accountMap.get(watchedFromAccountId);
    const toAccount = accountMap.get(watchedToAccountId);
    return fromAccount?.currency === toAccount?.currency;
  };

  // Helper function to get account currency
  const getAccountCurrency = (accountId) => {
    if (!accountId) return '';
    const account = accountMap.get(accountId);
    return account?.currency || '';
  };

  // For a cross-currency transfer, the implied rate from the two amounts — a
  // quick sanity check while typing. Null until both amounts are entered.
  const exchangeRateHint = () => {
    const from = parseFloat(watchedFromAmount);
    const to = parseFloat(watchedToAmount);
    if (!(from > 0) || !(to > 0)) return null;
    const rate = to / from;
    return `1 ${currencyLabel(getAccountCurrency(watchedFromAccountId))} ≈ ${rate.toLocaleString(
      'en-US',
      { minimumFractionDigits: 2, maximumFractionDigits: 4 }
    )} ${currencyLabel(getAccountCurrency(watchedToAccountId))}`;
  };

  // Reset form when dialog opens (only once per dialog session to prevent background refresh from resetting form data)
  useEffect(() => {
    if (open && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      reset({
        fromAccountId: '',
        toAccountId: '',
        amount: '',
        fromAmount: '',
        toAmount: '',
        categoryId: '',
        description: '',
        rateNote: '',
        status: 'Cleared',
        date: format(new Date(), 'yyyy-MM-dd'),
      });
      
      setActionError(null);
      setIsSubmitting(false);
    }
    
    // Reset the initialization flag when dialog closes
    if (!open) {
      hasInitializedRef.current = false;
    }
  }, [open, reset]);

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
      const cleanedData = { ...data };

      if (!cleanedData.fromAccountId || cleanedData.fromAccountId === '') {
        setActionError('From account is required');
        setIsSubmitting(false);
        return;
      }
      if (!cleanedData.toAccountId || cleanedData.toAccountId === '') {
        setActionError('To account is required');
        setIsSubmitting(false);
        return;
      }

      if (cleanedData.amount === '' || cleanedData.amount === null) {
        cleanedData.amount = undefined;
      }
      if (cleanedData.fromAmount === '' || cleanedData.fromAmount === null) {
        cleanedData.fromAmount = undefined;
      }
      if (cleanedData.toAmount === '' || cleanedData.toAmount === null) {
        cleanedData.toAmount = undefined;
      }

      const sameCurrency = isSameCurrency();

      if (sameCurrency) {
        delete cleanedData.fromAmount;
        delete cleanedData.toAmount;
        if (!cleanedData.amount || isNaN(cleanedData.amount)) {
          setActionError('Invalid amount for same currency transfer');
          setIsSubmitting(false);
          return;
        }
      } else {
        delete cleanedData.amount;
        if (
          !cleanedData.fromAmount ||
          !cleanedData.toAmount ||
          isNaN(cleanedData.fromAmount) ||
          isNaN(cleanedData.toAmount)
        ) {
          setActionError('Invalid amounts for multi-currency transfer');
          setIsSubmitting(false);
          return;
        }
      }

      // A cross-currency transfer logs an exchange rate, and a rate with no
      // context is unreadable months later on the Exchange Rates page (which is
      // read-only, so this is the only chance to say why).
      if (!sameCurrency && !String(cleanedData.rateNote || '').trim()) {
        setError('rateNote', {
          type: 'manual',
          message: 'Tell us what this conversion was for',
        });
        setIsSubmitting(false);
        return;
      }

      const transferData = {
        fromAccountId: cleanedData.fromAccountId,
        toAccountId: cleanedData.toAccountId,
        categoryId: cleanedData.categoryId || null,
        description: cleanedData.description || '',
        rateNote: sameCurrency ? '' : cleanedData.rateNote.trim(),
        status: cleanedData.status || 'Cleared',
        date: cleanedData.date || format(new Date(), 'yyyy-MM-dd'),
      };

      if (sameCurrency) {
        transferData.amount = parseFloat(cleanedData.amount);
      } else {
        transferData.fromAmount = parseFloat(cleanedData.fromAmount);
        transferData.toAmount = parseFloat(cleanedData.toAmount);
      }

      await dispatch(createTransfer(transferData)).unwrap();
      handleClose();
    } catch (err) {
      console.error('Error saving transfer:', err);
      const errorMessage = err?.message || 'Failed to save transfer. Please try again.';
      setActionError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={handleClose}
      title="Create New Transfer"
      onSubmit={handleSubmit(onSubmit)}
      contentSx={{ pt: { xs: 1, sm: 2 } }}
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
              flex: { xs: 1, sm: 'none' },
              minWidth: { xs: 'auto', sm: 100 },
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
              flex: { xs: 1, sm: 'none' },
              minWidth: { xs: 'auto', sm: 100 },
            }}
          >
            {isSubmitting ? 'Creating...' : 'Create Transfer'}
          </Button>
        </Box>
      }
    >
          {actionError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
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
                value={watchedFromAccountId || ''}
                onChange={(id) => setValue('fromAccountId', id)}
                onSelect={() => {
                  // Focus To Account field after From Account selection
                  // Note: AccountAutocomplete already delays onSelect by 50ms,
                  // so no additional setTimeout is needed here. Adding one causes
                  // a focus flicker where the Amount field briefly gains focus.
                  toAccountInputRef.current?.focus();
                }}
                label="From Account"
                error={!!errors.fromAccountId}
                helperText={errors.fromAccountId?.message}
                autoFocus={open}
                excludeAccountId={watchedToAccountId}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <AccountAutocomplete
                accounts={accounts}
                value={watchedToAccountId || ''}
                onChange={(id) => setValue('toAccountId', id)}
                onSelect={(accountId) => {
                  // Focus amount field(s) after To Account selection
                  setTimeout(() => {
                    // Check currency match directly using the selected account
                    const fromAccount = accountMap.get(watchedFromAccountId);
                    const toAccount = accountMap.get(accountId);
                    const sameCurrency = fromAccount?.currency === toAccount?.currency;
                    
                    if (sameCurrency) {
                      amountInputRef.current?.focus();
                    } else {
                      fromAmountInputRef.current?.focus();
                    }
                  }, 150);
                }}
                label="To Account"
                error={!!errors.toAccountId}
                helperText={errors.toAccountId?.message}
                excludeAccountId={watchedFromAccountId}
                inputRef={toAccountInputRef}
                required
              />
            </Grid>
            {isSameCurrency() ? (
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Amount *"
                  {...register('amount', {
                    valueAsNumber: true,
                    setValueAs: (v) =>
                      v === '' || v === null ? undefined : Number(v),
                  })}
                  inputRef={amountInputRef}
                  error={!!errors.amount}
                  helperText={errors.amount?.message}
                  inputProps={{ step: '0.01', min: '0.01' }}
                  InputProps={
                    getAccountCurrency(watchedFromAccountId)
                      ? {
                          startAdornment: (
                            <InputAdornment position="start">
                              {currencyLabel(
                                getAccountCurrency(watchedFromAccountId)
                              )}
                            </InputAdornment>
                          ),
                        }
                      : undefined
                  }
                />
              </Grid>
            ) : (
              <>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label={`From Amount (${getAccountCurrency(
                      watchedFromAccountId
                    )}) *`}
                    {...register('fromAmount', {
                      valueAsNumber: true,
                      setValueAs: (v) =>
                        v === '' || v === null ? undefined : Number(v),
                    })}
                    inputRef={fromAmountInputRef}
                    error={!!errors.fromAmount}
                    helperText={errors.fromAmount?.message}
                    inputProps={{ step: '0.01', min: '0.01' }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label={`To Amount (${getAccountCurrency(
                      watchedToAccountId
                    )}) *`}
                    {...register('toAmount', {
                      valueAsNumber: true,
                      setValueAs: (v) =>
                        v === '' || v === null ? undefined : Number(v),
                    })}
                    inputRef={toAmountInputRef}
                    error={!!errors.toAmount}
                    helperText={errors.toAmount?.message}
                    inputProps={{ step: '0.01', min: '0.01' }}
                  />
                </Grid>
                {exchangeRateHint() && (
                  <Grid item xs={12}>
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        mt: -0.5,
                        ml: 0.5,
                        color: 'text.secondary',
                      }}
                    >
                      {exchangeRateHint()}
                    </Typography>
                  </Grid>
                )}
                {/* Belongs to the rate, not the transactions: it's what shows
                    against this conversion on the Exchange Rates page */}
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="What was this conversion for? *"
                    {...register('rateNote')}
                    error={!!errors.rateNote}
                    helperText={
                      errors.rateNote?.message ||
                      'Shown with this rate on the Exchange Rates page'
                    }
                  />
                </Grid>
              </>
            )}
            <Grid item xs={12}>
              <CategoryAutocomplete
                categories={flattenCategoryTree(categories)}
                leafOnly
                value={watch('categoryId') || ''}
                onChange={(id) => setValue('categoryId', id || null)}
                label="Category (Optional)"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description (Optional)"
                {...register('description')}
                error={!!errors.description}
                helperText={errors.description?.message}
                multiline
                rows={2}
              />
            </Grid>
            <Grid item xs={12}>
              {/* Date + Status default sensibly, so they sit behind
                  "More options" until needed. */}
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

export default AddTransferDialog;

