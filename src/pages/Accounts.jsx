import { useState, useMemo, Fragment } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Box,
  Button,
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
  Select,
  TextField,
  Typography,
  Chip,
  Collapse,
  Alert,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import {
  createAccount,
  updateAccount,
  deleteAccount,
  clearError,
  swapAccountOrder,
} from '../store/slices/accountsSlice';
import { accountSchema } from '../schemas/accountSchema';
import { ACCOUNT_TYPES, ACCOUNT_STATUSES } from '../lib/api/accounts';
import PageSkeleton from '../components/common/PageSkeleton';
import EmptyState from '../components/common/EmptyState';
import ErrorMessage from '../components/common/ErrorMessage';
import { formatCurrency, currencyLabel } from '../utils/currencyConversion';
import { usePageRefresh } from '../hooks/usePageRefresh';
import { getOutlinedStatusChipSx } from '../utils/chipStyles';
import { useAutoDismissError } from '../hooks/useAutoDismissError';

function Accounts() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { accounts, loading, error } = useSelector((state) => state.accounts);
  const { settings } = useSelector((state) => state.settings);
  const { exchangeRates } = useSelector((state) => state.exchangeRates);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [isReordering, setIsReordering] = useState(false);

  // Auto-dismiss errors after 8 seconds
  useAutoDismissError(setActionError, actionError);
  useAutoDismissError(setDeleteError, deleteError);

  // Sort accounts by sort_order
  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [accounts]);

  // Active accounts grouped by currency (manual sort order preserved);
  // section totals are per-currency originals, never conversions
  const currencyGroups = useMemo(() => {
    const groups = new Map();
    sortedAccounts
      .filter((account) => account.status === 'Active')
      .forEach((account) => {
        if (!groups.has(account.currency)) {
          groups.set(account.currency, {
            currency: account.currency,
            accounts: [],
            total: 0,
          });
        }
        const group = groups.get(account.currency);
        group.accounts.push(account);
        group.total += account.current_balance ?? account.opening_balance ?? 0;
      });
    return Array.from(groups.values());
  }, [sortedAccounts]);

  const inactiveAccounts = useMemo(
    () => sortedAccounts.filter((account) => account.status !== 'Active'),
    [sortedAccounts]
  );

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
      handleCloseDialog();
    } catch (err) {
      console.error('Error deleting account:', err);
      const errorMessage =
        err?.message || 'Failed to delete account. Please try again.';
      setDeleteError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  // Swap manual sort order of two adjacent accounts (within a currency group)
  const handleSwapOrder = async (accountA, accountB) => {
    if (!accountA || !accountB || isReordering) return;

    setIsReordering(true);
    try {
      await dispatch(
        swapAccountOrder({
          accountId1: accountA.account_id,
          accountId2: accountB.account_id,
        })
      ).unwrap();
    } catch (err) {
      console.error('Error reordering accounts:', err);
    } finally {
      setIsReordering(false);
    }
  };

  if (loading && accounts.length === 0) {
    return <PageSkeleton />;
  }

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: { xs: 1.5, sm: 2, md: 3 },
          gap: { xs: 1, sm: 0 },
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, fontWeight: 500 }}
          >
            Accounts
          </Typography>
          {summaryData && (
            <Typography
              variant="caption"
              sx={{ fontSize: '0.75rem', color: 'text.secondary' }}
            >
              Total:{' '}
              {formatCurrency(
                summaryData.totalBalance || 0,
                summaryData.baseCurrency || 'USD'
              )}
            </Typography>
          )}
        </Box>
        <IconButton
          onClick={() => handleOpenDialog()}
          aria-label="Add account"
          sx={{
            backgroundColor: 'primary.main',
            color: 'primary.contrastText',
            width: 36,
            height: 36,
            '&:hover': { backgroundColor: 'primary.dark' },
          }}
        >
          <AddIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

      {error && <ErrorMessage error={error} />}

      {accounts.length === 0 ? (
        <EmptyState
          icon={<AccountBalanceIcon />}
          title="No accounts yet"
          subtitle="Create your first account to start tracking your finances"
          action={
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog()}
            >
              Create Account
            </Button>
          }
        />
      ) : (
        (() => {
          const pressableSx = {
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            userSelect: 'none',
            '&:active': { backgroundColor: 'action.hover' },
            '@media (hover: hover)': {
              '&:hover': { backgroundColor: 'action.hover' },
            },
          };

          const renderAccountRow = (
            account,
            groupAccounts = null,
            index = -1,
            showStatus = false
          ) => {
            const currentBalance =
              account.current_balance ?? account.opening_balance ?? 0;
            return (
              <Box
                key={account.account_id}
                onClick={() => handleOpenDialog(account)}
                sx={{
                  py: 1,
                  pl: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  ...pressableSx,
                }}
              >
                <Box
                  sx={{
                    minWidth: 0,
                    flex: 1,
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 0.75,
                  }}
                >
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      minWidth: 0,
                    }}
                  >
                    {account.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      fontSize: '0.6875rem',
                      color: 'text.secondary',
                      flexShrink: 0,
                    }}
                  >
                    {account.type}
                  </Typography>
                  {showStatus && (
                    <Chip
                      label={account.status}
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 16,
                        fontSize: '0.625rem',
                        flexShrink: 0,
                        ...getOutlinedStatusChipSx(account.status),
                      }}
                    />
                  )}
                </Box>
                {groupAccounts && groupAccounts.length > 1 && (
                  <Box
                    sx={{ display: 'flex', flexShrink: 0 }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <IconButton
                      size="small"
                      onClick={() =>
                        handleSwapOrder(account, groupAccounts[index - 1])
                      }
                      disabled={index === 0 || isReordering}
                      sx={{ p: 0.25, color: 'text.disabled' }}
                    >
                      <KeyboardArrowUpIcon sx={{ fontSize: '0.9rem' }} />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() =>
                        handleSwapOrder(account, groupAccounts[index + 1])
                      }
                      disabled={
                        index === groupAccounts.length - 1 || isReordering
                      }
                      sx={{ p: 0.25, color: 'text.disabled' }}
                    >
                      <KeyboardArrowDownIcon sx={{ fontSize: '0.9rem' }} />
                    </IconButton>
                  </Box>
                )}
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    flexShrink: 0,
                    color: currentBalance < 0 ? 'google.red' : 'text.primary',
                  }}
                >
                  {formatCurrency(currentBalance, account.currency)}
                </Typography>
              </Box>
            );
          };

          return (
            <Box>
              {currencyGroups.map((group) => (
                <Fragment key={group.currency}>
                  <Box
                    sx={{
                      py: 1.25,
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 0.75,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography
                      sx={{ fontSize: '1.0625rem', fontWeight: 600 }}
                    >
                      {currencyLabel(group.currency)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.6875rem',
                        color: 'text.secondary',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      · {group.accounts.length} account
                      {group.accounts.length !== 1 ? 's' : ''}
                    </Typography>
                    <Typography
                      sx={{ fontSize: '1.0625rem', fontWeight: 600, flexShrink: 0 }}
                    >
                      {formatCurrency(group.total, group.currency)}
                    </Typography>
                  </Box>
                  {group.accounts.map((account, index) =>
                    renderAccountRow(account, group.accounts, index)
                  )}
                </Fragment>
              ))}
              {inactiveAccounts.length > 0 && (
                <>
                  <Box
                    onClick={() => setShowInactive((prev) => !prev)}
                    sx={{
                      py: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      ...pressableSx,
                    }}
                  >
                    <ExpandMoreIcon
                      sx={{
                        fontSize: 18,
                        color: 'text.secondary',
                        flexShrink: 0,
                        transform: showInactive ? 'none' : 'rotate(-90deg)',
                        transition: 'transform 0.15s ease-in-out',
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                        color: 'text.secondary',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      Inactive accounts
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.6875rem',
                        color: 'text.secondary',
                        flexShrink: 0,
                      }}
                    >
                      {inactiveAccounts.length}
                    </Typography>
                  </Box>
                  <Collapse in={showInactive}>
                    {inactiveAccounts.map((account) =>
                      renderAccountRow(account, null, -1, true)
                    )}
                  </Collapse>
                </>
              )}
            </Box>
          );
        })()
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
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
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
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
              }}
            >
              <Box>
                {editingAccount && (
                  <Button
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setDeleteConfirm(editingAccount)}
                    disabled={
                      isSubmitting || editingAccount.status === 'Closed'
                    }
                  >
                    Delete
                  </Button>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
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
              </Box>
            </Box>
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
            <Alert severity="error" sx={{ mt: 2 }} onClose={() => setDeleteError(null)}>
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
