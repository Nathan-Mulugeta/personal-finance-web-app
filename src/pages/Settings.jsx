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
  IconButton,
  Tooltip,
  Snackbar,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SettingsIcon from '@mui/icons-material/Settings';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
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
import { usePageRefresh } from '../hooks/usePageRefresh';
import { refreshAllData } from '../utils/refreshAllData';
import { persistor } from '../store';
import * as settingsApi from '../lib/api/settings';

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
  const accountsInitialized = useSelector(
    (state) => state.accounts.isInitialized
  );
  const [openDialog, setOpenDialog] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Quick-Add settings state
  const [quickAddAccountId, setQuickAddAccountId] = useState('');
  const [quickAddApiKey, setQuickAddApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isGeneratingApiKey, setIsGeneratingApiKey] = useState(false);
  const [isSavingQuickAdd, setIsSavingQuickAdd] = useState(false);
  const [quickAddError, setQuickAddError] = useState(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [shortcutCategoryId, setShortcutCategoryId] = useState('');

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
      borrowingCategoryId: '',
      lendingCategoryId: '',
      borrowingPaymentCategoryId: '',
      lendingPaymentCategoryId: '',
    },
  });

  const watchedBorrowingCategoryId = watch('borrowingCategoryId');
  const watchedLendingCategoryId = watch('lendingCategoryId');
  const watchedBorrowingPaymentCategoryId = watch('borrowingPaymentCategoryId');
  const watchedLendingPaymentCategoryId = watch('lendingPaymentCategoryId');

  // Refresh data on navigation
  usePageRefresh({
    dataTypes: ['settings', 'categories', 'accounts'],
    filters: {
      categories: { status: 'Active' },
    },
  });
  
  // Load accounts if not initialized
  useEffect(() => {
    if (!accountsInitialized) {
      dispatch(fetchAccounts());
    }
  }, [dispatch, accountsInitialized]);
  
  // Initialize quick-add settings from Redux state
  useEffect(() => {
    if (settings.length > 0) {
      const quickAddAccount = settings.find(
        (s) => s.setting_key === 'QuickAddDefaultAccountId'
      )?.setting_value || '';
      const apiKey = settings.find(
        (s) => s.setting_key === 'QuickAddApiKey'
      )?.setting_value || '';
      
      setQuickAddAccountId(quickAddAccount);
      setQuickAddApiKey(apiKey);
    }
  }, [settings]);

  // Initialize form with current settings
  useEffect(() => {
    if (settings.length > 0) {
      const baseCurrency =
        settings.find((s) => s.setting_key === 'BaseCurrency')?.setting_value ||
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

      // Refresh all data to ensure all pages have fresh data
      await refreshAllData(dispatch);
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
  
  // Get active accounts for quick-add dropdown
  const getActiveAccounts = () => {
    return accounts.filter((acc) => acc.status === 'Active');
  };
  
  // Get account name helper
  const getAccountName = (accountId) => {
    if (!accountId) return 'Not set';
    const account = accounts.find((acc) => acc.account_id === accountId);
    return account ? `${account.name} (${account.currency})` : 'Unknown';
  };
  
  // Handle quick-add default account change
  const handleQuickAddAccountChange = async (accountId) => {
    setIsSavingQuickAdd(true);
    setQuickAddError(null);
    try {
      await settingsApi.setQuickAddDefaultAccount(accountId);
      setQuickAddAccountId(accountId);
      // Refresh settings to sync Redux state
      dispatch(fetchSettings({ forceFull: true }));
      setSnackbarMessage('Default account updated');
      setSnackbarOpen(true);
    } catch (err) {
      console.error('Error saving quick-add account:', err);
      setQuickAddError(err?.message || 'Failed to save default account');
    } finally {
      setIsSavingQuickAdd(false);
    }
  };
  
  // Handle API key generation
  const handleGenerateApiKey = async () => {
    setIsGeneratingApiKey(true);
    setQuickAddError(null);
    try {
      const newApiKey = await settingsApi.generateQuickAddApiKey();
      setQuickAddApiKey(newApiKey);
      // Refresh settings to sync Redux state
      dispatch(fetchSettings({ forceFull: true }));
      setSnackbarMessage('API key generated');
      setSnackbarOpen(true);
    } catch (err) {
      console.error('Error generating API key:', err);
      setQuickAddError(err?.message || 'Failed to generate API key');
    } finally {
      setIsGeneratingApiKey(false);
    }
  };
  
  // Copy API key to clipboard
  const handleCopyApiKey = () => {
    if (quickAddApiKey) {
      navigator.clipboard.writeText(quickAddApiKey);
      setSnackbarMessage('API key copied to clipboard');
      setSnackbarOpen(true);
    }
  };
  
  // Get the quick-add shortcut URL
  const getShortcutUrl = () => {
    const baseUrl = `${window.location.origin}/quick-add`;
    if (shortcutCategoryId) {
      return `${baseUrl}?category=${shortcutCategoryId}`;
    }
    return baseUrl;
  };
  
  // Copy shortcut URL to clipboard
  const handleCopyShortcutUrl = () => {
    navigator.clipboard.writeText(getShortcutUrl());
    setSnackbarMessage('Shortcut URL copied to clipboard');
    setSnackbarOpen(true);
  };
  
  // Open shortcut URL in new tab
  const handleOpenShortcutUrl = () => {
    window.open(getShortcutUrl(), '_blank');
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
        <Box sx={{ display: 'flex', gap: 1, width: { xs: '100%', sm: 'auto' } }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon sx={{ fontSize: 18 }} />}
            onClick={handleManualRefresh}
            size="small"
            disabled={isRefreshing}
            sx={{ flex: { xs: '1 1 auto', sm: 'none' }, textTransform: 'none', minHeight: 36 }}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
          </Button>
          <Button
            variant="contained"
            startIcon={<EditIcon sx={{ fontSize: 18 }} />}
            onClick={handleOpenDialog}
            size="small"
            sx={{ flex: { xs: '1 1 auto', sm: 'none' }, textTransform: 'none', minHeight: 36 }}
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: { xs: 1.5, sm: 2 }, borderBottom: '1px solid', borderColor: 'divider', backgroundColor: 'action.hover' }}>
              <SettingsIcon sx={{ fontSize: { xs: 20, sm: 24 }, color: 'primary.main' }} />
              <Typography variant="h6" sx={{ fontSize: { xs: '0.9375rem', sm: '1.125rem' }, fontWeight: 600 }}>
                Application Settings
              </Typography>
            </Box>
            
            {/* Base Currency */}
            <Box sx={{ p: { xs: 1.5, sm: 2 }, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, mb: 0.5 }}>
                Base Currency
              </Typography>
              <Typography variant="body1" fontWeight={500} sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                {getSettingValue('BaseCurrency') || 'Not set'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}>
                Default currency for displaying totals and conversions
              </Typography>
            </Box>

            {/* Borrowing Category */}
            <Box sx={{ p: { xs: 1.5, sm: 2 }, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, mb: 0.5 }}>
                Borrowing Category
              </Typography>
              <Typography variant="body1" fontWeight={500} sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                {getCategoryName(getSettingValue('BorrowingCategoryID'))}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}>
                Default category for borrowing transactions
              </Typography>
            </Box>

            {/* Lending Category */}
            <Box sx={{ p: { xs: 1.5, sm: 2 }, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, mb: 0.5 }}>
                Lending Category
              </Typography>
              <Typography variant="body1" fontWeight={500} sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                {getCategoryName(getSettingValue('LendingCategoryID'))}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}>
                Default category for lending transactions
              </Typography>
            </Box>

            {/* Borrowing Payment Category */}
            <Box sx={{ p: { xs: 1.5, sm: 2 }, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, mb: 0.5 }}>
                Borrowing Payment Category
              </Typography>
              <Typography variant="body1" fontWeight={500} sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                {getCategoryName(getSettingValue('BorrowingPaymentCategoryID'))}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}>
                Category used when recording payments for borrowing
              </Typography>
            </Box>

            {/* Lending Payment Category */}
            <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, mb: 0.5 }}>
                Lending Payment Category
              </Typography>
              <Typography variant="body1" fontWeight={500} sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                {getCategoryName(getSettingValue('LendingPaymentCategoryID'))}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}>
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
            <Typography variant="h6" sx={{ fontSize: { xs: '0.9375rem', sm: '1.125rem' }, fontWeight: 600, mb: 1 }}>
              About Settings
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.8125rem', sm: '0.875rem' }, mb: 2 }}>
              Configure your application preferences here. These settings
              affect how your financial data is displayed and categorized.
            </Typography>
            <Alert severity="info" sx={{ '& .MuiAlert-message': { fontSize: { xs: '0.8125rem', sm: '0.875rem' } } }}>
              <Typography variant="body2" sx={{ fontSize: 'inherit' }}>
                <strong>Base Currency:</strong> This is the primary currency
                used for displaying totals and performing currency conversions
                across all accounts.
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, fontSize: 'inherit' }}>
                <strong>Borrowing/Lending Categories:</strong> These
                categories are used as defaults when creating borrowing or
                lending records from transactions.
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, fontSize: 'inherit' }}>
                <strong>Payment Categories:</strong> These categories are used
                when recording payments for borrowing (Expense) or lending
                (Income) records.
              </Typography>
            </Alert>
          </Box>
        </Grid>
        
        {/* Quick-Add Configuration */}
        <Grid item xs={12}>
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              backgroundColor: 'background.paper',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: { xs: 1.5, sm: 2 }, borderBottom: '1px solid', borderColor: 'divider', backgroundColor: 'action.hover' }}>
              <PhoneAndroidIcon sx={{ fontSize: { xs: 20, sm: 24 }, color: 'primary.main' }} />
              <Typography variant="h6" sx={{ fontSize: { xs: '0.9375rem', sm: '1.125rem' }, fontWeight: 600 }}>
                Quick-Add Configuration
              </Typography>
            </Box>
            
            {quickAddError && (
              <Alert severity="error" sx={{ m: 2 }} onClose={() => setQuickAddError(null)}>
                {quickAddError}
              </Alert>
            )}
            
            <Grid container>
              {/* Default Account */}
              <Grid item xs={12} md={6} sx={{ p: { xs: 1.5, sm: 2 }, borderBottom: { xs: '1px solid', md: 'none' }, borderRight: { md: '1px solid' }, borderColor: 'divider' }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, mb: 1 }}>
                  Default Account for Quick-Add
                </Typography>
                <FormControl fullWidth size="small">
                  <Select
                    value={quickAddAccountId}
                    onChange={(e) => handleQuickAddAccountChange(e.target.value)}
                    displayEmpty
                    disabled={isSavingQuickAdd}
                  >
                    <MenuItem value="">
                      <em>Not set</em>
                    </MenuItem>
                    {getActiveAccounts().map((account) => (
                      <MenuItem key={account.account_id} value={account.account_id}>
                        {account.name} ({account.currency})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}>
                  This account will be used when adding expenses via quick-add or mobile widgets.
                </Typography>
              </Grid>
              
              {/* API Key */}
              <Grid item xs={12} md={6} sx={{ p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, mb: 1 }}>
                  API Key (for Tasker/External Apps)
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    fullWidth
                    size="small"
                    value={quickAddApiKey ? (showApiKey ? quickAddApiKey : '••••••••••••••••') : 'Not generated'}
                    InputProps={{
                      readOnly: true,
                      sx: { fontFamily: 'monospace', fontSize: '0.875rem' },
                    }}
                  />
                  {quickAddApiKey && (
                    <>
                      <Tooltip title={showApiKey ? 'Hide API key' : 'Show API key'}>
                        <IconButton size="small" onClick={() => setShowApiKey(!showApiKey)}>
                          {showApiKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Copy to clipboard">
                        <IconButton size="small" onClick={handleCopyApiKey}>
                          <ContentCopyIcon />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}>
                    Use this key in Tasker or other apps to add expenses.
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleGenerateApiKey}
                    disabled={isGeneratingApiKey}
                    startIcon={isGeneratingApiKey ? <CircularProgress size={14} /> : <RefreshIcon sx={{ fontSize: 14 }} />}
                    sx={{ textTransform: 'none', minWidth: 'auto', ml: 1 }}
                  >
                    {quickAddApiKey ? 'Regenerate' : 'Generate'}
                  </Button>
                </Box>
              </Grid>
            </Grid>
            
            {/* Quick-Add Shortcut Generator */}
            <Box sx={{ p: { xs: 1.5, sm: 2 }, borderTop: '1px solid', borderColor: 'divider', backgroundColor: 'action.hover' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, mb: 1.5 }}>
                <strong>Create Shortcut:</strong> Select a category to generate a shortcut URL for your phone's home screen.
              </Typography>
              
              {/* Category Selector */}
              <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                <InputLabel>Category for Shortcut</InputLabel>
                <Select
                  value={shortcutCategoryId}
                  onChange={(e) => setShortcutCategoryId(e.target.value)}
                  label="Category for Shortcut"
                >
                  <MenuItem value="">
                    <em>No category (show all)</em>
                  </MenuItem>
                  {getExpenseCategories().map((category) => (
                    <MenuItem key={category.category_id} value={category.category_id}>
                      {category.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              {/* Generated URL with actions */}
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  fullWidth
                  size="small"
                  value={getShortcutUrl()}
                  InputProps={{
                    readOnly: true,
                    sx: { fontFamily: 'monospace', fontSize: { xs: '0.75rem', sm: '0.8125rem' } },
                  }}
                />
                <Tooltip title="Copy URL">
                  <IconButton size="small" onClick={handleCopyShortcutUrl}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Open in new tab">
                  <IconButton size="small" onClick={handleOpenShortcutUrl}>
                    <OpenInNewIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}>
                <strong>How to add to home screen:</strong> Open the URL in Chrome on your Android phone, tap the menu (⋮), then select "Add to Home Screen".
              </Typography>
            </Box>
          </Box>
        </Grid>
      </Grid>
      
      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
      />

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
                  <InputLabel>Borrowing Category (Optional)</InputLabel>
                  <Select
                    {...register('borrowingCategoryId')}
                    label="Borrowing Category (Optional)"
                    value={watchedBorrowingCategoryId || ''}
                    onChange={(e) =>
                      setValue('borrowingCategoryId', e.target.value || '')
                    }
                  >
                    <MenuItem value="">None</MenuItem>
                    {getIncomeCategories().map((category) => (
                      <MenuItem
                        key={category.category_id}
                        value={category.category_id}
                      >
                        {category.name}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    Default category for borrowing transactions (Income
                    categories only)
                  </FormHelperText>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Lending Category (Optional)</InputLabel>
                  <Select
                    {...register('lendingCategoryId')}
                    label="Lending Category (Optional)"
                    value={watchedLendingCategoryId || ''}
                    onChange={(e) =>
                      setValue('lendingCategoryId', e.target.value || '')
                    }
                  >
                    <MenuItem value="">None</MenuItem>
                    {getExpenseCategories().map((category) => (
                      <MenuItem
                        key={category.category_id}
                        value={category.category_id}
                      >
                        {category.name}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    Default category for lending transactions (Expense
                    categories only)
                  </FormHelperText>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Borrowing Payment Category (Optional)</InputLabel>
                  <Select
                    {...register('borrowingPaymentCategoryId')}
                    label="Borrowing Payment Category (Optional)"
                    value={watchedBorrowingPaymentCategoryId || ''}
                    onChange={(e) =>
                      setValue(
                        'borrowingPaymentCategoryId',
                        e.target.value || ''
                      )
                    }
                  >
                    <MenuItem value="">None</MenuItem>
                    {getExpenseCategories().map((category) => (
                      <MenuItem
                        key={category.category_id}
                        value={category.category_id}
                      >
                        {category.name}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    Category used when recording payments for borrowing (Expense
                    categories only)
                  </FormHelperText>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Lending Payment Category (Optional)</InputLabel>
                  <Select
                    {...register('lendingPaymentCategoryId')}
                    label="Lending Payment Category (Optional)"
                    value={watchedLendingPaymentCategoryId || ''}
                    onChange={(e) =>
                      setValue('lendingPaymentCategoryId', e.target.value || '')
                    }
                  >
                    <MenuItem value="">None</MenuItem>
                    {getIncomeCategories().map((category) => (
                      <MenuItem
                        key={category.category_id}
                        value={category.category_id}
                      >
                        {category.name}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    Category used when recording payments for lending (Income
                    categories only)
                  </FormHelperText>
                </FormControl>
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
