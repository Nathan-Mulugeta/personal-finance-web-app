import { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormHelperText,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
  Tooltip,
  Alert,
  Collapse,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import FilterListIcon from '@mui/icons-material/FilterList';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';
import {
  fetchTransfers,
  createTransfer,
  deleteTransfer,
  clearError,
} from '../store/slices/transfersSlice';
import { fetchAccounts } from '../store/slices/accountsSlice';
import { fetchCategories } from '../store/slices/categoriesSlice';
import { recalculateAccountBalance } from '../store/slices/accountsSlice';
import { transferSchema } from '../schemas/transferSchema';
import { TRANSACTION_STATUSES } from '../lib/api/transactions';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { formatCurrency } from '../utils/currencyConversion';
import { format, parseISO } from 'date-fns';

function Transfers() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { transfers, loading, backgroundLoading, isInitialized, error } =
    useSelector((state) => state.transfers);
  const { accounts } = useSelector((state) => state.accounts);
  const { categories } = useSelector((state) => state.categories);
  const appInitialized = useSelector((state) => state.appInit.isInitialized);
  const [openDialog, setOpenDialog] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    fromAccountId: '',
    toAccountId: '',
    startDate: '',
    endDate: '',
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
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
      status: 'Cleared',
      date: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const watchedFromAccountId = watch('fromAccountId');
  const watchedToAccountId = watch('toAccountId');
  const watchedStatus = watch('status');

  const accountsInitialized = useSelector(
    (state) => state.accounts.isInitialized
  );
  const categoriesInitialized = useSelector(
    (state) => state.categories.isInitialized
  );

  // Load data on mount - only if not initialized
  useEffect(() => {
    if (!accountsInitialized) {
      dispatch(fetchAccounts({ status: 'Active' }));
    }
    if (!categoriesInitialized) {
      dispatch(fetchCategories({ status: 'Active' }));
    }
    if (!isInitialized) {
      dispatch(fetchTransfers({}));
    }
  }, [dispatch, isInitialized, accountsInitialized, categoriesInitialized]);

  // Background refresh
  useEffect(() => {
    if (isInitialized && transfers.length > 0) {
      const refreshInterval = setInterval(() => {
        dispatch(fetchTransfers({}));
      }, 60000);
      return () => clearInterval(refreshInterval);
    }
  }, [dispatch, isInitialized, transfers.length]);

  // Determine if same currency or multi-currency
  const isSameCurrency = useMemo(() => {
    if (!watchedFromAccountId || !watchedToAccountId) return true;
    const fromAccount = accounts.find(
      (acc) => acc.account_id === watchedFromAccountId
    );
    const toAccount = accounts.find(
      (acc) => acc.account_id === watchedToAccountId
    );
    return fromAccount?.currency === toAccount?.currency;
  }, [watchedFromAccountId, watchedToAccountId, accounts]);

  // Auto-set currency fields when accounts change
  useEffect(() => {
    if (watchedFromAccountId && watchedToAccountId) {
      const fromAccount = accounts.find(
        (acc) => acc.account_id === watchedFromAccountId
      );
      const toAccount = accounts.find(
        (acc) => acc.account_id === watchedToAccountId
      );
      if (fromAccount && toAccount) {
        if (isSameCurrency) {
          // Same currency - clear multi-currency fields
          setValue('fromAmount', undefined, { shouldValidate: false });
          setValue('toAmount', undefined, { shouldValidate: false });
        } else {
          // Multi-currency - clear single amount field
          setValue('amount', undefined, { shouldValidate: false });
        }
      }
    }
  }, [
    watchedFromAccountId,
    watchedToAccountId,
    accounts,
    isSameCurrency,
    setValue,
  ]);

  // Filter transfers client-side
  const filteredTransfers = useMemo(() => {
    let filtered = [...transfers];

    if (filters.fromAccountId) {
      filtered = filtered.filter(
        (t) => t.transferOut?.account_id === filters.fromAccountId
      );
    }
    if (filters.toAccountId) {
      filtered = filtered.filter(
        (t) => t.transferIn?.account_id === filters.toAccountId
      );
    }
    if (filters.startDate) {
      filtered = filtered.filter((t) => t.date >= filters.startDate);
    }
    if (filters.endDate) {
      filtered = filtered.filter((t) => t.date <= filters.endDate);
    }

    // Sort by date descending
    filtered.sort((a, b) => {
      const dateA = new Date(a.date || a.transferOut?.date || 0);
      const dateB = new Date(b.date || b.transferOut?.date || 0);
      return dateB - dateA;
    });

    return filtered;
  }, [transfers, filters]);

  const handleOpenDialog = () => {
    reset({
      fromAccountId: '',
      toAccountId: '',
      amount: '',
      fromAmount: '',
      toAmount: '',
      categoryId: '',
      description: '',
      status: 'Cleared',
      date: format(new Date(), 'yyyy-MM-dd'),
    });
    setCreateError(null);
    setIsSubmitting(false);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setCreateError(null);
    setIsSubmitting(false);
    reset();
    dispatch(clearError());
  };

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    setCreateError(null);
    try {
      // Clean up the data - remove undefined/empty values for conditional fields
      const cleanedData = { ...data };

      // Validate account IDs
      if (!cleanedData.fromAccountId || cleanedData.fromAccountId === '') {
        setCreateError('From account is required');
        setIsSubmitting(false);
        return;
      }
      if (!cleanedData.toAccountId || cleanedData.toAccountId === '') {
        setCreateError('To account is required');
        setIsSubmitting(false);
        return;
      }

      // Convert empty strings to undefined for number fields
      if (cleanedData.amount === '' || cleanedData.amount === null) {
        cleanedData.amount = undefined;
      }
      if (cleanedData.fromAmount === '' || cleanedData.fromAmount === null) {
        cleanedData.fromAmount = undefined;
      }
      if (cleanedData.toAmount === '' || cleanedData.toAmount === null) {
        cleanedData.toAmount = undefined;
      }

      if (isSameCurrency) {
        // Remove multi-currency fields
        delete cleanedData.fromAmount;
        delete cleanedData.toAmount;
        // Ensure amount is a valid number
        if (!cleanedData.amount || isNaN(cleanedData.amount)) {
          setCreateError('Invalid amount for same currency transfer');
          setIsSubmitting(false);
          return;
        }
      } else {
        // Remove single amount field
        delete cleanedData.amount;
        // Ensure both amounts are valid numbers
        if (
          !cleanedData.fromAmount ||
          !cleanedData.toAmount ||
          isNaN(cleanedData.fromAmount) ||
          isNaN(cleanedData.toAmount)
        ) {
          setCreateError('Invalid amounts for multi-currency transfer');
          setIsSubmitting(false);
          return;
        }
      }

      const transferData = {
        fromAccountId: cleanedData.fromAccountId,
        toAccountId: cleanedData.toAccountId,
        categoryId: cleanedData.categoryId || null,
        description: cleanedData.description || '',
        status: cleanedData.status || 'Cleared',
        date: cleanedData.date || format(new Date(), 'yyyy-MM-dd'),
      };

      if (isSameCurrency) {
        transferData.amount = parseFloat(cleanedData.amount);
      } else {
        transferData.fromAmount = parseFloat(cleanedData.fromAmount);
        transferData.toAmount = parseFloat(cleanedData.toAmount);
      }

      const result = await dispatch(createTransfer(transferData)).unwrap();

      handleCloseDialog();

      // Recalculate balances for both accounts
      setTimeout(() => {
        if (result.transferOut?.account_id) {
          dispatch(
            recalculateAccountBalance({
              accountId: result.transferOut.account_id,
              transactions: undefined,
            })
          );
        }
        if (result.transferIn?.account_id) {
          dispatch(
            recalculateAccountBalance({
              accountId: result.transferIn.account_id,
              transactions: undefined,
            })
          );
        }
      }, 100);

      // Refresh in background
      dispatch(fetchTransfers({}));
    } catch (err) {
      console.error('Error creating transfer:', err);
      // Set user-friendly error message
      const errorMessage = err?.message || 'Failed to create transfer. Please try again.';
      setCreateError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const transactionId =
        deleteConfirm.transferOut?.transaction_id ||
        deleteConfirm.transferIn?.transaction_id;

      if (!transactionId) {
        setDeleteError('Unable to find transaction ID for this transfer');
        setIsDeleting(false);
        return;
      }

      await dispatch(deleteTransfer(transactionId)).unwrap();

      // Recalculate balances for both accounts
      setTimeout(() => {
        if (deleteConfirm.transferOut?.account_id) {
          dispatch(
            recalculateAccountBalance({
              accountId: deleteConfirm.transferOut.account_id,
              transactions: undefined,
            })
          );
        }
        if (deleteConfirm.transferIn?.account_id) {
          dispatch(
            recalculateAccountBalance({
              accountId: deleteConfirm.transferIn.account_id,
              transactions: undefined,
            })
          );
        }
      }, 100);

      setDeleteConfirm(null);
      setDeleteError(null);
      // Refresh in background
      dispatch(fetchTransfers({}));
    } catch (err) {
      console.error('Error deleting transfer:', err);
      // Set user-friendly error message
      const errorMessage = err?.message || 'Failed to delete transfer. Please try again.';
      setDeleteError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      fromAccountId: '',
      toAccountId: '',
      startDate: '',
      endDate: '',
    });
  };

  // Get account name helper
  const getAccountName = (accountId) => {
    const account = accounts.find((acc) => acc.account_id === accountId);
    return account?.name || 'Unknown';
  };

  // Get account currency helper
  const getAccountCurrency = (accountId) => {
    const account = accounts.find((acc) => acc.account_id === accountId);
    return account?.currency || '';
  };

  if (loading && transfers.length === 0) {
    return <LoadingSpinner />;
  }

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== ''
  ).length;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          mb: 3,
          gap: { xs: 2, sm: 0 },
        }}
      >
        <Typography
          variant="h4"
          sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}
        >
          Transfers
        </Typography>
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
            width: { xs: '100%', sm: 'auto' },
          }}
        >
          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={() => setFiltersOpen(!filtersOpen)}
            color={activeFilterCount > 0 ? 'primary' : 'inherit'}
            size="small"
            sx={{ flex: { xs: '1 1 auto', sm: 'none' } }}
          >
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenDialog}
            size="small"
            sx={{ flex: { xs: '1 1 auto', sm: 'none' } }}
          >
            Add Transfer
          </Button>
        </Box>
      </Box>

      {error && <ErrorMessage error={error} />}

      {/* Filters Section */}
      <Collapse in={filtersOpen}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>From Account</InputLabel>
                  <Select
                    value={filters.fromAccountId}
                    label="From Account"
                    onChange={(e) =>
                      handleFilterChange('fromAccountId', e.target.value)
                    }
                  >
                    <MenuItem value="">All Accounts</MenuItem>
                    {accounts
                      .filter((acc) => acc.status === 'Active')
                      .map((account) => (
                        <MenuItem
                          key={account.account_id}
                          value={account.account_id}
                        >
                          {account.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>To Account</InputLabel>
                  <Select
                    value={filters.toAccountId}
                    label="To Account"
                    onChange={(e) =>
                      handleFilterChange('toAccountId', e.target.value)
                    }
                  >
                    <MenuItem value="">All Accounts</MenuItem>
                    {accounts
                      .filter((acc) => acc.status === 'Active')
                      .map((account) => (
                        <MenuItem
                          key={account.account_id}
                          value={account.account_id}
                        >
                          {account.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Start Date"
                  value={filters.startDate}
                  onChange={(e) =>
                    handleFilterChange('startDate', e.target.value)
                  }
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="End Date"
                  value={filters.endDate}
                  onChange={(e) =>
                    handleFilterChange('endDate', e.target.value)
                  }
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={clearFilters}
                  disabled={activeFilterCount === 0}
                >
                  Clear Filters
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Collapse>

      {filteredTransfers.length === 0 ? (
        <Card>
          <CardContent>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <SwapHorizIcon
                sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }}
              />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No transfers yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Create your first transfer to move money between accounts
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleOpenDialog}
              >
                Create Transfer
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Box>
          {filteredTransfers.map((transfer, index) => {
            const transferOut = transfer.transferOut;
            const transferIn = transfer.transferIn;
            const exchangeRate = transfer.exchangeRate;
            const isMultiCurrency = exchangeRate !== null;

            return (
              <Paper
                key={transfer.transferId || `transfer-${transferOut?.transaction_id || transferIn?.transaction_id || index}`}
                elevation={0}
                sx={{
                  p: { xs: 1.5, sm: 2 },
                  mb: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: 'space-between',
                    gap: 2,
                  }}
                >
                  {/* Transfer Details */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* Date */}
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                        mb: 1,
                      }}
                    >
                      {transfer.date
                        ? format(parseISO(transfer.date), 'MMM dd, yyyy')
                        : transferOut?.date
                        ? format(parseISO(transferOut.date), 'MMM dd, yyyy')
                        : 'Unknown date'}
                    </Typography>

                    {/* Transfer Out */}
                    <Box sx={{ mb: 1 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          mb: 0.5,
                        }}
                      >
                        <Typography
                          variant="body2"
                          fontWeight={500}
                          color="error.main"
                        >
                          From:
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {getAccountName(transferOut?.account_id)}
                        </Typography>
                        <Chip
                          label={getAccountCurrency(transferOut?.account_id)}
                          size="small"
                          sx={{ height: 20, fontSize: '0.6875rem' }}
                        />
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          color="error.main"
                        >
                          {formatCurrency(
                            Math.abs(transferOut?.amount || 0),
                            getAccountCurrency(transferOut?.account_id)
                          )}
                        </Typography>
                      </Box>
                      {transferOut?.description && (
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.75rem',
                            color: 'text.secondary',
                            ml: 3,
                          }}
                        >
                          {transferOut.description}
                        </Typography>
                      )}
                    </Box>

                    {/* Arrow */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: 1,
                        ml: { xs: 0, sm: 1 },
                      }}
                    >
                      <SwapHorizIcon
                        sx={{
                          fontSize: 20,
                          color: 'text.secondary',
                          transform: 'rotate(90deg)',
                        }}
                      />
                      {isMultiCurrency && exchangeRate && (
                        <Chip
                          icon={<CurrencyExchangeIcon />}
                          label={`Rate: ${exchangeRate.rate.toFixed(4)}`}
                          size="small"
                          sx={{ height: 22, fontSize: '0.6875rem' }}
                        />
                      )}
                    </Box>

                    {/* Transfer In */}
                    <Box>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          mb: 0.5,
                        }}
                      >
                        <Typography
                          variant="body2"
                          fontWeight={500}
                          color="success.main"
                        >
                          To:
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {getAccountName(transferIn?.account_id)}
                        </Typography>
                        <Chip
                          label={getAccountCurrency(transferIn?.account_id)}
                          size="small"
                          sx={{ height: 20, fontSize: '0.6875rem' }}
                        />
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          color="success.main"
                        >
                          {formatCurrency(
                            Math.abs(transferIn?.amount || 0),
                            getAccountCurrency(transferIn?.account_id)
                          )}
                        </Typography>
                      </Box>
                      {transferIn?.description && (
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.75rem',
                            color: 'text.secondary',
                            ml: 3,
                          }}
                        >
                          {transferIn.description}
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  {/* Actions */}
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="Delete Transfer">
                      <IconButton
                        size="small"
                        onClick={() => setDeleteConfirm(transfer)}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      {/* Create Transfer Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <form
          onSubmit={handleSubmit(onSubmit, (errors) => {
            console.log('Form validation errors:', errors);
          })}
        >
          <DialogTitle>Create New Transfer</DialogTitle>
          <DialogContent>
            {createError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {createError}
              </Alert>
            )}
            {errors.root && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {errors.root.message}
              </Alert>
            )}
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!errors.fromAccountId}>
                  <InputLabel>From Account *</InputLabel>
                  <Select
                    {...register('fromAccountId')}
                    label="From Account *"
                    value={watchedFromAccountId || ''}
                    onChange={(e) => setValue('fromAccountId', e.target.value)}
                  >
                    {accounts
                      .filter((acc) => acc.status === 'Active')
                      .map((account) => (
                        <MenuItem
                          key={account.account_id}
                          value={account.account_id}
                        >
                          {account.name} ({account.currency})
                        </MenuItem>
                      ))}
                  </Select>
                  {errors.fromAccountId && (
                    <FormHelperText>
                      {errors.fromAccountId.message}
                    </FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!errors.toAccountId}>
                  <InputLabel>To Account *</InputLabel>
                  <Select
                    {...register('toAccountId')}
                    label="To Account *"
                    value={watchedToAccountId || ''}
                    onChange={(e) => setValue('toAccountId', e.target.value)}
                  >
                    {accounts
                      .filter((acc) => acc.status === 'Active')
                      .map((account) => (
                        <MenuItem
                          key={account.account_id}
                          value={account.account_id}
                        >
                          {account.name} ({account.currency})
                        </MenuItem>
                      ))}
                  </Select>
                  {errors.toAccountId && (
                    <FormHelperText>
                      {errors.toAccountId.message}
                    </FormHelperText>
                  )}
                </FormControl>
              </Grid>
              {watchedFromAccountId && watchedToAccountId && (
                <Grid item xs={12}>
                  <Alert severity={isSameCurrency ? 'info' : 'warning'}>
                    {isSameCurrency
                      ? 'Same currency transfer - enter amount once'
                      : 'Multi-currency transfer - enter amounts in both currencies'}
                  </Alert>
                </Grid>
              )}
              {isSameCurrency ? (
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Amount *"
                    {...register('amount', { valueAsNumber: true })}
                    error={!!errors.amount}
                    helperText={errors.amount?.message}
                    inputProps={{ step: '0.01', min: '0.01' }}
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
                      {...register('fromAmount', { valueAsNumber: true })}
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
                      {...register('toAmount', { valueAsNumber: true })}
                      error={!!errors.toAmount}
                      helperText={errors.toAmount?.message}
                      inputProps={{ step: '0.01', min: '0.01' }}
                    />
                  </Grid>
                </>
              )}
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
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Category (Optional)</InputLabel>
                  <Select
                    {...register('categoryId', {
                      setValueAs: (v) => (v === '' ? null : v),
                    })}
                    label="Category (Optional)"
                    value={watch('categoryId') || ''}
                    onChange={(e) =>
                      setValue('categoryId', e.target.value || null)
                    }
                  >
                    <MenuItem value="">None</MenuItem>
                    {categories
                      .filter((cat) => cat.status === 'Active')
                      .map((category) => (
                        <MenuItem
                          key={category.category_id}
                          value={category.category_id}
                        >
                          {category.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
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
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting}
              startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : null}
            >
              {isSubmitting ? 'Creating...' : 'Create Transfer'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirm}
        onClose={() => {
          setDeleteConfirm(null);
          setDeleteError(null);
        }}
        fullScreen={isMobile}
      >
        <DialogTitle>Delete Transfer</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this transfer? This will delete both
            transactions.
          </Typography>
          {deleteConfirm && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Date:</strong>{' '}
                {deleteConfirm.date
                  ? format(parseISO(deleteConfirm.date), 'MMM dd, yyyy')
                  : deleteConfirm.transferOut?.date
                  ? format(
                      parseISO(deleteConfirm.transferOut.date),
                      'MMM dd, yyyy'
                    )
                  : 'Unknown'}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>From:</strong>{' '}
                {getAccountName(deleteConfirm.transferOut?.account_id)}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>To:</strong>{' '}
                {getAccountName(deleteConfirm.transferIn?.account_id)}
              </Typography>
            </Box>
          )}
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
          <Alert severity="warning" sx={{ mt: 2 }}>
            This action cannot be undone. Both transactions will be deleted.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteConfirm(null);
              setDeleteError(null);
            }}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
            startIcon={isDeleting ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {isDeleting ? 'Deleting...' : 'Delete Transfer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Transfers;
