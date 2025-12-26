import { useEffect, useState, useMemo, Fragment } from 'react';
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
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Tooltip,
  Alert,
  Collapse,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import FilterListIcon from '@mui/icons-material/FilterList';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  fetchBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  clearError,
} from '../store/slices/budgetsSlice';
import {
  fetchCategories,
  fetchCategoryTree,
} from '../store/slices/categoriesSlice';
import { budgetSchema } from '../schemas/budgetSchema';
import { BUDGET_STATUSES } from '../lib/api/budgets';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import {
  formatCurrency,
  convertAmountWithExchangeRates,
} from '../utils/currencyConversion';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';

function Budgets() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { budgets, loading, backgroundLoading, isInitialized, error } =
    useSelector((state) => state.budgets);
  const { categories } = useSelector((state) => state.categories);
  const { allTransactions } = useSelector((state) => state.transactions);
  const { settings } = useSelector((state) => state.settings);
  const { exchangeRates } = useSelector((state) => state.exchangeRates);
  const appInitialized = useSelector((state) => state.appInit.isInitialized);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(
    format(new Date(), 'yyyy-MM')
  );
  const [filters, setFilters] = useState({
    categoryId: '',
    currency: '',
    status: 'Active',
  });
  const [expandedParents, setExpandedParents] = useState(new Set());
  const [expandedTypes, setExpandedTypes] = useState({
    oneTime: false,
    recurring: false,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      categoryId: '',
      currency: 'USD',
      amount: '',
      month: format(new Date(), 'yyyy-MM'),
      recurring: false,
      startMonth: format(new Date(), 'yyyy-MM'),
      endMonth: '',
      notes: '',
      status: 'Active',
    },
  });

  const watchedRecurring = watch('recurring');
  const watchedStatus = watch('status');
  const watchedCategoryId = watch('categoryId');

  const categoriesInitialized = useSelector(
    (state) => state.categories.isInitialized
  );
  const transactionsInitialized = useSelector(
    (state) => state.transactions.isInitialized
  );

  // Load data on mount - only if not initialized
  useEffect(() => {
    if (!categoriesInitialized) {
      dispatch(fetchCategories({ status: 'Active' }));
      dispatch(fetchCategoryTree({ status: 'Active' }));
    }
    if (!isInitialized) {
      dispatch(fetchBudgets({}));
    }
  }, [dispatch, isInitialized, categoriesInitialized]);

  // Background refresh
  useEffect(() => {
    if (isInitialized && budgets.length > 0) {
      const refreshInterval = setInterval(() => {
        dispatch(fetchBudgets({}));
      }, 60000);
      return () => clearInterval(refreshInterval);
    }
  }, [dispatch, isInitialized, budgets.length]);

  // Auto-set currency from category when category is selected
  useEffect(() => {
    if (watchedCategoryId) {
      const category = categories.find(
        (cat) => cat.category_id === watchedCategoryId
      );
      if (category) {
        // Try to get currency from settings or default to USD
        const baseCurrency =
          settings.find((s) => s.setting_key === 'BaseCurrency')
            ?.setting_value || 'USD';
        setValue('currency', baseCurrency);
      }
    }
  }, [watchedCategoryId, categories, settings, setValue]);

  // Calculate actual spending for a budget
  const calculateActualSpending = (budget) => {
    if (!allTransactions || allTransactions.length === 0) return 0;

    const budgetMonth = budget.month
      ? parseISO(
          `${budget.month.split('-')[0]}-${budget.month.split('-')[1]}-01`
        )
      : null;
    const startMonthDate = budget.start_month
      ? parseISO(
          `${budget.start_month.split('-')[0]}-${
            budget.start_month.split('-')[1]
          }-01`
        )
      : null;

    let relevantTransactions = allTransactions.filter((txn) => {
      // Must match category and currency
      if (
        txn.category_id !== budget.category_id ||
        txn.currency !== budget.currency
      ) {
        return false;
      }

      // Must be expense or transfer out
      if (txn.type !== 'Expense' && txn.type !== 'Transfer Out') {
        return false;
      }

      // Must not be cancelled
      if (txn.status === 'Cancelled' || txn.deleted_at) {
        return false;
      }

      // Check date range based on budget type
      if (budget.recurring) {
        // Recurring budget: check if transaction date is within start_month and end_month (if set)
        if (startMonthDate) {
          const txnDate = parseISO(txn.date);
          if (txnDate < startOfMonth(startMonthDate)) {
            return false;
          }
          if (budget.end_month) {
            const endMonthDate = parseISO(
              `${budget.end_month.split('-')[0]}-${
                budget.end_month.split('-')[1]
              }-01`
            );
            if (txnDate > endOfMonth(endMonthDate)) {
              return false;
            }
          }
        }
      } else {
        // Non-recurring budget: check if transaction date is in the budget month
        if (budgetMonth) {
          const txnDate = parseISO(txn.date);
          if (
            txnDate < startOfMonth(budgetMonth) ||
            txnDate > endOfMonth(budgetMonth)
          ) {
            return false;
          }
        }
      }

      return true;
    });

    // Sum up the absolute amounts
    return relevantTransactions.reduce(
      (sum, txn) => sum + Math.abs(txn.amount || 0),
      0
    );
  };

  // Filter budgets client-side
  const filteredBudgets = useMemo(() => {
    let filtered = [...budgets];

    // Filter by selected month
    if (selectedMonth) {
      const [year, monthNum] = selectedMonth.split('-');
      const monthDate = `${year}-${monthNum}-06`;

      filtered = filtered.filter((budget) => {
        if (budget.recurring) {
          // Recurring: check if selected month is within start_month and end_month
          if (budget.start_month) {
            const startDate = parseISO(budget.start_month);
            const selectedDate = parseISO(monthDate);
            if (selectedDate < startOfMonth(startDate)) {
              return false;
            }
            if (budget.end_month) {
              const endDate = parseISO(budget.end_month);
              if (selectedDate > endOfMonth(endDate)) {
                return false;
              }
            }
          }
          return true;
        } else {
          // Non-recurring: check if month matches
          return budget.month === monthDate;
        }
      });
    }

    if (filters.categoryId) {
      filtered = filtered.filter((b) => b.category_id === filters.categoryId);
    }
    if (filters.currency) {
      filtered = filtered.filter((b) => b.currency === filters.currency);
    }
    if (filters.status) {
      filtered = filtered.filter((b) => b.status === filters.status);
    }

    // Sort by created_at descending
    filtered.sort((a, b) => {
      const dateA = a.created_at ? parseISO(a.created_at) : new Date(0);
      const dateB = b.created_at ? parseISO(b.created_at) : new Date(0);
      return dateB - dateA;
    });

    return filtered;
  }, [budgets, selectedMonth, filters]);

  // Calculate budget statistics
  const budgetStats = useMemo(() => {
    const baseCurrency =
      settings.find((s) => s.setting_key === 'BaseCurrency')?.setting_value ||
      'USD';

    const stats = {
      totalBudget: 0,
      totalSpent: 0,
      totalRemaining: 0,
      overBudget: 0,
      baseCurrency,
    };

    filteredBudgets.forEach((budget) => {
      const actualSpending = calculateActualSpending(budget);
      const budgetAmount = parseFloat(budget.amount || 0);
      const remaining = budgetAmount - actualSpending;
      const budgetCurrency = budget.currency || 'USD';

      // Convert amounts to base currency
      const convertedBudgetAmount = convertAmountWithExchangeRates(
        budgetAmount,
        budgetCurrency,
        baseCurrency,
        exchangeRates
      );
      const convertedActualSpending = convertAmountWithExchangeRates(
        actualSpending,
        budgetCurrency,
        baseCurrency,
        exchangeRates
      );
      const convertedRemaining =
        convertedBudgetAmount !== null && convertedActualSpending !== null
          ? convertedBudgetAmount - convertedActualSpending
          : remaining;

      // Use converted amounts if available, otherwise use original
      stats.totalBudget +=
        convertedBudgetAmount !== null ? convertedBudgetAmount : budgetAmount;
      stats.totalSpent +=
        convertedActualSpending !== null
          ? convertedActualSpending
          : actualSpending;
      stats.totalRemaining += convertedRemaining;
      if (convertedRemaining < 0) {
        stats.overBudget += Math.abs(convertedRemaining);
      }
    });

    return stats;
  }, [filteredBudgets, allTransactions, settings, exchangeRates]);

  const handleOpenDialog = (budget = null) => {
    if (budget) {
      setEditingBudget(budget);
      reset({
        categoryId: budget.category_id,
        currency: budget.currency,
        amount: budget.amount,
        month: budget.month
          ? `${budget.month.split('-')[0]}-${budget.month.split('-')[1]}`
          : format(new Date(), 'yyyy-MM'),
        recurring: budget.recurring,
        startMonth: budget.start_month
          ? `${budget.start_month.split('-')[0]}-${
              budget.start_month.split('-')[1]
            }`
          : format(new Date(), 'yyyy-MM'),
        endMonth: budget.end_month
          ? `${budget.end_month.split('-')[0]}-${
              budget.end_month.split('-')[1]
            }`
          : '',
        notes: budget.notes || '',
        status: budget.status,
      });
    } else {
      setEditingBudget(null);
      reset({
        categoryId: '',
        currency:
          settings.find((s) => s.setting_key === 'BaseCurrency')
            ?.setting_value || 'USD',
        amount: '',
        month: selectedMonth,
        recurring: false,
        startMonth: selectedMonth,
        endMonth: '',
        notes: '',
        status: 'Active',
      });
    }
    setActionError(null);
    setIsSubmitting(false);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingBudget(null);
    setActionError(null);
    setIsSubmitting(false);
    reset();
    dispatch(clearError());
  };

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      // Clean up data: convert empty strings to null for optional fields
      const cleanedData = {
        ...data,
        endMonth:
          data.endMonth && data.endMonth.trim() !== '' ? data.endMonth : null,
        month: data.month && data.month.trim() !== '' ? data.month : null,
        startMonth:
          data.startMonth && data.startMonth.trim() !== ''
            ? data.startMonth
            : null,
        notes: data.notes && data.notes.trim() !== '' ? data.notes : '',
      };

      const budgetData = {
        categoryId: cleanedData.categoryId,
        currency: cleanedData.currency.toUpperCase(),
        amount: parseFloat(cleanedData.amount),
        recurring: cleanedData.recurring,
        notes: cleanedData.notes,
        status: cleanedData.status,
      };

      if (cleanedData.recurring) {
        budgetData.startMonth = cleanedData.startMonth;
        budgetData.endMonth = cleanedData.endMonth || null; // Allow null for non-ending budgets
      } else {
        // For one-time budgets, ensure month is set
        if (!cleanedData.month) {
          setActionError('Month is required for one-time budgets');
          setIsSubmitting(false);
          return;
        }
        budgetData.month = cleanedData.month;
      }

      if (editingBudget) {
        await dispatch(
          updateBudget({
            budgetId: editingBudget.budget_id,
            updates: budgetData,
          })
        ).unwrap();
      } else {
        await dispatch(createBudget(budgetData)).unwrap();
      }
      handleCloseDialog();
      // Refresh in background
      dispatch(fetchBudgets({}));
    } catch (err) {
      console.error('Error saving budget:', err);
      const errorMessage =
        err?.message || 'Failed to save budget. Please try again.';
      setActionError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingBudget) return;

    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await dispatch(deleteBudget(editingBudget.budget_id)).unwrap();
      setDeleteConfirm(null);
      setDeleteError(null);
      handleCloseDialog();
      // Refresh in background
      dispatch(fetchBudgets({}));
    } catch (err) {
      console.error('Error deleting budget:', err);
      const errorMessage =
        err?.message || 'Failed to delete budget. Please try again.';
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
      categoryId: '',
      currency: '',
      status: 'Active',
    });
  };

  // Get category name helper
  const getCategoryName = (categoryId) => {
    const category = categories.find((cat) => cat.category_id === categoryId);
    return category?.name || 'Unknown';
  };

  // Get category by ID
  const getCategory = (categoryId) => {
    return categories.find((cat) => cat.category_id === categoryId);
  };

  // Organize budgets by category hierarchy
  const organizeBudgetsByCategory = useMemo(() => {
    const categoryMap = new Map();
    categories.forEach((cat) => categoryMap.set(cat.category_id, cat));

    return (budgetsToOrganize) => {
      const grouped = {};

      budgetsToOrganize.forEach((budget) => {
        const category = categoryMap.get(budget.category_id);
        if (!category) return;

        // Determine parent ID: use parent_category_id if exists, otherwise use category_id for root categories
        const parentId = category.parent_category_id || category.category_id;

        if (!grouped[parentId]) {
          if (category.parent_category_id) {
            // Has parent - group under parent
            const parentCategory = categoryMap.get(category.parent_category_id);
            grouped[parentId] = {
              parent: parentCategory,
              subcategories: {},
              totalAmount: 0,
            };
          } else {
            // Root category - group by itself (parent is the category itself)
            grouped[parentId] = {
              parent: category,
              subcategories: {},
              totalAmount: 0,
            };
          }
        }

        // Group by subcategory (the actual category with the budget)
        const subcategoryId = category.category_id;
        if (!grouped[parentId].subcategories[subcategoryId]) {
          grouped[parentId].subcategories[subcategoryId] = {
            category: category,
            budgets: [],
            totalAmount: 0,
          };
        }

        const budgetAmount = parseFloat(budget.amount || 0);
        grouped[parentId].subcategories[subcategoryId].budgets.push(budget);
        grouped[parentId].subcategories[subcategoryId].totalAmount +=
          budgetAmount;
        grouped[parentId].totalAmount += budgetAmount;
      });

      return grouped;
    };
  }, [categories]);

  // Separate budgets by type and organize by category
  const organizedBudgets = useMemo(() => {
    const oneTimeBudgets = filteredBudgets.filter((b) => !b.recurring);
    const recurringBudgets = filteredBudgets.filter((b) => b.recurring);

    return {
      oneTime: organizeBudgetsByCategory(oneTimeBudgets),
      recurring: organizeBudgetsByCategory(recurringBudgets),
    };
  }, [filteredBudgets, organizeBudgetsByCategory]);

  // Toggle parent category expansion
  const toggleParentExpansion = (parentId) => {
    setExpandedParents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(parentId)) {
        newSet.delete(parentId);
      } else {
        newSet.add(parentId);
      }
      return newSet;
    });
  };

  // Toggle type section expansion
  const toggleTypeExpansion = (type) => {
    setExpandedTypes((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  // Handle row click to edit
  const handleRowClick = (budget) => {
    handleOpenDialog(budget);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active':
        return 'success';
      case 'Archived':
        return 'default';
      default:
        return 'default';
    }
  };

  if (loading && budgets.length === 0) {
    return <LoadingSpinner />;
  }

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== '' && v !== 'Active'
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
          Budgets
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
            onClick={() => handleOpenDialog()}
            size="small"
            sx={{ flex: { xs: '1 1 auto', sm: 'none' } }}
          >
            Add Budget
          </Button>
        </Box>
      </Box>

      {error && <ErrorMessage error={error} />}

      {/* Month Selector */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                type="month"
                label="View Budgets For Month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={8}>
              <Typography variant="body2" color="text.secondary">
                Select a month to view budgets and spending for that period
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {filteredBudgets.length > 0 && (
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={2}>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Total Budget
                </Typography>
                <Typography variant="h5" fontWeight="bold">
                  {formatCurrency(
                    budgetStats.totalBudget,
                    budgetStats.baseCurrency
                  )}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={2}>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Total Spent
                </Typography>
                <Typography
                  variant="h5"
                  fontWeight="bold"
                  sx={{
                    color:
                      budgetStats.totalSpent > budgetStats.totalBudget
                        ? 'softRed.main'
                        : 'softGreen.main',
                  }}
                >
                  {formatCurrency(
                    budgetStats.totalSpent,
                    budgetStats.baseCurrency
                  )}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={2}>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Remaining
                </Typography>
                <Typography
                  variant="h5"
                  fontWeight="bold"
                  sx={{
                    color:
                      budgetStats.totalRemaining >= 0
                        ? 'softGreen.main'
                        : 'softRed.main',
                  }}
                >
                  {formatCurrency(
                    budgetStats.totalRemaining,
                    budgetStats.baseCurrency
                  )}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={2}>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Over Budget
                </Typography>
                <Typography
                  variant="h5"
                  fontWeight="bold"
                  sx={{
                    color:
                      budgetStats.overBudget > 0
                        ? 'softRed.main'
                        : 'text.secondary',
                  }}
                >
                  {formatCurrency(
                    budgetStats.overBudget,
                    budgetStats.baseCurrency
                  )}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Filters Section */}
      <Collapse in={filtersOpen}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6} md={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={filters.categoryId}
                    label="Category"
                    onChange={(e) =>
                      handleFilterChange('categoryId', e.target.value)
                    }
                  >
                    <MenuItem value="">All Categories</MenuItem>
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
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Currency"
                  value={filters.currency}
                  onChange={(e) =>
                    handleFilterChange('currency', e.target.value.toUpperCase())
                  }
                  inputProps={{
                    maxLength: 3,
                    style: { textTransform: 'uppercase' },
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filters.status}
                    label="Status"
                    onChange={(e) =>
                      handleFilterChange('status', e.target.value)
                    }
                  >
                    {BUDGET_STATUSES.map((status) => (
                      <MenuItem key={status} value={status}>
                        {status}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
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

      {filteredBudgets.length === 0 ? (
        <Card>
          <CardContent>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <AccountBalanceWalletIcon
                sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }}
              />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No budgets yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Create your first budget to track your spending
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenDialog()}
              >
                Create Budget
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Box>
          {/* Mobile Card View */}
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            {/* Helper function to render a budget card */}
            {(() => {
              const renderBudgetCard = (budget) => {
                const actualSpending = calculateActualSpending(budget);
                const budgetAmount = parseFloat(budget.amount || 0);
                const percentage =
                  budgetAmount > 0 ? (actualSpending / budgetAmount) * 100 : 0;
                const remaining = budgetAmount - actualSpending;

                return (
                  <Card
                    key={budget.budget_id}
                    sx={{ mb: 2, cursor: 'pointer' }}
                    onClick={() => handleRowClick(budget)}
                  >
                    <CardContent>
                      <Box sx={{ mb: 2 }}>
                        <Typography
                          variant="h6"
                          fontWeight="medium"
                          gutterBottom
                        >
                          {getCategoryName(budget.category_id)}
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
                            label={budget.currency}
                            size="small"
                            variant="outlined"
                          />
                          <Chip
                            label={budget.status}
                            color={getStatusColor(budget.status)}
                            size="small"
                          />
                        </Box>
                      </Box>

                      {/* Progress Bar */}
                      <Box sx={{ mb: 2 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            mb: 0.5,
                          }}
                        >
                          <Typography variant="body2" color="text.secondary">
                            Spent:{' '}
                            {formatCurrency(actualSpending, budget.currency)}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Budget:{' '}
                            {formatCurrency(budgetAmount, budget.currency)}
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(percentage, 100)}
                          color={
                            percentage > 100
                              ? 'error'
                              : percentage > 80
                              ? 'warning'
                              : 'success'
                          }
                          sx={{ height: 8, borderRadius: 1 }}
                        />
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            mt: 0.5,
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              color:
                                remaining >= 0
                                  ? 'softGreen.main'
                                  : 'softRed.main',
                            }}
                            fontWeight="medium"
                          >
                            {remaining >= 0 ? 'Remaining' : 'Over budget'}:{' '}
                            {formatCurrency(
                              Math.abs(remaining),
                              budget.currency
                            )}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {percentage.toFixed(1)}%
                          </Typography>
                        </Box>
                      </Box>

                      {budget.notes && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 1 }}
                        >
                          {budget.notes}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                );
              };

              const renderParentCategoryGroupMobile = (
                parentId,
                group,
                typeLabel
              ) => {
                const isExpanded = expandedParents.has(parentId);
                // For root categories, parent is the category itself
                // For categories with parents, parent is the parent category
                const parentName = group.parent ? group.parent.name : 'Other';

                return (
                  <Box key={`${typeLabel}-${parentId}-mobile`} sx={{ mb: 2 }}>
                    {/* Parent Category Header */}
                    <Card
                      sx={{
                        mb: 1,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                      onClick={() => toggleParentExpansion(parentId)}
                    >
                      <CardContent sx={{ py: 1.5 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                          }}
                        >
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleParentExpansion(parentId);
                            }}
                          >
                            {isExpanded ? (
                              <ExpandMoreIcon />
                            ) : (
                              <ChevronRightIcon />
                            )}
                          </IconButton>
                          <Typography variant="body1" fontWeight="bold">
                            {parentName}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ ml: 'auto' }}
                          >
                            Total:{' '}
                            {formatCurrency(
                              group.totalAmount,
                              Object.values(group.subcategories)[0]?.budgets[0]
                                ?.currency || 'USD'
                            )}
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>
                    {/* Subcategory Budgets */}
                    <Collapse in={isExpanded}>
                      <Box>
                        {Object.entries(group.subcategories).map(
                          ([subcategoryId, subcategory]) => {
                            return subcategory.budgets.map((budget) =>
                              renderBudgetCard(budget)
                            );
                          }
                        )}
                      </Box>
                    </Collapse>
                  </Box>
                );
              };

              return (
                <>
                  {/* One-time Budgets Section */}
                  {Object.entries(organizedBudgets.oneTime).length > 0 && (
                    <>
                      <Card
                        sx={{
                          mb: 2,
                          cursor: 'pointer',
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                        onClick={() => toggleTypeExpansion('oneTime')}
                      >
                        <CardContent sx={{ py: 1.5 }}>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTypeExpansion('oneTime');
                              }}
                            >
                              {expandedTypes.oneTime ? (
                                <ExpandMoreIcon />
                              ) : (
                                <ChevronRightIcon />
                              )}
                            </IconButton>
                            <Typography variant="h6" fontWeight="bold">
                              One-time Budgets
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>
                      <Collapse in={expandedTypes.oneTime}>
                        <Box>
                          {Object.entries(organizedBudgets.oneTime).map(
                            ([parentId, group]) =>
                              renderParentCategoryGroupMobile(
                                parentId,
                                group,
                                'oneTime'
                              )
                          )}
                        </Box>
                      </Collapse>
                    </>
                  )}

                  {/* Recurring Budgets Section */}
                  {Object.entries(organizedBudgets.recurring).length > 0 && (
                    <>
                      <Card
                        sx={{
                          mb: 2,
                          cursor: 'pointer',
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                        onClick={() => toggleTypeExpansion('recurring')}
                      >
                        <CardContent sx={{ py: 1.5 }}>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTypeExpansion('recurring');
                              }}
                            >
                              {expandedTypes.recurring ? (
                                <ExpandMoreIcon />
                              ) : (
                                <ChevronRightIcon />
                              )}
                            </IconButton>
                            <Typography variant="h6" fontWeight="bold">
                              Recurring Budgets
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>
                      <Collapse in={expandedTypes.recurring}>
                        <Box>
                          {Object.entries(organizedBudgets.recurring).map(
                            ([parentId, group]) =>
                              renderParentCategoryGroupMobile(
                                parentId,
                                group,
                                'recurring'
                              )
                          )}
                        </Box>
                      </Collapse>
                    </>
                  )}
                </>
              );
            })()}
          </Box>

          {/* Desktop Table View */}
          <TableContainer
            component={Paper}
            sx={{ display: { xs: 'none', md: 'block' } }}
          >
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Category</TableCell>
                  <TableCell>Currency</TableCell>
                  <TableCell align="right">Budget</TableCell>
                  <TableCell align="right">Spent</TableCell>
                  <TableCell>Progress</TableCell>
                  <TableCell align="right">Remaining</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {/* Helper function to render a budget row */}
                {(() => {
                  const renderBudgetRow = (budget) => {
                    const actualSpending = calculateActualSpending(budget);
                    const budgetAmount = parseFloat(budget.amount || 0);
                    const percentage =
                      budgetAmount > 0
                        ? (actualSpending / budgetAmount) * 100
                        : 0;
                    const remaining = budgetAmount - actualSpending;

                    return (
                      <TableRow
                        key={budget.budget_id}
                        hover
                        onClick={() => handleRowClick(budget)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>
                          <Typography variant="body1" fontWeight="medium">
                            {getCategoryName(budget.category_id)}
                          </Typography>
                        </TableCell>
                        <TableCell>{budget.currency}</TableCell>
                        <TableCell align="right">
                          {formatCurrency(budgetAmount, budget.currency)}
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body1"
                            fontWeight="medium"
                            color={
                              actualSpending > budgetAmount
                                ? 'error.main'
                                : 'text.primary'
                            }
                          >
                            {formatCurrency(actualSpending, budget.currency)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(percentage, 100)}
                              color={
                                percentage > 100
                                  ? 'error'
                                  : percentage > 80
                                  ? 'warning'
                                  : 'success'
                              }
                              sx={{ flex: 1, height: 8, borderRadius: 1 }}
                            />
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ minWidth: 45 }}
                            >
                              {percentage.toFixed(1)}%
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body1"
                            fontWeight="medium"
                            sx={{
                              color:
                                remaining >= 0
                                  ? 'softGreen.main'
                                  : 'softRed.main',
                            }}
                          >
                            {formatCurrency(
                              Math.abs(remaining),
                              budget.currency
                            )}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={budget.status}
                            color={getStatusColor(budget.status)}
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  };

                  const renderParentCategoryGroup = (
                    parentId,
                    group,
                    typeLabel
                  ) => {
                    const isExpanded = expandedParents.has(parentId);
                    // For root categories, parent is the category itself
                    // For categories with parents, parent is the parent category
                    const parentName = group.parent
                      ? group.parent.name
                      : 'Other';

                    return (
                      <Fragment key={`${typeLabel}-${parentId}`}>
                        {/* Parent Category Header Row */}
                        <TableRow
                          onClick={() => toggleParentExpansion(parentId)}
                          sx={{
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'action.hover' },
                          }}
                        >
                          <TableCell colSpan={7}>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                py: 1,
                              }}
                            >
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleParentExpansion(parentId);
                                }}
                              >
                                {isExpanded ? (
                                  <ExpandMoreIcon />
                                ) : (
                                  <ChevronRightIcon />
                                )}
                              </IconButton>
                              <Typography variant="body1" fontWeight="bold">
                                {parentName}
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ ml: 'auto' }}
                              >
                                Total:{' '}
                                {formatCurrency(
                                  group.totalAmount,
                                  Object.values(group.subcategories)[0]
                                    ?.budgets[0]?.currency || 'USD'
                                )}
                              </Typography>
                            </Box>
                          </TableCell>
                        </TableRow>
                        {/* Subcategory Budgets */}
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            sx={{ py: 0, border: 0, px: 0 }}
                          >
                            <Collapse in={isExpanded}>
                              <Table size="small">
                                <TableBody>
                                  {Object.entries(group.subcategories).map(
                                    ([subcategoryId, subcategory]) => {
                                      return subcategory.budgets.map((budget) =>
                                        renderBudgetRow(budget)
                                      );
                                    }
                                  )}
                                </TableBody>
                              </Table>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  };

                  const oneTimeEntries = Object.entries(
                    organizedBudgets.oneTime
                  );
                  const recurringEntries = Object.entries(
                    organizedBudgets.recurring
                  );

                  return (
                    <>
                      {/* One-time Budgets Section */}
                      {oneTimeEntries.length > 0 && (
                        <>
                          <TableRow
                            onClick={() => toggleTypeExpansion('oneTime')}
                            sx={{
                              cursor: 'pointer',
                              '&:hover': { bgcolor: 'action.selected' },
                            }}
                          >
                            <TableCell
                              colSpan={7}
                              sx={{ bgcolor: 'action.hover' }}
                            >
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  py: 1,
                                }}
                              >
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTypeExpansion('oneTime');
                                  }}
                                >
                                  {expandedTypes.oneTime ? (
                                    <ExpandMoreIcon />
                                  ) : (
                                    <ChevronRightIcon />
                                  )}
                                </IconButton>
                                <Typography variant="h6" fontWeight="bold">
                                  One-time Budgets
                                </Typography>
                              </Box>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              sx={{ py: 0, border: 0, px: 0 }}
                            >
                              <Collapse in={expandedTypes.oneTime}>
                                <Table size="small">
                                  <TableBody>
                                    {oneTimeEntries.map(([parentId, group]) =>
                                      renderParentCategoryGroup(
                                        parentId,
                                        group,
                                        'oneTime'
                                      )
                                    )}
                                  </TableBody>
                                </Table>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        </>
                      )}

                      {/* Recurring Budgets Section */}
                      {recurringEntries.length > 0 && (
                        <>
                          <TableRow
                            onClick={() => toggleTypeExpansion('recurring')}
                            sx={{
                              cursor: 'pointer',
                              '&:hover': { bgcolor: 'action.selected' },
                            }}
                          >
                            <TableCell
                              colSpan={7}
                              sx={{ bgcolor: 'action.hover' }}
                            >
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  py: 1,
                                }}
                              >
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTypeExpansion('recurring');
                                  }}
                                >
                                  {expandedTypes.recurring ? (
                                    <ExpandMoreIcon />
                                  ) : (
                                    <ChevronRightIcon />
                                  )}
                                </IconButton>
                                <Typography variant="h6" fontWeight="bold">
                                  Recurring Budgets
                                </Typography>
                              </Box>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              sx={{ py: 0, border: 0, px: 0 }}
                            >
                              <Collapse in={expandedTypes.recurring}>
                                <Table size="small">
                                  <TableBody>
                                    {recurringEntries.map(([parentId, group]) =>
                                      renderParentCategoryGroup(
                                        parentId,
                                        group,
                                        'recurring'
                                      )
                                    )}
                                  </TableBody>
                                </Table>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        </>
                      )}
                    </>
                  );
                })()}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
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
            {editingBudget ? 'Edit Budget' : 'Create New Budget'}
          </DialogTitle>
          <DialogContent>
            {actionError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {actionError}
              </Alert>
            )}
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <FormControl fullWidth error={!!errors.categoryId}>
                  <InputLabel>Category *</InputLabel>
                  <Select
                    {...register('categoryId')}
                    label="Category *"
                    value={watchedCategoryId || ''}
                    onChange={(e) => setValue('categoryId', e.target.value)}
                  >
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
                  {errors.categoryId && (
                    <FormHelperText>{errors.categoryId.message}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Currency (ISO Code) *"
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
                  label="Amount *"
                  {...register('amount', { valueAsNumber: true })}
                  error={!!errors.amount}
                  helperText={errors.amount?.message}
                  inputProps={{ step: '0.01', min: '0.01' }}
                />
              </Grid>
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Switch
                    {...register('recurring')}
                    checked={watchedRecurring}
                    onChange={(e) => setValue('recurring', e.target.checked)}
                  />
                  <Typography>Recurring Budget</Typography>
                </Box>
              </Grid>
              {watchedRecurring ? (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      type="month"
                      label="Start Month *"
                      {...register('startMonth', {
                        required:
                          'Start month is required for recurring budgets',
                      })}
                      error={!!errors.startMonth}
                      helperText={errors.startMonth?.message}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      type="month"
                      label="End Month (Optional)"
                      {...register('endMonth')}
                      error={!!errors.endMonth}
                      helperText={
                        errors.endMonth?.message ||
                        'Leave empty for non-ending budget'
                      }
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                </>
              ) : (
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    type="month"
                    label="Month *"
                    {...register('month', {
                      required: 'Month is required for one-time budgets',
                    })}
                    error={!!errors.month}
                    helperText={errors.month?.message}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              )}
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!errors.status}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    {...register('status')}
                    label="Status"
                    value={watchedStatus || ''}
                    onChange={(e) => setValue('status', e.target.value)}
                  >
                    {BUDGET_STATUSES.map((status) => (
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
                <TextField
                  fullWidth
                  label="Notes (Optional)"
                  {...register('notes')}
                  error={!!errors.notes}
                  helperText={errors.notes?.message}
                  multiline
                  rows={2}
                />
              </Grid>
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
                {editingBudget && (
                  <Button
                    onClick={() => handleDelete()}
                    color="error"
                    disabled={isSubmitting || isDeleting}
                    startIcon={
                      isDeleting ? (
                        <CircularProgress size={20} color="inherit" />
                      ) : (
                        <DeleteIcon />
                      )
                    }
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </Button>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  onClick={handleCloseDialog}
                  disabled={isSubmitting || isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={isSubmitting || isDeleting}
                  startIcon={
                    isSubmitting ? (
                      <CircularProgress size={20} color="inherit" />
                    ) : null
                  }
                >
                  {isSubmitting
                    ? editingBudget
                      ? 'Updating...'
                      : 'Creating...'
                    : editingBudget
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
        open={!!deleteConfirm && !!editingBudget}
        onClose={() => {
          setDeleteConfirm(null);
          setDeleteError(null);
        }}
        fullScreen={isMobile}
      >
        <DialogTitle>Delete Budget</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the budget for{' '}
            <strong>
              {editingBudget && getCategoryName(editingBudget.category_id)}
            </strong>
            ?
          </Typography>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
          <Alert severity="warning" sx={{ mt: 2 }}>
            This action cannot be undone.
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

export default Budgets;
