import { useState, useMemo, Fragment, useCallback } from 'react';
import { useSelector } from 'react-redux';
import {
  selectCategoryMap,
  selectCategoryNameGetter,
} from '../store/selectors';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
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
  Tooltip,
  Collapse,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import FilterListIcon from '@mui/icons-material/FilterList';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { fetchBudgets } from '../store/slices/budgetsSlice';
import { fetchCategories } from '../store/slices/categoriesSlice';
import { BUDGET_STATUSES } from '../lib/api/budgets';
import PageSkeleton from '../components/common/PageSkeleton';
import ErrorMessage from '../components/common/ErrorMessage';
import BudgetDialog from '../components/common/BudgetDialog';
import { budgetAppliesToMonth } from '../utils/budgetMatching';
import { getStatusChipSx } from '../utils/chipStyles';
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
  const theme = useTheme();
  // Matches the md breakpoint previously used for the CSS card/table switch
  const isDesktopView = useMediaQuery(theme.breakpoints.up('md'));
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

    // Filter by selected month (shared matching rules with the Reports page)
    if (selectedMonth) {
      filtered = filtered.filter((budget) =>
        budgetAppliesToMonth(budget, selectedMonth)
      );
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

    // Find secondary currency (first currency in budgets that's different from base)
    const currencies = new Set(
      filteredBudgets.map((b) => b.currency).filter(Boolean)
    );
    const secondaryCurrency =
      Array.from(currencies).find((c) => c !== baseCurrency) || null;

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
      secondaryCurrency,
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
    setEditingBudget(budget);
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
    const baseCurrency =
      settings.find((s) => s.setting_key === 'BaseCurrency')?.setting_value ||
      'USD';

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
        const budgetCurrency = budget.currency || 'USD';

        // Convert to base currency for consistent totals
        const convertedAmount =
          convertAmountWithExchangeRates(
            budgetAmount,
            budgetCurrency,
            baseCurrency,
            exchangeRates
          ) ?? budgetAmount;

        grouped[parentId].subcategories[subcategoryId].budgets.push(budget);
        grouped[parentId].subcategories[subcategoryId].totalAmount +=
          convertedAmount;
        grouped[parentId].totalAmount += convertedAmount;
      });

      return grouped;
    };
  }, [categoryMap, settings, exchangeRates]);

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
  // Always use base currency since totals are now converted to base currency
  const getGroupCurrency = useCallback(
    (budgetGroups) => {
      const baseCurrency =
        settings.find((s) => s.setting_key === 'BaseCurrency')?.setting_value ||
        'USD';
      return baseCurrency;
    },
    [settings]
  );

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

  if (loading && budgets.length === 0) {
    return <PageSkeleton />;
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
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                    }}
                  >
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
                    {budgetStats.secondaryCurrency && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          fontSize: { xs: '0.7rem', sm: '0.75rem' },
                          mt: 0.25,
                        }}
                      >
                        {formatCurrency(
                          convertAmountWithExchangeRates(
                            budgetStats.income.totalBudget,
                            budgetStats.baseCurrency,
                            budgetStats.secondaryCurrency,
                            exchangeRates
                          ) || budgetStats.income.totalBudget,
                          budgetStats.secondaryCurrency
                        )}
                      </Typography>
                    )}
                  </Box>
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
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                    }}
                  >
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
                    {budgetStats.secondaryCurrency && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          fontSize: { xs: '0.7rem', sm: '0.75rem' },
                          mt: 0.25,
                        }}
                      >
                        {formatCurrency(
                          convertAmountWithExchangeRates(
                            budgetStats.income.totalActual,
                            budgetStats.baseCurrency,
                            budgetStats.secondaryCurrency,
                            exchangeRates
                          ) || budgetStats.income.totalActual,
                          budgetStats.secondaryCurrency
                        )}
                      </Typography>
                    )}
                  </Box>
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
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                    }}
                  >
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
                    {budgetStats.secondaryCurrency && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          fontSize: { xs: '0.7rem', sm: '0.75rem' },
                          mt: 0.25,
                        }}
                      >
                        {formatCurrency(
                          convertAmountWithExchangeRates(
                            Math.abs(budgetStats.income.totalRemaining),
                            budgetStats.baseCurrency,
                            budgetStats.secondaryCurrency,
                            exchangeRates
                          ) || Math.abs(budgetStats.income.totalRemaining),
                          budgetStats.secondaryCurrency
                        )}
                      </Typography>
                    )}
                  </Box>
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
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                }}
              >
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
                {budgetStats.secondaryCurrency && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      fontSize: { xs: '0.7rem', sm: '0.75rem' },
                      mt: 0.25,
                    }}
                  >
                    {formatCurrency(
                      convertAmountWithExchangeRates(
                        budgetStats.expense.totalBudget,
                        budgetStats.baseCurrency,
                        budgetStats.secondaryCurrency,
                        exchangeRates
                      ) || budgetStats.expense.totalBudget,
                      budgetStats.secondaryCurrency
                    )}
                  </Typography>
                )}
              </Box>
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
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                }}
              >
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
                {budgetStats.secondaryCurrency && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      fontSize: { xs: '0.7rem', sm: '0.75rem' },
                      mt: 0.25,
                    }}
                  >
                    {formatCurrency(
                      convertAmountWithExchangeRates(
                        budgetStats.expense.totalActual,
                        budgetStats.baseCurrency,
                        budgetStats.secondaryCurrency,
                        exchangeRates
                      ) || budgetStats.expense.totalActual,
                      budgetStats.secondaryCurrency
                    )}
                  </Typography>
                )}
              </Box>
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
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                }}
              >
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
                {budgetStats.secondaryCurrency && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      fontSize: { xs: '0.7rem', sm: '0.75rem' },
                      mt: 0.25,
                    }}
                  >
                    {formatCurrency(
                      convertAmountWithExchangeRates(
                        Math.abs(budgetStats.expense.totalRemaining),
                        budgetStats.baseCurrency,
                        budgetStats.secondaryCurrency,
                        exchangeRates
                      ) || Math.abs(budgetStats.expense.totalRemaining),
                      budgetStats.secondaryCurrency
                    )}
                  </Typography>
                )}
              </Box>
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
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                  }}
                >
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
                  {budgetStats.secondaryCurrency && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        fontSize: { xs: '0.7rem', sm: '0.75rem' },
                        mt: 0.25,
                      }}
                    >
                      {formatCurrency(
                        convertAmountWithExchangeRates(
                          budgetStats.income.totalBudget -
                            budgetStats.expense.totalBudget,
                          budgetStats.baseCurrency,
                          budgetStats.secondaryCurrency,
                          exchangeRates
                        ) ||
                          budgetStats.income.totalBudget -
                            budgetStats.expense.totalBudget,
                        budgetStats.secondaryCurrency
                      )}
                    </Typography>
                  )}
                </Box>
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
          {/* Mobile dense-row view (matches the Reports page language) */}
          {!isDesktopView && (
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              backgroundColor: 'background.paper',
              px: 1.25,
              overflow: 'hidden',
            }}
          >
            {(() => {
              // Tappable rows: no browser tap highlight, no sticky hover
              const pressableSx = {
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                userSelect: 'none',
                '&:active': { backgroundColor: 'action.hover' },
                '@media (hover: hover)': {
                  '&:hover': { backgroundColor: 'action.hover' },
                },
              };

              const expandChevron = (expanded, size = 18) => (
                <ExpandMoreIcon
                  sx={{
                    fontSize: size,
                    color: 'text.secondary',
                    flexShrink: 0,
                    transform: expanded ? 'none' : 'rotate(-90deg)',
                    transition: 'transform 0.15s ease-in-out',
                  }}
                />
              );

              const renderBudgetRow = (budget, indentLevel = 0) => {
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
                    return remaining <= 0 ? 'google.green' : 'text.secondary';
                  }
                  return remaining >= 0 ? 'google.green' : 'google.red';
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
                    onClick={() => handleRowClick(budget)}
                    sx={{
                      py: 1.25,
                      pl: indentLevel * 2,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      ...pressableSx,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.75,
                          minWidth: 0,
                          flex: 1,
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
                          {getCategoryName(budget.category_id)}
                        </Typography>
                        {budget.status !== 'Active' && (
                          <Chip
                            label={budget.status}
                            size="small"
                            sx={{
                              height: 16,
                              fontSize: '0.625rem',
                              flexShrink: 0,
                              ...getStatusChipSx(budget.status),
                            }}
                          />
                        )}
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {formatCurrency(actualAmount, budget.currency)}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 1,
                        mt: 0.25,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: '0.6875rem',
                          fontWeight: 500,
                          color: getRemainingColor(),
                        }}
                      >
                        {getRemainingLabel()}:{' '}
                        {formatCurrency(Math.abs(remaining), budget.currency)}
                      </Typography>
                      <Typography
                        variant="caption"
                        noWrap
                        sx={{
                          fontSize: '0.6875rem',
                          color: 'text.secondary',
                          minWidth: 0,
                        }}
                      >
                        of {formatCurrency(budgetAmount, budget.currency)} ·{' '}
                        {percentage.toFixed(0)}%
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(percentage, 100)}
                      color={getProgressColor()}
                      sx={{
                        mt: 0.75,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: 'action.hover',
                      }}
                    />
                    {budget.notes && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        sx={{
                          fontSize: '0.6875rem',
                          display: 'block',
                          mt: 0.5,
                        }}
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
                  <Box key={`${typeLabel}-${parentId}-mobile`}>
                    <Box
                      onClick={() =>
                        toggleParentExpansion(`${typeLabel}-${parentId}`)
                      }
                      sx={{
                        py: 1,
                        pl: indentLevel * 2,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        ...pressableSx,
                      }}
                    >
                      {expandChevron(isExpanded)}
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        {parentName}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: '0.6875rem',
                          color: 'text.secondary',
                          flexShrink: 0,
                        }}
                      >
                        {formatCurrency(
                          group.totalAmount,
                          settings.find((s) => s.setting_key === 'BaseCurrency')
                            ?.setting_value || 'USD'
                        )}
                      </Typography>
                    </Box>
                    <Collapse in={isExpanded}>
                      <Box>
                        {Object.entries(group.subcategories).map(
                          ([, subcategory]) =>
                            subcategory.budgets.map((budget) =>
                              renderBudgetRow(budget, indentLevel + 1)
                            )
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
                      onClick={() => toggleTypeExpansion(typeKey)}
                      sx={{
                        py: 1,
                        pl: indentLevel * 2,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        ...pressableSx,
                      }}
                    >
                      {expandChevron(expandedTypes[typeKey])}
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{
                          fontSize: '0.8125rem',
                          fontWeight: 500,
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        {label}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: '0.6875rem',
                          color: 'text.secondary',
                          flexShrink: 0,
                        }}
                      >
                        {formatCurrency(total, currency)}
                      </Typography>
                    </Box>
                    <Collapse in={expandedTypes[typeKey]}>
                      <Box>
                        {entries.map(([parentId, group]) =>
                          renderParentCategoryGroupMobile(
                            parentId,
                            group,
                            typeKey,
                            indentLevel + 1
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
                      onClick={() => toggleTypeExpansion(categoryType)}
                      sx={{
                        py: 1.25,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        ...pressableSx,
                      }}
                    >
                      {expandChevron(expandedTypes[categoryType], 20)}
                      <Typography
                        noWrap
                        sx={{
                          fontSize: '0.9375rem',
                          fontWeight: 600,
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        {label}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.75rem',
                          color: 'text.secondary',
                          flexShrink: 0,
                        }}
                      >
                        {formatCurrency(total, currency)}
                      </Typography>
                    </Box>
                    <Collapse in={expandedTypes[categoryType]}>
                      <Box>
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
          )}

          {/* Desktop Table View */}
          {isDesktopView && (
          <TableContainer component={Paper}>
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
                                  settings.find(
                                    (s) => s.setting_key === 'BaseCurrency'
                                  )?.setting_value || 'USD'
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
                            '&:hover': { backgroundColor: 'google.grayLight' },
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
                                sx={{ color: 'google.gray' }}
                              >
                                {expandedTypes[typeKey] ? (
                                  <ExpandMoreIcon />
                                ) : (
                                  <ChevronRightIcon />
                                )}
                              </IconButton>
                              <Typography
                                variant="body1"
                                sx={{ fontWeight: 500, color: 'text.primary' }}
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
                            '&:hover': { backgroundColor: 'google.grayLight' },
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
                                sx={{ color: 'google.gray' }}
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
                                  color: 'text.primary',
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
          )}
        </Box>
      )}

      {/* Create/Edit Dialog */}
      {/* Create/Edit Budget Dialog (shared with Reports) */}
      <BudgetDialog
        open={openDialog}
        onClose={handleCloseDialog}
        editingBudget={editingBudget}
        referenceMonth={selectedMonth}
      />
    </Box>
  );
}

export default Budgets;
