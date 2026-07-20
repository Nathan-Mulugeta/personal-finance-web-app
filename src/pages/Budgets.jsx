import { useState, useMemo, Fragment, useCallback } from 'react';
import { useSelector } from 'react-redux';
import {
  selectCategoryMap,
  selectCategoryNameGetter,
} from '../store/selectors';
import {
  Badge,
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
  Select,
  TextField,
  Typography,
  Tooltip,
  Collapse,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import FilterListIcon from '@mui/icons-material/FilterList';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { fetchBudgets } from '../store/slices/budgetsSlice';
import { fetchCategories } from '../store/slices/categoriesSlice';
import { BUDGET_STATUSES } from '../lib/api/budgets';
import EmptyState from '../components/common/EmptyState';
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

  // Flattened grouping (recurring + one-time merged per parent) for the
  // 2-level list: Income/Expense section -> parent group -> budget rows
  const budgetsByType = useMemo(() => {
    const income = filteredBudgets.filter(
      (b) => categoryMap.get(b.category_id)?.type === 'Income'
    );
    const expense = filteredBudgets.filter(
      (b) => categoryMap.get(b.category_id)?.type === 'Expense'
    );
    return {
      income: organizeBudgetsByCategory(income),
      expense: organizeBudgetsByCategory(expense),
    };
  }, [filteredBudgets, organizeBudgetsByCategory, categoryMap]);



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
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mb: { xs: 2, sm: 3 },
        }}
      >
        <Typography
          variant="h4"
          sx={{
            fontSize: { xs: '1.25rem', sm: '1.5rem' },
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          Budgets
        </Typography>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 0.25, sm: 0.5 },
            minWidth: 0,
          }}
        >
          <IconButton
            onClick={handlePreviousMonth}
            size="small"
            aria-label="Previous month"
            sx={{ p: 0.25, color: 'text.secondary' }}
          >
            <ChevronLeftIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <TextField
            size="small"
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            sx={{
              width: { xs: 130, sm: 150 },
              '& .MuiInputBase-input': { py: 0.5, fontSize: '0.8125rem' },
            }}
          />
          <IconButton
            onClick={handleNextMonth}
            size="small"
            aria-label="Next month"
            sx={{ p: 0.25, color: 'text.secondary' }}
          >
            <ChevronRightIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <IconButton
            onClick={() => setFiltersOpen(!filtersOpen)}
            aria-label="Filters"
            sx={{
              ml: { xs: 0.25, sm: 0.5 },
              width: 36,
              height: 36,
              color: 'text.secondary',
              '&:hover': { backgroundColor: 'action.hover' },
            }}
          >
            <Badge
              badgeContent={activeFilterCount}
              color="primary"
              overlap="circular"
              sx={{
                '& .MuiBadge-badge': {
                  fontSize: '0.5625rem',
                  height: 15,
                  minWidth: 15,
                  px: 0.25,
                },
              }}
            >
              <FilterListIcon sx={{ fontSize: 20 }} />
            </Badge>
          </IconButton>
          <IconButton
            onClick={() => handleOpenDialog()}
            aria-label="Add budget"
            sx={{
              width: 36,
              height: 36,
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': { backgroundColor: 'primary.dark' },
            }}
          >
            <AddIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </Box>

      {error && <ErrorMessage error={error} />}

      {/* Overview tiles — compact at-a-glance summary */}
      {filteredBudgets.length > 0 && (
        <Box sx={{ mb: { xs: 2, sm: 3 } }}>
          <Grid container spacing={{ xs: 1.5, md: 3 }}>
            <Grid item xs={4} md={4}>
              <Typography
                variant="caption"
                sx={{ fontSize: { xs: '0.6875rem', md: '0.8125rem' }, color: 'text.secondary' }}
              >
                Income
              </Typography>
              <Typography
                noWrap
                sx={{
                  fontSize: { xs: '0.9375rem', md: '1.375rem' },
                  fontWeight: 600,
                  color: 'google.green',
                }}
              >
                {formatCurrency(budgetStats.income.totalActual, budgetStats.baseCurrency)}
              </Typography>
              <Typography
                noWrap
                variant="caption"
                sx={{
                  fontSize: { xs: '0.625rem', md: '0.75rem' },
                  color: 'text.secondary',
                  display: 'block',
                }}
              >
                of {formatCurrency(budgetStats.income.totalBudget, budgetStats.baseCurrency)}
              </Typography>
            </Grid>
            <Grid item xs={4} md={4}>
              <Typography
                variant="caption"
                sx={{ fontSize: { xs: '0.6875rem', md: '0.8125rem' }, color: 'text.secondary' }}
              >
                Expenses
              </Typography>
              <Typography
                noWrap
                sx={{
                  fontSize: { xs: '0.9375rem', md: '1.375rem' },
                  fontWeight: 600,
                  color: 'google.red',
                }}
              >
                {formatCurrency(budgetStats.expense.totalActual, budgetStats.baseCurrency)}
              </Typography>
              <Typography
                noWrap
                variant="caption"
                sx={{
                  fontSize: { xs: '0.625rem', md: '0.75rem' },
                  color: 'text.secondary',
                  display: 'block',
                }}
              >
                of {formatCurrency(budgetStats.expense.totalBudget, budgetStats.baseCurrency)}
              </Typography>
            </Grid>
            <Grid item xs={4} md={4}>
              <Typography
                variant="caption"
                sx={{ fontSize: { xs: '0.6875rem', md: '0.8125rem' }, color: 'text.secondary' }}
              >
                Net
              </Typography>
              <Typography
                noWrap
                sx={{
                  fontSize: { xs: '0.9375rem', md: '1.375rem' },
                  fontWeight: 600,
                  color: budgetStats.income.totalActual - budgetStats.expense.totalActual >= 0
                    ? 'google.green'
                    : 'google.red',
                }}
              >
                {formatCurrency(budgetStats.income.totalActual - budgetStats.expense.totalActual, budgetStats.baseCurrency)}
              </Typography>
              <Typography
                noWrap
                variant="caption"
                sx={{
                  fontSize: { xs: '0.625rem', md: '0.75rem' },
                  color: 'text.secondary',
                  display: 'block',
                }}
              >
                of {formatCurrency(budgetStats.income.totalBudget - budgetStats.expense.totalBudget, budgetStats.baseCurrency)}
              </Typography>
            </Grid>
          </Grid>
        </Box>
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
        <EmptyState
          icon={<AccountBalanceWalletIcon />}
          title="No budgets yet"
          subtitle="Create your first budget to track your spending"
          action={
            <Button
              variant="contained"
              startIcon={<AddIcon sx={{ fontSize: 18 }} />}
              onClick={() => handleOpenDialog()}
              sx={{ textTransform: 'none', minHeight: 36 }}
            >
              Create Budget
            </Button>
          }
        />
      ) : (
        (() => {
          const baseCurrency =
            settings.find((s) => s.setting_key === 'BaseCurrency')
              ?.setting_value || 'USD';

          const pressableSx = {
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            userSelect: 'none',
            '&:active': { backgroundColor: 'action.hover' },
            '@media (hover: hover)': {
              '&:hover': { backgroundColor: 'action.hover' },
            },
          };

          const renderBudgetRow = (budget, indentLevel = 0) => {
            const category = categoryMap.get(budget.category_id);
            const isIncome = category?.type === 'Income';
            const actualAmount = calculateActualAmount(budget, selectedMonth);
            const budgetAmount = parseFloat(budget.amount || 0);
            const percentage =
              budgetAmount > 0 ? (actualAmount / budgetAmount) * 100 : 0;
            const remaining = budgetAmount - actualAmount;

            const progressColor = isIncome
              ? percentage >= 100
                ? 'success'
                : percentage >= 80
                ? 'info'
                : 'warning'
              : percentage > 100
              ? 'error'
              : percentage > 80
              ? 'warning'
              : 'success';
            const remainingColor = isIncome
              ? remaining <= 0
                ? 'google.green'
                : 'text.secondary'
              : remaining >= 0
              ? 'google.green'
              : 'google.red';
            const remainingLabel = isIncome
              ? remaining <= 0
                ? 'Exceeded'
                : 'To Goal'
              : remaining >= 0
              ? 'Remaining'
              : 'Over';

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
                      gap: 0.5,
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ fontSize: '0.9375rem', fontWeight: 500, minWidth: 0 }}
                    >
                      {getCategoryName(budget.category_id)}
                    </Typography>
                    {budget.recurring && (
                      <Tooltip title="Recurring monthly">
                        <AutorenewIcon
                          sx={{ fontSize: 13, color: 'text.disabled', flexShrink: 0 }}
                        />
                      </Tooltip>
                    )}
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
                    sx={{ fontSize: '0.9375rem', fontWeight: 600, flexShrink: 0 }}
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
                      color: remainingColor,
                    }}
                  >
                    {remainingLabel}:{' '}
                    {formatCurrency(Math.abs(remaining), budget.currency)}
                  </Typography>
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{ fontSize: '0.6875rem', color: 'text.secondary', minWidth: 0 }}
                  >
                    of {formatCurrency(budgetAmount, budget.currency)} ·{' '}
                    {percentage.toFixed(0)}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(percentage, 100)}
                  color={progressColor}
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
                    sx={{ fontSize: '0.6875rem', display: 'block', mt: 0.5 }}
                  >
                    {budget.notes}
                  </Typography>
                )}
              </Box>
            );
          };

          const renderParentGroup = (parentId, group, typeKey) => {
            const subEntries = Object.values(group.subcategories);
            // Budget set directly on the category (no real subcategories) —
            // render as plain rows, no extra expand level
            const isSimple =
              subEntries.length === 1 &&
              subEntries[0].category.category_id === parentId;
            if (isSimple) {
              return (
                <Fragment key={`${typeKey}-${parentId}`}>
                  {subEntries[0].budgets.map((b) => renderBudgetRow(b, 0))}
                </Fragment>
              );
            }

            const expandKey = `${typeKey}-${parentId}`;
            const isExpanded = expandedParents.has(expandKey);
            return (
              <Fragment key={expandKey}>
                <Box
                  onClick={() => toggleParentExpansion(expandKey)}
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
                      transform: isExpanded ? 'none' : 'rotate(-90deg)',
                      transition: 'transform 0.15s ease-in-out',
                    }}
                  />
                  <Typography
                    noWrap
                    sx={{ fontSize: '0.9375rem', fontWeight: 600, flex: 1, minWidth: 0 }}
                  >
                    {group.parent ? group.parent.name : 'Other'}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.6875rem', color: 'text.secondary', flexShrink: 0 }}
                  >
                    {formatCurrency(group.totalAmount, baseCurrency)}
                  </Typography>
                </Box>
                <Collapse in={isExpanded}>
                  {subEntries.map((sub) =>
                    sub.budgets.map((b) => renderBudgetRow(b, 1))
                  )}
                </Collapse>
              </Fragment>
            );
          };

          const renderTypeSection = (typeKey, label) => {
            const entries = Object.entries(budgetsByType[typeKey]);
            if (entries.length === 0) return null;
            return (
              <Box sx={{ mb: 3 }}>
                <Typography
                  sx={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                    mb: 0.5,
                  }}
                >
                  {label}
                </Typography>
                {entries.map(([parentId, group]) =>
                  renderParentGroup(parentId, group, typeKey)
                )}
              </Box>
            );
          };

          return (
            <Box>
              {renderTypeSection('income', 'Income')}
              {renderTypeSection('expense', 'Expenses')}
            </Box>
          );
        })()
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
