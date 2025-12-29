import { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Box,
  Button,
  Card,
  CardContent,
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Chip,
  Alert,
  Tooltip,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import {
  fetchAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  clearError,
} from '../store/slices/accountsSlice';
import { fetchSettings } from '../store/slices/settingsSlice';
import { accountSchema } from '../schemas/accountSchema';
import { ACCOUNT_TYPES, ACCOUNT_STATUSES } from '../lib/api/accounts';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { formatCurrency } from '../utils/currencyConversion';
import { usePageRefresh } from '../hooks/usePageRefresh';

function Accounts() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { accounts, loading, backgroundLoading, error } = useSelector(
    (state) => state.accounts
  );
  const { settings } = useSelector((state) => state.settings);
  const { exchangeRates } = useSelector((state) => state.exchangeRates);
  const appInitialized = useSelector((state) => state.appInit.isInitialized);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      type: 'Checking',
      currency: 'USD',
      openingBalance: 0,
      status: 'Active',
    },
  });

  const watchedType = watch('type');
  const watchedStatus = watch('status');

  // Refresh data on navigation
  usePageRefresh({
    dataTypes: ['accounts', 'settings', 'exchangeRates'],
    filters: {
      accounts: { status: 'Active' },
    },
  });

  // Calculate summary data from cached data
  // Balance is now stored directly in account.current_balance (updated by database triggers)
  const summaryData = useMemo(() => {
    if (accounts.length === 0) {
      return null;
    }

    // Calculate currency totals directly from accounts
    const currencyTotals = {};
    accounts.forEach((account) => {
      const currency = account.currency;
      if (!currencyTotals[currency]) {
        currencyTotals[currency] = 0;
      }
      currencyTotals[currency] += account.current_balance || 0;
    });

    const baseCurrency =
      settings.find((s) => s.setting_key === 'BaseCurrency')?.setting_value ||
      'USD';

    // Create accounts array with conversions
    const accountBalancesArray = accounts.map((account) => {
      const currentBalance =
        account.current_balance ?? account.opening_balance ?? 0;

      let convertedBalance = null;
      let exchangeRate = null;

      if (account.currency === baseCurrency) {
        convertedBalance = currentBalance;
        exchangeRate = 1;
      } else {
        // Try to get latest exchange rate from cache (sorted by date)
        const matchingRates =
          exchangeRates?.filter(
            (er) =>
              er.from_currency === account.currency.toUpperCase() &&
              er.to_currency === baseCurrency.toUpperCase()
          ) || [];
        const rate = matchingRates.sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        )[0];

        if (rate) {
          convertedBalance = currentBalance * rate.rate;
          exchangeRate = rate.rate;
        } else {
          // Try reverse rate (sorted by date)
          const reverseMatchingRates =
            exchangeRates?.filter(
              (er) =>
                er.from_currency === baseCurrency.toUpperCase() &&
                er.to_currency === account.currency.toUpperCase()
            ) || [];
          const reverseRate = reverseMatchingRates.sort(
            (a, b) => new Date(b.date) - new Date(a.date)
          )[0];

          if (reverseRate) {
            convertedBalance = currentBalance / reverseRate.rate;
            exchangeRate = 1 / reverseRate.rate;
          }
        }
      }

      return {
        ...account,
        current_balance: currentBalance,
        currency: account.currency,
        convertedBalance,
        exchangeRate,
      };
    });

    // Calculate total balance in base currency
    const totalBalance = accountBalancesArray.reduce((sum, acc) => {
      return sum + (acc.convertedBalance ?? 0);
    }, 0);

    return {
      totalBalance,
      baseCurrency,
      accounts: accountBalancesArray,
    };
  }, [accounts, settings, exchangeRates]);

  const handleOpenDialog = (account = null) => {
    if (account) {
      setEditingAccount(account);
      // Use reset to properly set all form values
      reset({
        name: account.name,
        type: account.type,
        currency: account.currency,
        openingBalance: account.opening_balance,
        status: account.status,
      });
    } else {
      setEditingAccount(null);
      reset({
        name: '',
        type: 'Checking',
        currency: 'USD',
        openingBalance: 0,
        status: 'Active',
      });
    }
    setActionError(null);
    setIsSubmitting(false);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingAccount(null);
    setActionError(null);
    setIsSubmitting(false);
    reset();
    dispatch(clearError());
  };

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      if (editingAccount) {
        await dispatch(
          updateAccount({
            accountId: editingAccount.account_id,
            updates: data,
          })
        ).unwrap();
      } else {
        await dispatch(createAccount(data)).unwrap();
        // Account is already added to state with balance calculated
        // No need to refetch - it will be included in next initialization
      }
      handleCloseDialog();
    } catch (err) {
      // Ignore browser extension errors (harmless)
      if (err?.message?.includes('Extension context invalidated')) {
        setIsSubmitting(false);
        return;
      }
      console.error('Error saving account:', err);
      const errorMessage =
        err?.message || 'Failed to save account. Please try again.';
      setActionError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await dispatch(deleteAccount(deleteConfirm.account_id)).unwrap();
      setDeleteConfirm(null);
      setDeleteError(null);
    } catch (err) {
      console.error('Error deleting account:', err);
      const errorMessage =
        err?.message || 'Failed to delete account. Please try again.';
      setDeleteError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  // Status chip styling - muted colors matching other chips
  const getStatusChipSx = (status) => {
    switch (status) {
      case 'Active':
        return {
          // Muted green text only, outlined style to match other chips
          color: '#2e7d32', // MUI success.dark - muted green
          borderColor: '#2e7d32',
          fontWeight: 500,
          '& .MuiChip-label': { px: 0.75 },
        };
      case 'Closed':
        return {
          color: '#5f6368',
          borderColor: '#5f6368',
          fontWeight: 500,
          '& .MuiChip-label': { px: 0.75 },
        };
      case 'Suspended':
        return {
          color: '#e37400',
          borderColor: '#e37400',
          fontWeight: 500,
          '& .MuiChip-label': { px: 0.75 },
        };
      default:
        return {
          color: '#5f6368',
          borderColor: '#5f6368',
          fontWeight: 500,
          '& .MuiChip-label': { px: 0.75 },
        };
    }
  };

  if (loading && accounts.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          mb: { xs: 1.5, sm: 2, md: 3 },
          gap: { xs: 1, sm: 0 },
        }}
      >
        <Typography
          variant="h4"
          sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}
        >
          Accounts
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          size="small"
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          Add Account
        </Button>
      </Box>

      {error && <ErrorMessage error={error} />}

      {/* Summary Section */}
      {accounts.length > 0 && (
        <Box sx={{ mb: { xs: 2, sm: 3, md: 4 } }}>
          {/* Header Row with Overall Balances and Total - Compact layout */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: { xs: 1, sm: 1.5, md: 2 },
            }}
          >
            <Typography
              variant="body1"
              sx={{
                fontWeight: 600,
                color: 'text.secondary',
                fontSize: { xs: '0.875rem', sm: '1rem' },
              }}
            >
              Overall Balances
            </Typography>
            {summaryData && (
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: { xs: 'none', sm: 'inline' } }}
                >
                  Total:
                </Typography>
                <Typography
                  variant="body1"
                  fontWeight="bold"
                  color="text.primary"
                  sx={{ fontSize: { xs: '0.9rem', sm: '1.1rem' } }}
                >
                  {formatCurrency(
                    summaryData.totalBalance || 0,
                    summaryData.baseCurrency || 'USD'
                  )}
                </Typography>
              </Box>
            )}
          </Box>

          {/* Currency Summary Cards */}
          {!summaryData ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                py: 3,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                No accounts available
              </Typography>
            </Box>
          ) : (
            <Grid container spacing={{ xs: 1.5, sm: 2 }}>
              {(() => {
                // Group accounts by currency and calculate totals
                const currencyGroups = {};
                summaryData.accounts?.forEach((account) => {
                  const currency =
                    account.currency || account.account_id?.currency;
                  const balance = account.current_balance || 0;
                  if (!currencyGroups[currency]) {
                    currencyGroups[currency] = {
                      currency,
                      total: 0,
                      count: 0,
                    };
                  }
                  currencyGroups[currency].total += balance;
                  currencyGroups[currency].count += 1;
                });

                // If no accounts in summaryData, calculate from local state
                if (
                  !summaryData.accounts ||
                  summaryData.accounts.length === 0
                ) {
                  accounts.forEach((account) => {
                    const currency = account.currency;
                    if (!currencyGroups[currency]) {
                      currencyGroups[currency] = {
                        currency,
                        total: 0,
                        count: 0,
                      };
                    }
                    currencyGroups[currency].total +=
                      account.current_balance || 0;
                    currencyGroups[currency].count += 1;
                  });
                }

                const currencyArray = Object.values(currencyGroups);

                if (currencyArray.length === 0) {
                  return (
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary">
                        No balances available
                      </Typography>
                    </Grid>
                  );
                }

                return currencyArray.map((group) => (
                  <Grid item xs={12} sm={4} md={3} key={group.currency}>
                    <Paper
                      elevation={0}
                      sx={{
                        p: { xs: 1, sm: 1.5 },
                        borderRadius: 1.5,
                        backgroundColor: 'background.paper',
                        border: '1px solid',
                        borderColor: 'divider',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                      >
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          fontWeight="medium"
                          sx={{ fontSize: { xs: '0.8rem', sm: '0.85rem' } }}
                        >
                          {group.currency}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                        >
                          ({group.count})
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        fontWeight="bold"
                        color="text.primary"
                        sx={{
                          fontSize: { xs: '0.9rem', sm: '1rem' },
                        }}
                      >
                        {formatCurrency(group.total, group.currency)}
                      </Typography>
                    </Paper>
                  </Grid>
                ));
              })()}
            </Grid>
          )}
        </Box>
      )}

      {accounts.length === 0 ? (
        <Card>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ textAlign: 'center', py: { xs: 3, sm: 4 } }}>
              <AccountBalanceIcon
                sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }}
              />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No accounts yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Create your first account to start tracking your finances
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenDialog()}
              >
                Create Account
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile Card View - Compact layout */}
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            {accounts.map((account) => {
              const currentBalance =
                account.current_balance ?? account.opening_balance ?? 0;
              return (
                <Card key={account.account_id} sx={{ mb: 1 }}>
                  <CardContent
                    sx={{
                      p: 1.25,
                      '&:last-child': { pb: 1.25 },
                    }}
                  >
                    {/* Top row: Name + Actions */}
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 0.5,
                      }}
                    >
                      <Typography
                        variant="body1"
                        fontWeight="600"
                        sx={{
                          fontSize: '0.9rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          flex: 1,
                          mr: 1,
                        }}
                      >
                        {account.name}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.25 }}>
                        <IconButton
                          size="small"
                          onClick={() => handleOpenDialog(account)}
                          sx={{
                            color: '#5f6368',
                            '&:hover': { color: '#1a73e8' },
                            p: 0.5,
                          }}
                        >
                          <EditIcon sx={{ fontSize: '1rem' }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => setDeleteConfirm(account)}
                          sx={{
                            color: '#5f6368',
                            '&:hover': { color: '#d93025' },
                            p: 0.5,
                          }}
                          disabled={account.status === 'Closed'}
                        >
                          <DeleteIcon sx={{ fontSize: '1rem' }} />
                        </IconButton>
                      </Box>
                    </Box>
                    {/* Chips row */}
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 0.5,
                        flexWrap: 'wrap',
                        mb: 0.75,
                      }}
                    >
                      <Chip
                        label={account.type}
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          '& .MuiChip-label': { px: 0.75 },
                        }}
                      />
                      <Chip
                        label={account.currency}
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          '& .MuiChip-label': { px: 0.75 },
                        }}
                      />
                      <Chip
                        label={account.status}
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          ...getStatusChipSx(account.status),
                        }}
                      />
                    </Box>
                    {/* Balances row - inline */}
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        pt: 0.5,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 0.5,
                        }}
                      >
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.65rem' }}
                        >
                          Opening:
                        </Typography>
                        <Typography
                          variant="body2"
                          fontWeight="medium"
                          sx={{ fontSize: '0.75rem' }}
                        >
                          {formatCurrency(
                            account.opening_balance,
                            account.currency
                          )}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 0.5,
                        }}
                      >
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.65rem' }}
                        >
                          Current:
                        </Typography>
                        <Typography
                          variant="body2"
                          fontWeight="bold"
                          color="text.primary"
                          sx={{ fontSize: '0.8rem' }}
                        >
                          {formatCurrency(currentBalance, account.currency)}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Box>

          {/* Desktop Table View */}
          <TableContainer
            component={Paper}
            sx={{ display: { xs: 'none', md: 'block' } }}
          >
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Currency</TableCell>
                  <TableCell align="right">Opening Balance</TableCell>
                  <TableCell align="right">Current Balance</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {accounts.map((account) => {
                  const currentBalance =
                    account.current_balance ?? account.opening_balance ?? 0;
                  return (
                    <TableRow key={account.account_id} hover>
                      <TableCell>
                        <Typography variant="body1" fontWeight="medium">
                          {account.name}
                        </Typography>
                      </TableCell>
                      <TableCell>{account.type}</TableCell>
                      <TableCell>{account.currency}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(
                          account.opening_balance,
                          account.currency
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body1"
                          fontWeight="medium"
                          color={
                            currentBalance >= 0 ? 'success.main' : 'error.main'
                          }
                        >
                          {formatCurrency(currentBalance, account.currency)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={account.status}
                          size="small"
                          variant="outlined"
                          sx={getStatusChipSx(account.status)}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => handleOpenDialog(account)}
                            sx={{
                              color: '#5f6368',
                              '&:hover': { color: '#1a73e8' },
                            }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => setDeleteConfirm(account)}
                              sx={{
                                color: '#5f6368',
                                '&:hover': { color: '#d93025' },
                              }}
                              disabled={account.status === 'Closed'}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogTitle>
            {editingAccount ? 'Edit Account' : 'Create New Account'}
          </DialogTitle>
          <DialogContent sx={{ overflow: 'visible' }}>
            {actionError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {actionError}
              </Alert>
            )}
            <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mt: 2 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Account Name"
                  {...register('name')}
                  error={!!errors.name}
                  helperText={errors.name?.message}
                  autoFocus
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!errors.type}>
                  <InputLabel>Account Type</InputLabel>
                  <Select
                    {...register('type')}
                    label="Account Type"
                    value={watchedType || ''}
                    onChange={(e) => setValue('type', e.target.value)}
                  >
                    {ACCOUNT_TYPES.map((type) => (
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
                <TextField
                  fullWidth
                  label="Currency (ISO Code)"
                  {...register('currency')}
                  error={!!errors.currency}
                  helperText={errors.currency?.message || 'e.g., USD, EUR, ETB'}
                  inputProps={{
                    maxLength: 3,
                    style: { textTransform: 'uppercase' },
                  }}
                  onChange={(e) => {
                    setValue('currency', e.target.value.toUpperCase());
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Opening Balance"
                  {...register('openingBalance', { valueAsNumber: true })}
                  error={!!errors.openingBalance}
                  helperText={errors.openingBalance?.message}
                  inputProps={{ step: '0.01' }}
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
                    {ACCOUNT_STATUSES.map((status) => (
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
              {editingAccount && (
                <Grid item xs={12}>
                  <Alert severity="warning">
                    Note: You cannot change the currency or opening balance for
                    accounts with existing transactions.
                  </Alert>
                </Grid>
              )}
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
              startIcon={
                isSubmitting ? (
                  <CircularProgress size={20} color="inherit" />
                ) : null
              }
            >
              {isSubmitting
                ? editingAccount
                  ? 'Updating...'
                  : 'Creating...'
                : editingAccount
                ? 'Update'
                : 'Create'}
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
        <DialogTitle>Delete Account</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete{' '}
            <strong>{deleteConfirm?.name}</strong>?
          </Typography>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
          <Alert severity="warning" sx={{ mt: 2 }}>
            This action cannot be undone. You cannot delete accounts with
            existing transactions.
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
            startIcon={
              isDeleting ? <CircularProgress size={20} color="inherit" /> : null
            }
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Accounts;
