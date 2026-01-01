import { useEffect, useState, useMemo, Fragment, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  selectCategoryMap,
  selectCategoryNameGetter,
} from '../store/selectors';
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
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import {
  fetchBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  clearError,
} from '../store/slices/budgetsSlice';
import { fetchCategories } from '../store/slices/categoriesSlice';
import { budgetSchema } from '../schemas/budgetSchema';
import { BUDGET_STATUSES } from '../lib/api/budgets';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import CategoryAutocomplete from '../components/common/CategoryAutocomplete';
import { usePageRefresh } from '../hooks/usePageRefresh';
import {
  formatCurrency,
  convertAmountWithExchangeRates,
} from '../utils/currencyConversion';
import {
  format,
  startOfMonth,
  endOfMonth,
  parseISO,
  subMonths,
  addMonths,
} from 'date-fns';

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

  // Memoized O(1) lookup functions from selectors
  const categoryMap = useSelector(selectCategoryMap);
  const getCategoryName = useSelector(selectCategoryNameGetter);
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
    income: false,
    expense: false,
    incomeOneTime: false,
    incomeRecurring: false,
    expenseOneTime: false,
    expenseRecurring: false,
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

  // Refresh data on navigation
  usePageRefresh({
    dataTypes: ['budgets', 'categories'],
    filters: {
      categories: { status: 'Active' },
    },
  });

  // Auto-set currency from category when category is selected (only for new budgets)
  useEffect(() => {
    // Only auto-set currency when creating a new budget, not when editing
    if (watchedCategoryId && !editingBudget) {
      const category = categoryMap.get(watchedCategoryId);
      if (category) {
        // Try to get currency from settings or default to USD
        const baseCurrency =
          settings.find((s) => s.setting_key === 'BaseCurrency')
            ?.setting_value || 'USD';
        setValue('currency', baseCurrency);
      }
    }
  }, [watchedCategoryId, categoryMap, settings, setValue, editingBudget]);

  // Calculate actual amount for a budget (works for both income and expense)
  // Optional forMonth parameter to calculate for a specific month (used for stats)
  const calculateActualAmount = (budget, forMonth = null) => {
    if (!allTransactions || allTransactions.length === 0) return 0;

    // Get category to determine if it's income or expense
    const category = categoryMap.get(budget.category_id);
    const isIncome = category?.type === 'Income';

    // For recurring budgets with forMonth, use that month for filtering
    // For non-recurring or when forMonth is not specified, use budget's own month
    let targetMonth;
    if (forMonth && budget.recurring) {
      // Use the selected month for recurring budgets
      targetMonth = parseISO(`${forMonth}-01`);
    } else if (budget.month) {
      targetMonth = parseISO(
        `${budget.month.split('-')[0]}-${budget.month.split('-')[1]}-01`
      );
    } else {
      targetMonth = null;
    }

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

      // Filter by transaction type based on category type
      if (isIncome) {
        // For income budgets, only count Income transactions
        if (txn.type !== 'Income') {
          return false;
        }
      } else {
        // For expense budgets, count Expense and Transfer Out
        if (txn.type !== 'Expense' && txn.type !== 'Transfer Out') {
          return false;
        }
      }

      // Must not be cancelled
      if (txn.status === 'Cancelled' || txn.deleted_at) {
        return false;
      }

      const txnDate = parseISO(txn.date);

      // Check date range based on budget type
      if (budget.recurring) {
        // For recurring budgets, check if transaction is within the target month
        // AND within the budget's start/end range
        if (startMonthDate && txnDate < startOfMonth(startMonthDate)) {
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
        // Also check if within the target month (for monthly view)
        if (targetMonth) {
          if (
            txnDate < startOfMonth(targetMonth) ||
            txnDate > endOfMonth(targetMonth)
          ) {
            return false;
          }
        }
      } else {
        // Non-recurring budget: check if transaction date is in the budget month
        if (targetMonth) {
          if (
            txnDate < startOfMonth(targetMonth) ||
            txnDate > endOfMonth(targetMonth)
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

  // Calculate budget statistics for both income and expense budgets
  const budgetStats = useMemo(() => {
    const baseCurrency =
      settings.find((s) => s.setting_key === 'BaseCurrency')?.setting_value ||
      'USD';

    const stats = {
      expense: {
        totalBudget: 0,
        totalActual: 0,
        totalRemaining: 0,
      },
      income: {
        totalBudget: 0,
        totalActual: 0,
        totalRemaining: 0,
      },
      baseCurrency,
    };

    filteredBudgets.forEach((budget) => {
      const category = categoryMap.get(budget.category_id);
      const isIncome = category?.type === 'Income';
      const targetStats = isIncome ? stats.income : stats.expense;

      // Pass selectedMonth to get actual amount for the selected month (important for recurring budgets)
      const actualAmount = calculateActualAmount(budget, selectedMonth);
      const budgetAmount = parseFloat(budget.amount || 0);
      const remaining = budgetAmount - actualAmount;
      const budgetCurrency = budget.currency || 'USD';

      // Convert amounts to base currency
      const convertedBudgetAmount = convertAmountWithExchangeRates(
        budgetAmount,
        budgetCurrency,
        baseCurrency,
        exchangeRates
      );
      const convertedActualAmount = convertAmountWithExchangeRates(
        actualAmount,
        budgetCurrency,
        baseCurrency,
        exchangeRates
      );
      const convertedRemaining =
        convertedBudgetAmount !== null && convertedActualAmount !== null
          ? convertedBudgetAmount - convertedActualAmount
          : remaining;

      // Use converted amounts if available, otherwise use original
      targetStats.totalBudget +=
        convertedBudgetAmount !== null ? convertedBudgetAmount : budgetAmount;
      targetStats.totalActual +=
        convertedActualAmount !== null ? convertedActualAmount : actualAmount;
      targetStats.totalRemaining += convertedRemaining;
    });

    return stats;
  }, [
    filteredBudgets,
    allTransactions,
    settings,
    exchangeRates,
    categoryMap,
    selectedMonth,
  ]);

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

  // Month navigation handlers
  const handlePreviousMonth = useCallback(() => {
    setSelectedMonth((prev) => {
      const currentDate = parseISO(`${prev}-01`);
      const previousMonth = subMonths(currentDate, 1);
      return format(previousMonth, 'yyyy-MM');
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setSelectedMonth((prev) => {
      const currentDate = parseISO(`${prev}-01`);
      const nextMonth = addMonths(currentDate, 1);
      return format(nextMonth, 'yyyy-MM');
    });
  }, []);

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingBudget(null);
    setActionError(null);
    setIsSubmitting(false);
    reset();
    dispatch(clearError());
  };

  // Helper function to get the month before a given month (YYYY-MM format)
  const getPreviousMonth = useCallback((monthStr) => {
    const currentDate = parseISO(`${monthStr}-01`);
    const previousMonth = subMonths(currentDate, 1);
    return format(previousMonth, 'yyyy-MM');
  }, []);

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
        // Check if we need to split a recurring budget for a future month
        if (
          editingBudget.recurring &&
          cleanedData.recurring &&
          editingBudget.start_month &&
          cleanedData.startMonth
        ) {
          // Parse dates for comparison
          const budgetStartDate = parseISO(`${editingBudget.start_month.split('-')[0]}-${editingBudget.start_month.split('-')[1]}-01`);
          const selectedDate = parseISO(`${selectedMonth}-01`);
          const newStartDate = parseISO(`${cleanedData.startMonth}-01`);

          // Check if selectedMonth (the month user is viewing) is after the budget's start_month
          if (selectedDate > startOfMonth(budgetStartDate)) {
            // Split the budget: end the old one before selectedMonth and create a new one from selectedMonth
            const endMonthForOldBudget = getPreviousMonth(selectedMonth);

            // Update the old budget to end at the month before selectedMonth
            // Keep original amount and other original fields, only update end_month
            const originalStartMonth = editingBudget.start_month
              ? `${editingBudget.start_month.split('-')[0]}-${editingBudget.start_month.split('-')[1]}`
              : null;
            
            await dispatch(
              updateBudget({
                budgetId: editingBudget.budget_id,
                updates: {
                  categoryId: editingBudget.category_id,
                  currency: editingBudget.currency,
                  amount: parseFloat(editingBudget.amount), // Keep original amount
                  recurring: true,
                  notes: editingBudget.notes || '', // Keep original notes
                  status: editingBudget.status, // Keep original status
                  startMonth: originalStartMonth,
                  endMonth: endMonthForOldBudget,
                },
              })
            ).unwrap();

            // Create a new recurring budget starting from selectedMonth with the new amount and updated fields
            const originalEndMonth = editingBudget.end_month
              ? parseISO(`${editingBudget.end_month.split('-')[0]}-${editingBudget.end_month.split('-')[1]}-01`)
              : null;
            const newEndMonth =
              originalEndMonth && originalEndMonth >= selectedDate
                ? `${editingBudget.end_month.split('-')[0]}-${editingBudget.end_month.split('-')[1]}`
                : cleanedData.endMonth;

            await dispatch(
              createBudget({
                ...budgetData,
                startMonth: selectedMonth,
                endMonth: newEndMonth,
              })
            ).unwrap();
          } else if (selectedDate < startOfMonth(budgetStartDate)) {
            // Selected month is before start_month: update start_month to selectedMonth
            await dispatch(
              updateBudget({
                budgetId: editingBudget.budget_id,
                updates: {
                  ...budgetData,
                  startMonth: selectedMonth,
                },
              })
            ).unwrap();
          } else {
            // Selected month equals start_month: just update the amount and other fields
            await dispatch(
              updateBudget({
                budgetId: editingBudget.budget_id,
                updates: budgetData,
              })
            ).unwrap();
          }
        } else {
          // Not a recurring budget or not splitting: use normal update
          await dispatch(
            updateBudget({
              budgetId: editingBudget.budget_id,
              updates: budgetData,
            })
          ).unwrap();
        }
      } else {
        await dispatch(createBudget(budgetData)).unwrap();
      }
      handleCloseDialog();
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

  // Get category by ID (using memoized Map for O(1) lookup)
  const getCategory = useCallback(
    (categoryId) => {
      return categoryMap.get(categoryId);
    },
    [categoryMap]
  );

  // Organize budgets by category hierarchy
  const organizeBudgetsByCategory = useMemo(() => {
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
  }, [categoryMap]);

  // Separate budgets by category type (Income/Expense), then by recurring type
  const organizedBudgets = useMemo(() => {
    // First separate by category type
    const incomeBudgets = filteredBudgets.filter((b) => {
      const category = categoryMap.get(b.category_id);
      return category?.type === 'Income';
    });
    const expenseBudgets = filteredBudgets.filter((b) => {
      const category = categoryMap.get(b.category_id);
      return category?.type === 'Expense';
    });

    // Then separate each by one-time vs recurring
    return {
      income: {
        oneTime: organizeBudgetsByCategory(
          incomeBudgets.filter((b) => !b.recurring)
        ),
        recurring: organizeBudgetsByCategory(
          incomeBudgets.filter((b) => b.recurring)
        ),
      },
      expense: {
        oneTime: organizeBudgetsByCategory(
          expenseBudgets.filter((b) => !b.recurring)
        ),
        recurring: organizeBudgetsByCategory(
          expenseBudgets.filter((b) => b.recurring)
        ),
      },
    };
  }, [filteredBudgets, organizeBudgetsByCategory, categoryMap]);

  // Helper function to calculate total for a budget group
  const calculateGroupTotal = useCallback((budgetGroups) => {
    let total = 0;
    Object.values(budgetGroups).forEach((group) => {
      total += group.totalAmount || 0;
    });
    return total;
  }, []);

  // Helper function to get currency for a budget group (for display)
  const getGroupCurrency = useCallback((budgetGroups) => {
    const firstGroup = Object.values(budgetGroups)[0];
    if (!firstGroup) return 'USD';
    const firstSubcategory = Object.values(firstGroup.subcategories)[0];
    if (!firstSubcategory) return 'USD';
    const firstBudget = firstSubcategory.budgets[0];
    return firstBudget?.currency || 'USD';
  }, []);

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

  // Google-style chip styling for status badges
  const getStatusChipSx = (status) => {
    switch (status) {
      case 'Active':
        return {
          backgroundColor: '#e6f4ea',
          color: '#1e8e3e',
          fontWeight: 500,
        };
      case 'Archived':
        return {
          backgroundColor: '#f1f3f4',
          color: '#5f6368',
          fontWeight: 500,
        };
      default:
        return {
          backgroundColor: '#f1f3f4',
          color: '#5f6368',
          fontWeight: 500,
        };
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
          mb: { xs: 1.5, sm: 2, md: 3 },
          gap: { xs: 1.5, sm: 0 },
        }}
      >
        <Typography
          variant="h4"
          sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, fontWeight: 500 }}
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
            startIcon={<FilterListIcon sx={{ fontSize: 18 }} />}
            onClick={() => setFiltersOpen(!filtersOpen)}
            color={activeFilterCount > 0 ? 'primary' : 'inherit'}
            size="small"
            sx={{
              flex: { xs: '1 1 auto', sm: 'none' },
              textTransform: 'none',
              minHeight: 36,
            }}
          >
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
            onClick={() => handleOpenDialog()}
            size="small"
            sx={{
              flex: { xs: '1 1 auto', sm: 'none' },
              textTransform: 'none',
              minHeight: 36,
            }}
          >
            Add Budget
          </Button>
        </Box>
      </Box>

      {error && <ErrorMessage error={error} />}

      {/* Month Selector */}
      <Box
        sx={{
          mb: { xs: 2, sm: 3 },
          p: { xs: 1.5, sm: 2 },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          backgroundColor: 'background.paper',
        }}
      >
        <Grid container spacing={{ xs: 1.5, sm: 2 }} alignItems="center">
          <Grid item xs={12} sm={6} md={4}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton
                onClick={handlePreviousMonth}
                size="small"
                sx={{
                  color: 'text.secondary',
                  width: { xs: 32, sm: 36 },
                  height: { xs: 32, sm: 36 },
                  p: 0.5,
                  '&:hover': { backgroundColor: 'action.hover' },
                }}
              >
                <ChevronLeftIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
              </IconButton>
              <TextField
                fullWidth
                size="small"
                type="month"
                label="View Budgets For Month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <IconButton
                onClick={handleNextMonth}
                size="small"
                sx={{
                  color: 'text.secondary',
                  width: { xs: 32, sm: 36 },
                  height: { xs: 32, sm: 36 },
                  p: 0.5,
                  '&:hover': { backgroundColor: 'action.hover' },
                }}
              >
                <ChevronRightIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
              </IconButton>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6} md={8}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}
            >
              Select a month to view budgets and spending for that period
            </Typography>
          </Grid>
        </Grid>
      </Box>

      {/* Summary Cards - Income and Expense stats */}
      {filteredBudgets.length > 0 && (
        <Grid
          container
          spacing={{ xs: 1, sm: 2 }}
          sx={{ mb: { xs: 2, sm: 3, md: 4 } }}
        >
          {/* Income Stats - show first if there are income budgets */}
          {budgetStats.income.totalBudget > 0 && (
            <>
              <Grid item xs={12} sm={4} md={4}>
                <Box
                  sx={{
                    p: { xs: 1.25, sm: 2 },
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    backgroundColor: 'background.paper',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      fontSize: { xs: '0.8rem', sm: '0.85rem' },
                    }}
                  >
                    Income Goal
                  </Typography>
                  <Typography
                    variant="h5"
                    fontWeight="bold"
                    color="text.primary"
                    sx={{
                      fontSize: { xs: '1rem', sm: '1.25rem' },
                    }}
                  >
                    {formatCurrency(
                      budgetStats.income.totalBudget,
                      budgetStats.baseCurrency
                    )}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={4} md={4}>
                <Box
                  sx={{
                    p: { xs: 1.25, sm: 2 },
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    backgroundColor: 'background.paper',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      fontSize: { xs: '0.8rem', sm: '0.85rem' },
                    }}
                  >
                    Total Earned
                  </Typography>
                  <Typography
                    variant="h5"
                    fontWeight="bold"
                    color="text.primary"
                    sx={{
                      fontSize: { xs: '1rem', sm: '1.25rem' },
                    }}
                  >
                    {formatCurrency(
                      budgetStats.income.totalActual,
                      budgetStats.baseCurrency
                    )}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={4} md={4}>
                <Box
                  sx={{
                    p: { xs: 1.25, sm: 2 },
                    border: '1px solid',
                    borderColor:
                      budgetStats.income.totalRemaining <= 0
                        ? 'success.light'
                        : 'divider',
                    borderRadius: 1,
                    backgroundColor: 'background.paper',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      fontSize: { xs: '0.8rem', sm: '0.85rem' },
                    }}
                  >
                    {budgetStats.income.totalRemaining <= 0
                      ? 'Exceeded Goal'
                      : 'Remaining'}
                  </Typography>
                  <Typography
                    variant="h5"
                    fontWeight="bold"
                    sx={{
                      fontSize: { xs: '1rem', sm: '1.25rem' },
                      color:
                        budgetStats.income.totalRemaining <= 0
                          ? 'success.main'
                          : 'text.primary',
                    }}
                  >
                    {formatCurrency(
                      Math.abs(budgetStats.income.totalRemaining),
                      budgetStats.baseCurrency
                    )}
                  </Typography>
                </Box>
              </Grid>
            </>
          )}
          {/* Expense Stats */}
          <Grid item xs={12} sm={4} md={4}>
            <Box
              sx={{
                p: { xs: 1.25, sm: 2 },
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                backgroundColor: 'background.paper',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  fontSize: { xs: '0.8rem', sm: '0.85rem' },
                }}
              >
                Expense Budget
              </Typography>
              <Typography
                variant="h5"
                fontWeight="bold"
                color="text.primary"
                sx={{
                  fontSize: { xs: '1rem', sm: '1.25rem' },
                }}
              >
                {formatCurrency(
                  budgetStats.expense.totalBudget,
                  budgetStats.baseCurrency
                )}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={4} md={4}>
            <Box
              sx={{
                p: { xs: 1.25, sm: 2 },
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                backgroundColor: 'background.paper',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  fontSize: { xs: '0.8rem', sm: '0.85rem' },
                }}
              >
                Total Spent
              </Typography>
              <Typography
                variant="h5"
                fontWeight="bold"
                color="text.primary"
                sx={{
                  fontSize: { xs: '1rem', sm: '1.25rem' },
                }}
              >
                {formatCurrency(
                  budgetStats.expense.totalActual,
                  budgetStats.baseCurrency
                )}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={4} md={4}>
            <Box
              sx={{
                p: { xs: 1.25, sm: 2 },
                border: '1px solid',
                borderColor:
                  budgetStats.expense.totalRemaining >= 0
                    ? 'divider'
                    : 'error.light',
                borderRadius: 1,
                backgroundColor: 'background.paper',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  fontSize: { xs: '0.8rem', sm: '0.85rem' },
                }}
              >
                {budgetStats.expense.totalRemaining >= 0
                  ? 'Remaining'
                  : 'Over Budget'}
              </Typography>
              <Typography
                variant="h5"
                fontWeight="bold"
                sx={{
                  fontSize: { xs: '1rem', sm: '1.25rem' },
                  color:
                    budgetStats.expense.totalRemaining >= 0
                      ? 'text.primary'
                      : 'error.main',
                }}
              >
                {formatCurrency(
                  Math.abs(budgetStats.expense.totalRemaining),
                  budgetStats.baseCurrency
                )}
              </Typography>
            </Box>
          </Grid>
          {/* Net Budget: Income Goal - Expense Budget */}
          {budgetStats.income.totalBudget > 0 && (
            <Grid item xs={12} sm={4} md={4}>
              <Box
                sx={{
                  p: { xs: 1.25, sm: 2 },
                  border: '1px solid',
                  borderColor:
                    budgetStats.income.totalBudget -
                      budgetStats.expense.totalBudget >=
                    0
                      ? 'success.light'
                      : 'warning.light',
                  borderRadius: 1,
                  backgroundColor: 'background.paper',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    fontSize: { xs: '0.8rem', sm: '0.85rem' },
                  }}
                >
                  Net Budget
                </Typography>
                <Typography
                  variant="h5"
                  fontWeight="bold"
                  sx={{
                    fontSize: { xs: '1rem', sm: '1.25rem' },
                    color:
                      budgetStats.income.totalBudget -
                        budgetStats.expense.totalBudget >=
                      0
                        ? 'success.main'
                        : 'warning.main',
                  }}
                >
                  {formatCurrency(
                    budgetStats.income.totalBudget -
                      budgetStats.expense.totalBudget,
                    budgetStats.baseCurrency
                  )}
                </Typography>
              </Box>
            </Grid>
          )}
        </Grid>
      )}

      {/* Filters Section */}
      <Collapse in={filtersOpen}>
        <Box
          sx={{
            mb: { xs: 2, sm: 3 },
            p: { xs: 1.5, sm: 2 },
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            backgroundColor: 'background.paper',
          }}
        >
          <Grid container spacing={{ xs: 1.5, sm: 2 }} alignItems="center">
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
                  onChange={(e) => handleFilterChange('status', e.target.value)}
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
                sx={{ textTransform: 'none', minHeight: 36 }}
              >
                Clear Filters
              </Button>
            </Grid>
          </Grid>
        </Box>
      </Collapse>

      {filteredBudgets.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center',
            py: { xs: 3, sm: 4 },
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            backgroundColor: 'background.paper',
          }}
        >
          <AccountBalanceWalletIcon
            sx={{
              fontSize: { xs: 48, sm: 64 },
              color: 'text.secondary',
              mb: { xs: 1.5, sm: 2 },
            }}
          />
          <Typography
            variant="h6"
            color="text.secondary"
            gutterBottom
            sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
          >
            No budgets yet
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mb: { xs: 1.5, sm: 2 },
              fontSize: { xs: '0.8125rem', sm: '0.875rem' },
            }}
          >
            Create your first budget to track your spending
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
            onClick={() => handleOpenDialog()}
            sx={{ textTransform: 'none', minHeight: 36 }}
          >
            Create Budget
          </Button>
        </Box>
      ) : (
        <Box>
          {/* Mobile Card View */}
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            {/* Helper function to render a budget card */}
            {(() => {
              const renderBudgetCard = (budget, indentLevel = 0) => {
                const category = categoryMap.get(budget.category_id);
                const isIncome = category?.type === 'Income';
                const actualAmount = calculateActualAmount(
                  budget,
                  selectedMonth
                );
                const budgetAmount = parseFloat(budget.amount || 0);
                const percentage =
                  budgetAmount > 0 ? (actualAmount / budgetAmount) * 100 : 0;
                const remaining = budgetAmount - actualAmount;

                // For income: green when met/exceeded goal, for expense: green when under budget
                const getProgressColor = () => {
                  if (isIncome) {
                    return percentage >= 100
                      ? 'success'
                      : percentage >= 80
                      ? 'info'
                      : 'warning';
                  }
                  return percentage > 100
                    ? 'error'
                    : percentage > 80
                    ? 'warning'
                    : 'success';
                };

                const getRemainingColor = () => {
                  if (isIncome) {
                    // For income: exceeded = green, remaining = needs more = neutral
                    return remaining <= 0 ? 'success.main' : 'text.secondary';
                  }
                  // For expense: remaining = green, over = red
                  return remaining >= 0 ? 'softGreen.main' : 'softRed.main';
                };

                const getRemainingLabel = () => {
                  if (isIncome) {
                    return remaining <= 0 ? 'Exceeded' : 'To Goal';
                  }
                  return remaining >= 0 ? 'Remaining' : 'Over';
                };

                return (
                  <Box
                    key={budget.budget_id}
                    sx={{
                      mb: 1.5,
                      p: 1.5,
                      ml: indentLevel * 2,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                      backgroundColor: 'background.paper',
                      '&:hover': { backgroundColor: 'action.hover' },
                    }}
                    onClick={() => handleRowClick(budget)}
                  >
                    <Box sx={{ mb: 1 }}>
                      <Typography
                        variant="body1"
                        fontWeight="medium"
                        sx={{ fontSize: '0.875rem', mb: 0.5 }}
                      >
                        {getCategoryName(budget.category_id)}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        <Chip
                          label={budget.currency}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.6875rem' }}
                        />
                        <Chip
                          label={budget.status}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.6875rem',
                            ...getStatusChipSx(budget.status),
                          }}
                        />
                      </Box>
                    </Box>

                    {/* Progress Bar */}
                    <Box sx={{ mb: 1 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          mb: 0.25,
                        }}
                      >
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontSize: '0.75rem' }}
                        >
                          {isIncome ? 'Earned' : 'Spent'}:{' '}
                          {formatCurrency(actualAmount, budget.currency)}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontSize: '0.75rem' }}
                        >
                          {isIncome ? 'Goal' : 'Budget'}:{' '}
                          {formatCurrency(budgetAmount, budget.currency)}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(percentage, 100)}
                        color={getProgressColor()}
                        sx={{ height: 6, borderRadius: 1 }}
                      />
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          mt: 0.25,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            color: getRemainingColor(),
                            fontSize: '0.6875rem',
                          }}
                          fontWeight="medium"
                        >
                          {getRemainingLabel()}:{' '}
                          {formatCurrency(Math.abs(remaining), budget.currency)}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.6875rem' }}
                        >
                          {percentage.toFixed(1)}%
                        </Typography>
                      </Box>
                    </Box>

                    {budget.notes && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontSize: '0.75rem' }}
                      >
                        {budget.notes}
                      </Typography>
                    )}
                  </Box>
                );
              };

              const renderParentCategoryGroupMobile = (
                parentId,
                group,
                typeLabel,
                indentLevel = 0
              ) => {
                const isExpanded = expandedParents.has(
                  `${typeLabel}-${parentId}`
                );
                const parentName = group.parent ? group.parent.name : 'Other';

                return (
                  <Box
                    key={`${typeLabel}-${parentId}-mobile`}
                    sx={{ mb: 1.5, ml: indentLevel * 2 }}
                  >
                    {/* Parent Category Header */}
                    <Box
                      sx={{
                        mb: 1,
                        p: 1,
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        backgroundColor: 'background.paper',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                      onClick={() =>
                        toggleParentExpansion(`${typeLabel}-${parentId}`)
                      }
                    >
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                      >
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleParentExpansion(`${typeLabel}-${parentId}`);
                          }}
                          sx={{ p: 0.5 }}
                        >
                          {isExpanded ? (
                            <ExpandMoreIcon sx={{ fontSize: 20 }} />
                          ) : (
                            <ChevronRightIcon sx={{ fontSize: 20 }} />
                          )}
                        </IconButton>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          sx={{ fontSize: '0.875rem' }}
                        >
                          {parentName}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ ml: 'auto', fontSize: '0.75rem' }}
                        >
                          Total:{' '}
                          {formatCurrency(
                            group.totalAmount,
                            Object.values(group.subcategories)[0]?.budgets[0]
                              ?.currency || 'USD'
                          )}
                        </Typography>
                      </Box>
                    </Box>
                    {/* Subcategory Budgets */}
                    <Collapse in={isExpanded}>
                      <Box sx={{ pl: 2 }}>
                        {Object.entries(group.subcategories).map(
                          ([subcategoryId, subcategory]) => {
                            return subcategory.budgets.map((budget) =>
                              renderBudgetCard(budget, 1)
                            );
                          }
                        )}
                      </Box>
                    </Collapse>
                  </Box>
                );
              };

              const renderRecurringTypeSectionMobile = (
                budgetGroups,
                typeKey,
                label,
                indentLevel = 0
              ) => {
                const entries = Object.entries(budgetGroups);
                if (entries.length === 0) return null;

                const total = calculateGroupTotal(budgetGroups);
                const currency = getGroupCurrency(budgetGroups);

                return (
                  <>
                    <Box
                      sx={{
                        mb: 1.5,
                        p: 1.5,
                        pl: 1.5 + indentLevel * 2,
                        cursor: 'pointer',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        backgroundColor: 'transparent',
                        '&:hover': { backgroundColor: '#f8f9fa' },
                      }}
                      onClick={() => toggleTypeExpansion(typeKey)}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                        }}
                      >
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTypeExpansion(typeKey);
                          }}
                          sx={{ p: 0.5, color: '#5f6368' }}
                        >
                          {expandedTypes[typeKey] ? (
                            <ExpandMoreIcon sx={{ fontSize: 20 }} />
                          ) : (
                            <ChevronRightIcon sx={{ fontSize: 20 }} />
                          )}
                        </IconButton>
                        <Typography
                          variant="body1"
                          sx={{
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            color: '#202124',
                          }}
                        >
                          {label}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ ml: 'auto', fontSize: '0.75rem' }}
                        >
                          {formatCurrency(total, currency)}
                        </Typography>
                      </Box>
                    </Box>
                    <Collapse in={expandedTypes[typeKey]}>
                      <Box sx={{ pl: 2 }}>
                        {entries.map(([parentId, group]) =>
                          renderParentCategoryGroupMobile(
                            parentId,
                            group,
                            typeKey,
                            1
                          )
                        )}
                      </Box>
                    </Collapse>
                  </>
                );
              };

              const renderCategoryTypeSectionMobile = (
                categoryType,
                typeKey,
                label
              ) => {
                const data = organizedBudgets[categoryType];
                const hasOneTime = Object.entries(data.oneTime).length > 0;
                const hasRecurring = Object.entries(data.recurring).length > 0;
                if (!hasOneTime && !hasRecurring) return null;

                const oneTimeTotal = calculateGroupTotal(data.oneTime);
                const recurringTotal = calculateGroupTotal(data.recurring);
                const total = oneTimeTotal + recurringTotal;
                const currency = getGroupCurrency(
                  Object.keys(data.oneTime).length > 0
                    ? data.oneTime
                    : data.recurring
                );

                return (
                  <>
                    <Box
                      sx={{
                        mb: 1.5,
                        p: 1.5,
                        cursor: 'pointer',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        backgroundColor: 'transparent',
                        '&:hover': { backgroundColor: '#f8f9fa' },
                      }}
                      onClick={() => toggleTypeExpansion(categoryType)}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                        }}
                      >
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTypeExpansion(categoryType);
                          }}
                          sx={{ p: 0.5, color: '#5f6368' }}
                        >
                          {expandedTypes[categoryType] ? (
                            <ExpandMoreIcon sx={{ fontSize: 20 }} />
                          ) : (
                            <ChevronRightIcon sx={{ fontSize: 20 }} />
                          )}
                        </IconButton>
                        <Typography
                          variant="body1"
                          sx={{
                            fontSize: '1rem',
                            fontWeight: 600,
                            color: '#202124',
                          }}
                        >
                          {label}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ ml: 'auto', fontSize: '0.75rem' }}
                        >
                          {formatCurrency(total, currency)}
                        </Typography>
                      </Box>
                    </Box>
                    <Collapse in={expandedTypes[categoryType]}>
                      <Box sx={{ pl: 2 }}>
                        {renderRecurringTypeSectionMobile(
                          data.oneTime,
                          `${categoryType}OneTime`,
                          'One-time Budgets',
                          1
                        )}
                        {renderRecurringTypeSectionMobile(
                          data.recurring,
                          `${categoryType}Recurring`,
                          'Recurring Budgets',
                          1
                        )}
                      </Box>
                    </Collapse>
                  </>
                );
              };

              return (
                <>
                  {renderCategoryTypeSectionMobile(
                    'income',
                    'income',
                    'Income'
                  )}
                  {renderCategoryTypeSectionMobile(
                    'expense',
                    'expense',
                    'Expense'
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
                  <TableCell sx={{ width: '20%' }}>Category</TableCell>
                  <TableCell sx={{ width: '8%' }}>Currency</TableCell>
                  <TableCell align="right" sx={{ width: '12%' }}>
                    Budget
                  </TableCell>
                  <TableCell align="right" sx={{ width: '12%' }}>
                    Actual
                  </TableCell>
                  <TableCell sx={{ width: '20%' }}>Progress</TableCell>
                  <TableCell align="right" sx={{ width: '12%' }}>
                    Remaining
                  </TableCell>
                  <TableCell sx={{ width: '16%' }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {/* Helper function to render a budget row */}
                {(() => {
                  const renderBudgetRow = (budget, indentLevel = 0) => {
                    const category = categoryMap.get(budget.category_id);
                    const isIncome = category?.type === 'Income';
                    const actualAmount = calculateActualAmount(
                      budget,
                      selectedMonth
                    );
                    const budgetAmount = parseFloat(budget.amount || 0);
                    const percentage =
                      budgetAmount > 0
                        ? (actualAmount / budgetAmount) * 100
                        : 0;
                    const remaining = budgetAmount - actualAmount;

                    // For income: green when met/exceeded goal, for expense: green when under budget
                    const getProgressColor = () => {
                      if (isIncome) {
                        return percentage >= 100
                          ? 'success'
                          : percentage >= 80
                          ? 'info'
                          : 'warning';
                      }
                      return percentage > 100
                        ? 'error'
                        : percentage > 80
                        ? 'warning'
                        : 'success';
                    };

                    const getActualColor = () => {
                      if (isIncome) {
                        // For income: green when met/exceeded, neutral otherwise
                        return actualAmount >= budgetAmount
                          ? 'success.main'
                          : 'text.primary';
                      }
                      // For expense: red when over budget
                      return actualAmount > budgetAmount
                        ? 'error.main'
                        : 'text.primary';
                    };

                    const getRemainingColor = () => {
                      if (isIncome) {
                        // For income: exceeded = green, remaining = needs more = neutral
                        return remaining <= 0
                          ? 'success.main'
                          : 'text.secondary';
                      }
                      // For expense: remaining = green, over = red
                      return remaining >= 0 ? 'softGreen.main' : 'softRed.main';
                    };

                    return (
                      <TableRow
                        key={budget.budget_id}
                        hover
                        onClick={() => handleRowClick(budget)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell
                          sx={{ width: '20%', pl: 2 + indentLevel * 3 }}
                        >
                          <Typography variant="body1" fontWeight="medium">
                            {getCategoryName(budget.category_id)}
                          </Typography>
                          {budget.notes && (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                fontSize: '0.75rem',
                                mt: 0.5,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                              }}
                            >
                              {budget.notes}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ width: '8%' }}>
                          {budget.currency}
                        </TableCell>
                        <TableCell align="right" sx={{ width: '12%' }}>
                          {formatCurrency(budgetAmount, budget.currency)}
                        </TableCell>
                        <TableCell align="right" sx={{ width: '12%' }}>
                          <Typography
                            variant="body1"
                            fontWeight="medium"
                            color={getActualColor()}
                          >
                            {formatCurrency(actualAmount, budget.currency)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ width: '20%' }}>
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
                              color={getProgressColor()}
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
                        <TableCell align="right" sx={{ width: '12%' }}>
                          <Typography
                            variant="body1"
                            fontWeight="medium"
                            sx={{ color: getRemainingColor() }}
                          >
                            {formatCurrency(
                              Math.abs(remaining),
                              budget.currency
                            )}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ width: '16%' }}>
                          <Chip
                            label={budget.status}
                            size="small"
                            sx={getStatusChipSx(budget.status)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  };

                  const renderParentCategoryGroup = (
                    parentId,
                    group,
                    typeLabel,
                    indentLevel = 0
                  ) => {
                    const isExpanded = expandedParents.has(
                      `${typeLabel}-${parentId}`
                    );
                    const parentName = group.parent
                      ? group.parent.name
                      : 'Other';

                    return (
                      <Fragment key={`${typeLabel}-${parentId}`}>
                        {/* Parent Category Header Row */}
                        <TableRow
                          onClick={() =>
                            toggleParentExpansion(`${typeLabel}-${parentId}`)
                          }
                          sx={{
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'action.hover' },
                          }}
                        >
                          <TableCell
                            colSpan={7}
                            sx={{ pl: 2 + indentLevel * 3 }}
                          >
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                py: 0.5,
                              }}
                            >
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleParentExpansion(
                                    `${typeLabel}-${parentId}`
                                  );
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
                                        renderBudgetRow(budget, indentLevel + 1)
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

                  const renderRecurringTypeSection = (
                    budgetGroups,
                    typeKey,
                    label,
                    indentLevel = 0
                  ) => {
                    const entries = Object.entries(budgetGroups);
                    if (entries.length === 0) return null;

                    const total = calculateGroupTotal(budgetGroups);
                    const currency = getGroupCurrency(budgetGroups);

                    return (
                      <>
                        <TableRow
                          onClick={() => toggleTypeExpansion(typeKey)}
                          sx={{
                            cursor: 'pointer',
                            '&:hover': { backgroundColor: '#f8f9fa' },
                          }}
                        >
                          <TableCell
                            colSpan={7}
                            sx={{
                              backgroundColor: 'transparent',
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                              pl: 2 + indentLevel * 3,
                            }}
                          >
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                py: 0.5,
                              }}
                            >
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleTypeExpansion(typeKey);
                                }}
                                sx={{ color: '#5f6368' }}
                              >
                                {expandedTypes[typeKey] ? (
                                  <ExpandMoreIcon />
                                ) : (
                                  <ChevronRightIcon />
                                )}
                              </IconButton>
                              <Typography
                                variant="body1"
                                sx={{ fontWeight: 500, color: '#202124' }}
                              >
                                {label}
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ ml: 'auto' }}
                              >
                                {formatCurrency(total, currency)}
                              </Typography>
                            </Box>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            sx={{ py: 0, border: 0, px: 0 }}
                          >
                            <Collapse in={expandedTypes[typeKey]}>
                              <Table size="small">
                                <TableBody>
                                  {entries.map(([parentId, group]) =>
                                    renderParentCategoryGroup(
                                      parentId,
                                      group,
                                      typeKey,
                                      indentLevel + 1
                                    )
                                  )}
                                </TableBody>
                              </Table>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </>
                    );
                  };

                  const renderCategoryTypeSection = (
                    categoryType,
                    typeKey,
                    label
                  ) => {
                    const data = organizedBudgets[categoryType];
                    const hasOneTime = Object.entries(data.oneTime).length > 0;
                    const hasRecurring =
                      Object.entries(data.recurring).length > 0;
                    if (!hasOneTime && !hasRecurring) return null;

                    const oneTimeTotal = calculateGroupTotal(data.oneTime);
                    const recurringTotal = calculateGroupTotal(data.recurring);
                    const total = oneTimeTotal + recurringTotal;
                    const currency = getGroupCurrency(
                      Object.keys(data.oneTime).length > 0
                        ? data.oneTime
                        : data.recurring
                    );

                    return (
                      <>
                        <TableRow
                          onClick={() => toggleTypeExpansion(categoryType)}
                          sx={{
                            cursor: 'pointer',
                            '&:hover': { backgroundColor: '#f8f9fa' },
                          }}
                        >
                          <TableCell
                            colSpan={7}
                            sx={{
                              backgroundColor: 'transparent',
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                            }}
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
                                  toggleTypeExpansion(categoryType);
                                }}
                                sx={{ color: '#5f6368' }}
                              >
                                {expandedTypes[categoryType] ? (
                                  <ExpandMoreIcon />
                                ) : (
                                  <ChevronRightIcon />
                                )}
                              </IconButton>
                              <Typography
                                variant="h6"
                                sx={{
                                  fontWeight: 600,
                                  color: '#202124',
                                }}
                              >
                                {label}
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ ml: 'auto' }}
                              >
                                {formatCurrency(total, currency)}
                              </Typography>
                            </Box>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            sx={{ py: 0, border: 0, px: 0 }}
                          >
                            <Collapse in={expandedTypes[categoryType]}>
                              <Table size="small">
                                <TableBody>
                                  {renderRecurringTypeSection(
                                    data.oneTime,
                                    `${categoryType}OneTime`,
                                    'One-time Budgets',
                                    1
                                  )}
                                  {renderRecurringTypeSection(
                                    data.recurring,
                                    `${categoryType}Recurring`,
                                    'Recurring Budgets',
                                    1
                                  )}
                                </TableBody>
                              </Table>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </>
                    );
                  };

                  return (
                    <>
                      {renderCategoryTypeSection('income', 'income', 'Income')}
                      {renderCategoryTypeSection(
                        'expense',
                        'expense',
                        'Expense'
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
                <CategoryAutocomplete
                  categories={categories}
                  value={watchedCategoryId || ''}
                  onChange={(id) => setValue('categoryId', id)}
                  label="Category *"
                  error={!!errors.categoryId}
                  helperText={errors.categoryId?.message}
                />
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
