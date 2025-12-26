import { useEffect, useState } from 'react';
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
  fetchAccountBalance,
  clearError,
} from '../store/slices/accountsSlice';
import { fetchSettings } from '../store/slices/settingsSlice';
import { accountSchema } from '../schemas/accountSchema';
import { ACCOUNT_TYPES, ACCOUNT_STATUSES } from '../lib/api/accounts';
import * as reportingApi from '../lib/api/reporting';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { formatCurrency } from '../utils/currencyConversion';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';

function Accounts() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { accounts, loading, backgroundLoading, isInitialized, error } =
    useSelector((state) => state.accounts);
  const { settings } = useSelector((state) => state.settings);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [balances, setBalances] = useState({});
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

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

  useEffect(() => {
    // Only fetch if not already initialized
    if (!isInitialized) {
      dispatch(fetchAccounts({ status: 'Active' }));
    } else {
      // Background refresh
      dispatch(fetchAccounts({ status: 'Active' }));
    }
    dispatch(fetchSettings());
  }, [dispatch, isInitialized]);

  useEffect(() => {
    // Fetch balances for all accounts
    const fetchBalances = async () => {
      const balancePromises = accounts.map(async (account) => {
        try {
          const balance = await dispatch(
            fetchAccountBalance(account.account_id)
          ).unwrap();
          return { accountId: account.account_id, balance };
        } catch (err) {
          console.error(
            `Error fetching balance for ${account.account_id}:`,
            err
          );
          return { accountId: account.account_id, balance: null };
        }
      });
      const results = await Promise.all(balancePromises);
      const balanceMap = {};
      results.forEach(({ accountId, balance }) => {
        balanceMap[accountId] = balance;
      });
      setBalances(balanceMap);
    };

    if (accounts.length > 0) {
      fetchBalances();
    }
  }, [accounts, dispatch]);

  useEffect(() => {
    // Fetch summary data with currency conversions
    const fetchSummary = async () => {
      if (accounts.length === 0) {
        setSummaryData(null);
        return;
      }

      setSummaryLoading(true);
      try {
        const summary = await reportingApi.getAllAccountBalances();
        setSummaryData(summary);
      } catch (err) {
        console.error('Error fetching summary:', err);
        // Calculate per-currency totals from local balances as fallback
        const currencyTotals = {};
        accounts.forEach((account) => {
          const balance = balances[account.account_id];
          if (balance) {
            const currency = account.currency;
            if (!currencyTotals[currency]) {
              currencyTotals[currency] = 0;
            }
            currencyTotals[currency] += balance.current_balance || 0;
          }
        });
        const baseCurrency =
          settings.find((s) => s.setting_key === 'BaseCurrency')
            ?.setting_value || 'USD';

        // Create accounts array for display
        const accountBalances = accounts.map((account) => {
          const balance = balances[account.account_id];
          return {
            ...account,
            current_balance: balance?.current_balance || 0,
            currency: account.currency,
            convertedBalance:
              account.currency === baseCurrency
                ? balance?.current_balance || 0
                : null,
          };
        });

        setSummaryData({
          totalBalance: currencyTotals[baseCurrency] || 0,
          baseCurrency,
          accounts: accountBalances,
        });
      } finally {
        setSummaryLoading(false);
      }
    };

    if (accounts.length > 0 && Object.keys(balances).length > 0) {
      fetchSummary();
    }
  }, [accounts, balances, settings]);

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
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingAccount(null);
    reset();
    dispatch(clearError());
  };

  const onSubmit = async (data) => {
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
      }
      handleCloseDialog();
      // Refresh in background
      dispatch(fetchAccounts({ status: 'Active' }));
    } catch (err) {
      // Error is handled by Redux state
      // Ignore browser extension errors (harmless)
      if (err?.message?.includes('Extension context invalidated')) {
        return;
      }
      console.error('Error saving account:', err);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await dispatch(deleteAccount(deleteConfirm.account_id)).unwrap();
      setDeleteConfirm(null);
      // Refresh in background
      dispatch(fetchAccounts({ status: 'Active' }));
    } catch (err) {
      console.error('Error deleting account:', err);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active':
        return 'success';
      case 'Closed':
        return 'default';
      case 'Suspended':
        return 'warning';
      default:
        return 'default';
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
          mb: 3,
          gap: { xs: 2, sm: 0 },
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
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* Total Balance in Base Currency */}
          <Grid item xs={12} md={4}>
            <Card elevation={2}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <TrendingUpIcon
                    sx={{ mr: 1, fontSize: 28, color: 'primary.main' }}
                  />
                  <Typography variant="h6" fontWeight="bold">
                    Total Balance
                  </Typography>
                </Box>
                {summaryLoading || !summaryData ? (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      py: 3,
                    }}
                  >
                    <CircularProgress size={24} sx={{ mr: 2 }} />
                    <Typography variant="body2" color="text.secondary">
                      Calculating...
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <Typography
                      variant="h4"
                      fontWeight="bold"
                      sx={{ mb: 1 }}
                      color={
                        (summaryData.totalBalance || 0) >= 0
                          ? 'success.main'
                          : 'error.main'
                      }
                    >
                      {formatCurrency(
                        summaryData.totalBalance || 0,
                        summaryData.baseCurrency || 'USD'
                      )}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      in {summaryData.baseCurrency || 'USD'}
                    </Typography>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Per Currency Totals */}
          <Grid item xs={12} md={8}>
            <Card elevation={2}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <CurrencyExchangeIcon
                    sx={{ mr: 1, fontSize: 28, color: 'primary.main' }}
                  />
                  <Typography variant="h6" fontWeight="bold">
                    Balances by Currency
                  </Typography>
                </Box>
                {summaryLoading || !summaryData ? (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      py: 3,
                    }}
                  >
                    <CircularProgress size={24} sx={{ mr: 2 }} />
                    <Typography variant="body2" color="text.secondary">
                      Loading balances...
                    </Typography>
                  </Box>
                ) : (
                  <Grid container spacing={2}>
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
                          const balance = balances[account.account_id];
                          if (balance) {
                            const currency = account.currency;
                            if (!currencyGroups[currency]) {
                              currencyGroups[currency] = {
                                currency,
                                total: 0,
                                count: 0,
                              };
                            }
                            currencyGroups[currency].total +=
                              balance.current_balance || 0;
                            currencyGroups[currency].count += 1;
                          }
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
                        <Grid item xs={6} sm={4} key={group.currency}>
                          <Paper
                            elevation={0}
                            sx={{
                              p: 2,
                              borderRadius: 2,
                              backgroundColor: 'background.paper',
                              border: '1px solid',
                              borderColor: 'divider',
                              transition: 'all 0.2s',
                              '&:hover': {
                                borderColor: 'primary.main',
                                boxShadow: 2,
                              },
                            }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              display="block"
                              gutterBottom
                              fontWeight="medium"
                            >
                              {group.currency}
                            </Typography>
                            <Typography
                              variant="h6"
                              fontWeight="bold"
                              color={
                                group.total >= 0 ? 'success.main' : 'error.main'
                              }
                              sx={{ mb: 0.5 }}
                            >
                              {formatCurrency(group.total, group.currency)}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {group.count} account
                              {group.count !== 1 ? 's' : ''}
                            </Typography>
                          </Paper>
                        </Grid>
                      ));
                    })()}
                  </Grid>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {accounts.length === 0 ? (
        <Card>
          <CardContent>
            <Box sx={{ textAlign: 'center', py: 4 }}>
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
          {/* Mobile Card View */}
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            {accounts.map((account) => {
              const balance = balances[account.account_id];
              return (
                <Card key={account.account_id} sx={{ mb: 2 }}>
                  <CardContent>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        mb: 1.5,
                      }}
                    >
                      <Box sx={{ flex: 1 }}>
                        <Typography
                          variant="h6"
                          fontWeight="medium"
                          gutterBottom
                        >
                          {account.name}
                        </Typography>
                        <Box
                          sx={{
                            display: 'flex',
                            gap: 1,
                            flexWrap: 'wrap',
                            mb: 1,
                          }}
                        >
                          <Chip
                            label={account.type}
                            size="small"
                            variant="outlined"
                          />
                          <Chip
                            label={account.currency}
                            size="small"
                            variant="outlined"
                          />
                          <Chip
                            label={account.status}
                            color={getStatusColor(account.status)}
                            size="small"
                          />
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={() => handleOpenDialog(account)}
                          color="primary"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => setDeleteConfirm(account)}
                          color="error"
                          disabled={account.status === 'Closed'}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        pt: 1,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Opening Balance
                        </Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {formatCurrency(
                            account.opening_balance,
                            account.currency
                          )}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" color="text.secondary">
                          Current Balance
                        </Typography>
                        {balance ? (
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                            color={
                              balance.current_balance >= 0
                                ? 'success.main'
                                : 'error.main'
                            }
                          >
                            {formatCurrency(
                              balance.current_balance,
                              account.currency
                            )}
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Loading...
                          </Typography>
                        )}
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
                  const balance = balances[account.account_id];
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
                        {balance ? (
                          <Typography
                            variant="body1"
                            fontWeight="medium"
                            color={
                              balance.current_balance >= 0
                                ? 'success.main'
                                : 'error.main'
                            }
                          >
                            {formatCurrency(
                              balance.current_balance,
                              account.currency
                            )}
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Loading...
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={account.status}
                          color={getStatusColor(account.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => handleOpenDialog(account)}
                            color="primary"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={() => setDeleteConfirm(account)}
                            color="error"
                            disabled={account.status === 'Closed'}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
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
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
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
            <Button onClick={handleCloseDialog}>Cancel</Button>
            <Button type="submit" variant="contained">
              {editingAccount ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        fullScreen={isMobile}
      >
        <DialogTitle>Delete Account</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete{' '}
            <strong>{deleteConfirm?.name}</strong>?
          </Typography>
          <Alert severity="error" sx={{ mt: 2 }}>
            This action cannot be undone. You cannot delete accounts with
            existing transactions.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Accounts;
