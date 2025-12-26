import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import {
  Box,
  Button,
  Card,
  CardContent,
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
  Paper,
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
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';

function Settings() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { settings, loading, backgroundLoading, isInitialized, error } =
    useSelector((state) => state.settings);
  const { categories } = useSelector((state) => state.categories);
  const categoriesInitialized = useSelector(
    (state) => state.categories.isInitialized
  );
  const [openDialog, setOpenDialog] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

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

  // Load data on mount - only if not initialized
  useEffect(() => {
    if (!categoriesInitialized) {
      dispatch(fetchCategories({ status: 'Active' }));
    }
    if (!isInitialized) {
      dispatch(fetchSettings());
    }
  }, [dispatch, isInitialized, categoriesInitialized]);

  // Background refresh
  useEffect(() => {
    if (isInitialized && settings.length > 0) {
      const refreshInterval = setInterval(() => {
        dispatch(fetchSettings());
      }, 60000);
      return () => clearInterval(refreshInterval);
    }
  }, [dispatch, isInitialized, settings.length]);

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
      // Refresh in background
      dispatch(fetchSettings());
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
          mb: 3,
          gap: { xs: 2, sm: 0 },
        }}
      >
        <Typography
          variant="h4"
          sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}
        >
          Settings
        </Typography>
        <Button
          variant="contained"
          startIcon={<EditIcon />}
          onClick={handleOpenDialog}
          size="small"
        >
          Edit Settings
        </Button>
      </Box>

      {error && <ErrorMessage error={error} />}

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card elevation={2}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <SettingsIcon
                  sx={{ mr: 1, fontSize: 28, color: 'primary.main' }}
                />
                <Typography variant="h6" fontWeight="bold">
                  Application Settings
                </Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    mb: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                  >
                    Base Currency
                  </Typography>
                  <Typography variant="h6" fontWeight="medium">
                    {getSettingValue('BaseCurrency') || 'Not set'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Default currency for displaying totals and conversions
                  </Typography>
                </Paper>

                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    mb: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                  >
                    Borrowing Category
                  </Typography>
                  <Typography variant="h6" fontWeight="medium">
                    {getCategoryName(getSettingValue('BorrowingCategoryID'))}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Default category for borrowing transactions
                  </Typography>
                </Paper>

                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    mb: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                  >
                    Lending Category
                  </Typography>
                  <Typography variant="h6" fontWeight="medium">
                    {getCategoryName(getSettingValue('LendingCategoryID'))}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Default category for lending transactions
                  </Typography>
                </Paper>

                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    mb: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                  >
                    Borrowing Payment Category
                  </Typography>
                  <Typography variant="h6" fontWeight="medium">
                    {getCategoryName(
                      getSettingValue('BorrowingPaymentCategoryID')
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Category used when recording payments for borrowing
                  </Typography>
                </Paper>

                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                  >
                    Lending Payment Category
                  </Typography>
                  <Typography variant="h6" fontWeight="medium">
                    {getCategoryName(
                      getSettingValue('LendingPaymentCategoryID')
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Category used when recording payments for lending
                  </Typography>
                </Paper>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                About Settings
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Configure your application preferences here. These settings
                affect how your financial data is displayed and categorized.
              </Typography>
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  <strong>Base Currency:</strong> This is the primary currency
                  used for displaying totals and performing currency conversions
                  across all accounts.
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Borrowing/Lending Categories:</strong> These
                  categories are used as defaults when creating borrowing or
                  lending records from transactions.
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Payment Categories:</strong> These categories are used
                  when recording payments for borrowing (Expense) or lending
                  (Income) records.
                </Typography>
              </Alert>
            </CardContent>
          </Card>
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
            <Grid container spacing={2} sx={{ mt: 1 }}>
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
