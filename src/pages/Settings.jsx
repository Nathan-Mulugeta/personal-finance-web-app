import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormHelperText,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Alert,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SettingsIcon from '@mui/icons-material/Settings';
import {
  fetchSettings,
  updateSetting,
  updateSettings,
  clearError,
} from '../store/slices/settingsSlice';
import { fetchCategories } from '../store/slices/categoriesSlice';
import { fetchAccounts } from '../store/slices/accountsSlice';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import CategoryAutocomplete from '../components/common/CategoryAutocomplete';
import { usePageRefresh } from '../hooks/usePageRefresh';
import { persistor } from '../store';
import RefreshIcon from '@mui/icons-material/Refresh';

function Settings() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { settings, loading, backgroundLoading, isInitialized, error } =
    useSelector((state) => state.settings);
  const { categories } = useSelector((state) => state.categories);
  const { accounts } = useSelector((state) => state.accounts);
  const categoriesInitialized = useSelector(
    (state) => state.categories.isInitialized
  );
  const [openDialog, setOpenDialog] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm({
    defaultValues: {
      baseCurrency: '',
      defaultAccountId: '',
      geminiApiKey: '',
      borrowingCategoryId: '',
      lendingCategoryId: '',
      borrowingPaymentCategoryId: '',
      lendingPaymentCategoryId: '',
    },
  });

  const watchedDefaultAccountId = watch('defaultAccountId');
  const watchedGeminiApiKey = watch('geminiApiKey');
  const watchedBorrowingCategoryId = watch('borrowingCategoryId');
  const watchedLendingCategoryId = watch('lendingCategoryId');
  const watchedBorrowingPaymentCategoryId = watch('borrowingPaymentCategoryId');
  const watchedLendingPaymentCategoryId = watch('lendingPaymentCategoryId');

  // Refresh data on navigation
  usePageRefresh({
    dataTypes: ['settings', 'categories', 'accounts'],
    filters: {
      categories: { status: 'Active' },
      accounts: { status: 'Active' },
    },
  });

  // Initialize form with current settings
  useEffect(() => {
    if (settings.length > 0) {
      const baseCurrency =
        settings.find((s) => s.setting_key === 'BaseCurrency')?.setting_value ||
        '';
      const defaultAccountId =
        settings.find((s) => s.setting_key === 'DefaultAccountID')
          ?.setting_value || '';
      const geminiApiKey =
        settings.find((s) => s.setting_key === 'GeminiAPIKey')?.setting_value ||
        '';
      const borrowingCategoryId =
        settings.find((s) => s.setting_key === 'BorrowingCategoryID')
          ?.setting_value || '';
      const lendingCategoryId =
        settings.find((s) => s.setting_key === 'LendingCategoryID')
          ?.setting_value || '';
      const borrowingPaymentCategoryId =
        settings.find((s) => s.setting_key === 'BorrowingPaymentCategoryID')
          ?.setting_value || '';
      const lendingPaymentCategoryId =
        settings.find((s) => s.setting_key === 'LendingPaymentCategoryID')
          ?.setting_value || '';

      reset({
        baseCurrency,
        defaultAccountId,
        geminiApiKey,
        borrowingCategoryId,
        lendingCategoryId,
        borrowingPaymentCategoryId,
        lendingPaymentCategoryId,
      });
    }
  }, [settings, reset]);

  const handleOpenDialog = () => {
    setEditingKey(null);
    reset({
      baseCurrency:
        settings.find((s) => s.setting_key === 'BaseCurrency')?.setting_value ||
        '',
      defaultAccountId:
        settings.find((s) => s.setting_key === 'DefaultAccountID')
          ?.setting_value || '',
      geminiApiKey:
        settings.find((s) => s.setting_key === 'GeminiAPIKey')?.setting_value ||
        '',
      borrowingCategoryId:
        settings.find((s) => s.setting_key === 'BorrowingCategoryID')
          ?.setting_value || '',
      lendingCategoryId:
        settings.find((s) => s.setting_key === 'LendingCategoryID')
          ?.setting_value || '',
      borrowingPaymentCategoryId:
        settings.find((s) => s.setting_key === 'BorrowingPaymentCategoryID')
          ?.setting_value || '',
      lendingPaymentCategoryId:
        settings.find((s) => s.setting_key === 'LendingPaymentCategoryID')
          ?.setting_value || '',
    });
    setActionError(null);
    setIsSubmitting(false);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingKey(null);
    setActionError(null);
    setIsSubmitting(false);
    dispatch(clearError());
  };

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const updates = {};
      if (data.baseCurrency) {
        updates.BaseCurrency = data.baseCurrency.toUpperCase();
      }
      if (data.defaultAccountId) {
        updates.DefaultAccountID = data.defaultAccountId;
      } else {
        updates.DefaultAccountID = '';
      }
      // Always save geminiApiKey (even if empty to clear it)
      updates.GeminiAPIKey = data.geminiApiKey || '';
      if (data.borrowingCategoryId) {
        updates.BorrowingCategoryID = data.borrowingCategoryId;
      } else {
        updates.BorrowingCategoryID = '';
      }
      if (data.lendingCategoryId) {
        updates.LendingCategoryID = data.lendingCategoryId;
      } else {
        updates.LendingCategoryID = '';
      }
      if (data.borrowingPaymentCategoryId) {
        updates.BorrowingPaymentCategoryID = data.borrowingPaymentCategoryId;
      } else {
        updates.BorrowingPaymentCategoryID = '';
      }
      if (data.lendingPaymentCategoryId) {
        updates.LendingPaymentCategoryID = data.lendingPaymentCategoryId;
      } else {
        updates.LendingPaymentCategoryID = '';
      }

      await dispatch(updateSettings(updates)).unwrap();
      handleCloseDialog();
    } catch (err) {
      console.error('Error updating settings:', err);
      const errorMessage =
        err?.message || 'Failed to update settings. Please try again.';
      setActionError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get setting value helper
  const getSettingValue = (key) => {
    const setting = settings.find((s) => s.setting_key === key);
    return setting?.setting_value || '';
  };

  // Get category name helper
  const getCategoryName = (categoryId) => {
    if (!categoryId) return 'Not set';
    const category = categories.find((cat) => cat.category_id === categoryId);
    return category?.name || 'Unknown';
  };

  // Get account name helper
  const getAccountName = (accountId) => {
    if (!accountId) return 'Not set';
    const account = accounts.find((acc) => acc.account_id === accountId);
    return account ? `${account.name} (${account.currency})` : 'Unknown';
  };

  // Get income categories for borrowing (money coming in)
  const getIncomeCategories = () => {
    return categories.filter(
      (cat) => cat.type === 'Income' && cat.status === 'Active'
    );
  };

  // Get expense categories for lending (money going out)
  const getExpenseCategories = () => {
    return categories.filter(
      (cat) => cat.type === 'Expense' && cat.status === 'Active'
    );
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setActionError(null);
    try {
      // Purge persisted storage using redux-persist
      await persistor.purge();

      // Reload the page to rehydrate with empty state and fetch fresh data
      // This ensures all Redux state is reset properly
      window.location.reload();
    } catch (err) {
      console.error('Error refreshing data:', err);
      const errorMessage =
        err?.message || 'Failed to refresh data. Please try again.';
      setActionError(errorMessage);
      setIsRefreshing(false);
    }
  };

  if (loading && settings.length === 0) {
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
          gap: { xs: 1.5, sm: 0 },
        }}
      >
        <Typography
          variant="h4"
          sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, fontWeight: 500 }}
        >
          Settings
        </Typography>
        <Box
          sx={{ display: 'flex', gap: 1, width: { xs: '100%', sm: 'auto' } }}
        >
          <Button
            variant="outlined"
            startIcon={<RefreshIcon sx={{ fontSize: 18 }} />}
            onClick={handleManualRefresh}
            size="small"
            disabled={isRefreshing}
            sx={{
              flex: { xs: '1 1 auto', sm: 'none' },
              textTransform: 'none',
              minHeight: 36,
            }}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
          </Button>
          <Button
            variant="contained"
            startIcon={<EditIcon sx={{ fontSize: 18 }} />}
            onClick={handleOpenDialog}
            size="small"
            sx={{
              flex: { xs: '1 1 auto', sm: 'none' },
              textTransform: 'none',
              minHeight: 36,
            }}
          >
            Edit Settings
          </Button>
        </Box>
      </Box>

      {error && <ErrorMessage error={error} />}

      <Grid container spacing={{ xs: 2, sm: 3 }}>
        <Grid item xs={12} md={6}>
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              backgroundColor: 'background.paper',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: { xs: 1.5, sm: 2 },
                borderBottom: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'action.hover',
              }}
            >
              <SettingsIcon
                sx={{ fontSize: { xs: 20, sm: 24 }, color: 'primary.main' }}
              />
              <Typography
                variant="h6"
                sx={{
                  fontSize: { xs: '0.9375rem', sm: '1.125rem' },
                  fontWeight: 600,
                }}
              >
                Application Settings
              </Typography>
            </Box>

            {/* Base Currency */}
            <Box
              sx={{
                p: { xs: 1.5, sm: 2 },
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, mb: 0.5 }}
              >
                Base Currency
              </Typography>
              <Typography
                variant="body1"
                fontWeight={500}
                sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
              >
                {getSettingValue('BaseCurrency') || 'Not set'}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}
              >
                Default currency for displaying totals and conversions
              </Typography>
            </Box>

            {/* Default Account */}
            <Box
              sx={{
                p: { xs: 1.5, sm: 2 },
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, mb: 0.5 }}
              >
                Default Account
              </Typography>
              <Typography
                variant="body1"
                fontWeight={500}
                sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
              >
                {getAccountName(getSettingValue('DefaultAccountID'))}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}
              >
                Account auto-selected when creating new transactions
              </Typography>
            </Box>

            {/* Gemini API Key */}
            <Box
              sx={{
                p: { xs: 1.5, sm: 2 },
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, mb: 0.5 }}
              >
                Gemini API Key
              </Typography>
              <Typography
                variant="body1"
                fontWeight={500}
                sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
              >
                {getSettingValue('GeminiAPIKey')
                  ? '••••••••' + getSettingValue('GeminiAPIKey').slice(-4)
                  : 'Not set'}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}
              >
                Required for AI receipt scanning and natural language parsing
              </Typography>
            </Box>

            {/* Borrowing Category */}
            <Box
              sx={{
                p: { xs: 1.5, sm: 2 },
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, mb: 0.5 }}
              >
                Borrowing Category
              </Typography>
              <Typography
                variant="body1"
                fontWeight={500}
                sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
              >
                {getCategoryName(getSettingValue('BorrowingCategoryID'))}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}
              >
                Default category for borrowing transactions
              </Typography>
            </Box>

            {/* Lending Category */}
            <Box
              sx={{
                p: { xs: 1.5, sm: 2 },
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, mb: 0.5 }}
              >
                Lending Category
              </Typography>
              <Typography
                variant="body1"
                fontWeight={500}
                sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
              >
                {getCategoryName(getSettingValue('LendingCategoryID'))}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}
              >
                Default category for lending transactions
              </Typography>
            </Box>

            {/* Borrowing Payment Category */}
            <Box
              sx={{
                p: { xs: 1.5, sm: 2 },
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, mb: 0.5 }}
              >
                Borrowing Payment Category
              </Typography>
              <Typography
                variant="body1"
                fontWeight={500}
                sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
              >
                {getCategoryName(getSettingValue('BorrowingPaymentCategoryID'))}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}
              >
                Category used when recording payments for borrowing
              </Typography>
            </Box>

            {/* Lending Payment Category */}
            <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, mb: 0.5 }}
              >
                Lending Payment Category
              </Typography>
              <Typography
                variant="body1"
                fontWeight={500}
                sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
              >
                {getCategoryName(getSettingValue('LendingPaymentCategoryID'))}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}
              >
                Category used when recording payments for lending
              </Typography>
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12} md={6}>
          <Box
            sx={{
              p: { xs: 1.5, sm: 2 },
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              backgroundColor: 'background.paper',
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontSize: { xs: '0.9375rem', sm: '1.125rem' },
                fontWeight: 600,
                mb: 1,
              }}
            >
              About Settings
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: { xs: '0.8125rem', sm: '0.875rem' }, mb: 2 }}
            >
              Configure your application preferences here. These settings affect
              how your financial data is displayed and categorized.
            </Typography>
            <Alert
              severity="info"
              sx={{
                '& .MuiAlert-message': {
                  fontSize: { xs: '0.8125rem', sm: '0.875rem' },
                },
              }}
            >
              <Typography variant="body2" sx={{ fontSize: 'inherit' }}>
                <strong>Base Currency:</strong> This is the primary currency
                used for displaying totals and performing currency conversions
                across all accounts.
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, fontSize: 'inherit' }}>
                <strong>Borrowing/Lending Categories:</strong> These categories
                are used as defaults when creating borrowing or lending records
                from transactions.
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, fontSize: 'inherit' }}>
                <strong>Payment Categories:</strong> These categories are used
                when recording payments for borrowing (Expense) or lending
                (Income) records.
              </Typography>
            </Alert>
          </Box>
        </Grid>
      </Grid>

      {/* Edit Settings Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogTitle>Edit Settings</DialogTitle>
          <DialogContent>
            {actionError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {actionError}
              </Alert>
            )}
            <Grid container spacing={2} sx={{ mt: { xs: 0.5, sm: 1 } }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Base Currency (ISO Code) *"
                  {...register('baseCurrency', {
                    required: 'Base currency is required',
                    minLength: {
                      value: 3,
                      message: 'Currency must be a 3-letter ISO code',
                    },
                    maxLength: {
                      value: 3,
                      message: 'Currency must be a 3-letter ISO code',
                    },
                  })}
                  error={!!errors.baseCurrency}
                  helperText={
                    errors.baseCurrency?.message || 'e.g., USD, EUR, ETB'
                  }
                  inputProps={{
                    maxLength: 3,
                    style: { textTransform: 'uppercase' },
                  }}
                  onChange={(e) => {
                    setValue('baseCurrency', e.target.value.toUpperCase());
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Default Account (Optional)</InputLabel>
                  <Select
                    value={watchedDefaultAccountId || ''}
                    label="Default Account (Optional)"
                    onChange={(e) =>
                      setValue('defaultAccountId', e.target.value)
                    }
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
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
                  <FormHelperText>
                    Account auto-selected when creating new transactions
                  </FormHelperText>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Gemini API Key (Optional)"
                  type="password"
                  {...register('geminiApiKey')}
                  helperText={
                    <span>
                      Get a free API key from{' '}
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'inherit' }}
                      >
                        Google AI Studio
                      </a>
                      . Required for AI features.
                    </span>
                  }
                />
              </Grid>
              <Grid item xs={12}>
                <CategoryAutocomplete
                  categories={getIncomeCategories()}
                  value={watchedBorrowingCategoryId || ''}
                  onChange={(id) => setValue('borrowingCategoryId', id || '')}
                  label="Borrowing Category (Optional)"
                  helperText="Default category for borrowing transactions (Income categories only)"
                />
              </Grid>
              <Grid item xs={12}>
                <CategoryAutocomplete
                  categories={getExpenseCategories()}
                  value={watchedLendingCategoryId || ''}
                  onChange={(id) => setValue('lendingCategoryId', id || '')}
                  label="Lending Category (Optional)"
                  helperText="Default category for lending transactions (Expense categories only)"
                />
              </Grid>
              <Grid item xs={12}>
                <CategoryAutocomplete
                  categories={getExpenseCategories()}
                  value={watchedBorrowingPaymentCategoryId || ''}
                  onChange={(id) =>
                    setValue('borrowingPaymentCategoryId', id || '')
                  }
                  label="Borrowing Payment Category (Optional)"
                  helperText="Category used when recording payments for borrowing (Expense categories only)"
                />
              </Grid>
              <Grid item xs={12}>
                <CategoryAutocomplete
                  categories={getIncomeCategories()}
                  value={watchedLendingPaymentCategoryId || ''}
                  onChange={(id) =>
                    setValue('lendingPaymentCategoryId', id || '')
                  }
                  label="Lending Payment Category (Optional)"
                  helperText="Category used when recording payments for lending (Income categories only)"
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
              startIcon={
                isSubmitting ? (
                  <CircularProgress size={20} color="inherit" />
                ) : null
              }
            >
              {isSubmitting ? 'Saving...' : 'Save Settings'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}

export default Settings;
