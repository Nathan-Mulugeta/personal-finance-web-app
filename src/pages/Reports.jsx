import { useState, useMemo, Fragment } from 'react';
import { useSelector } from 'react-redux';
import {
  Box,
  Card,
  CardContent,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { usePageRefresh } from '../hooks/usePageRefresh';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import {
  formatCurrency,
  convertAmountWithExchangeRates,
} from '../utils/currencyConversion';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  parseISO,
} from 'date-fns';
import { getCategoryDescendants } from '../utils/categoryHierarchy';

function Reports() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { allTransactions, loading, isInitialized, error } = useSelector(
    (state) => state.transactions
  );
  const { budgets } = useSelector((state) => state.budgets);
  const { categories } = useSelector((state) => state.categories);
  const { settings } = useSelector((state) => state.settings);
  const { exchangeRates } = useSelector((state) => state.exchangeRates);

  // Refresh data on navigation
  usePageRefresh({
    dataTypes: ['transactions', 'categories', 'budgets', 'exchangeRates'],
  });

  // State
  const [selectedMonth, setSelectedMonth] = useState(
    format(new Date(), 'yyyy-MM')
  );
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [selectedCategoryForModal, setSelectedCategoryForModal] =
    useState(null);

  // Get base currency
  const baseCurrency =
    settings.find((s) => s.setting_key === 'BaseCurrency')?.setting_value ||
    'USD';

  // Month navigation handlers
  const handlePreviousMonth = () => {
    const currentDate = parseISO(`${selectedMonth}-01`);
    const newDate = subMonths(currentDate, 1);
    setSelectedMonth(format(newDate, 'yyyy-MM'));
  };

  const handleNextMonth = () => {
    const currentDate = parseISO(`${selectedMonth}-01`);
    const newDate = addMonths(currentDate, 1);
    setSelectedMonth(format(newDate, 'yyyy-MM'));
  };

  // Toggle category expansion
  const toggleCategoryExpansion = (categoryId) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // Get all category IDs including descendants
  const getCategoryAndDescendantIds = (categoryId) => {
    const descendants = getCategoryDescendants(categoryId, categories);
    return [categoryId, ...descendants.map((d) => d.category_id)];
  };

  // Calculate budget for a category in a given month (converted to base currency)
  const calculateCategoryBudget = (categoryId, month) => {
    const categoryIds = getCategoryAndDescendantIds(categoryId);
    const [year, monthNum] = month.split('-');
    const monthDate = parseISO(`${year}-${monthNum}-01`);

    let totalBudget = 0;
    const currencies = new Set();
    const originalAmountsByCurrency = {}; // Track original amounts by currency

    budgets.forEach((budget) => {
      if (!categoryIds.includes(budget.category_id)) return;
      if (budget.status !== 'Active') return;

      let appliesToMonth = false;

      if (budget.recurring) {
        // Recurring budget
        if (budget.start_month) {
          const startDate = parseISO(budget.start_month);
          if (monthDate >= startOfMonth(startDate)) {
            if (!budget.end_month) {
              appliesToMonth = true;
            } else {
              const endDate = parseISO(budget.end_month);
              if (monthDate <= endOfMonth(endDate)) {
                appliesToMonth = true;
              }
            }
          }
        }
      } else {
        // One-time budget
        if (budget.month) {
          const budgetMonth = parseISO(budget.month);
          if (
            monthDate >= startOfMonth(budgetMonth) &&
            monthDate <= endOfMonth(budgetMonth)
          ) {
            appliesToMonth = true;
          }
        }
      }

      if (appliesToMonth) {
        const budgetAmount = parseFloat(budget.amount || 0);
        const budgetCurrency = budget.currency || baseCurrency;

        // Track original amount by currency
        if (!originalAmountsByCurrency[budgetCurrency]) {
          originalAmountsByCurrency[budgetCurrency] = 0;
        }
        originalAmountsByCurrency[budgetCurrency] += budgetAmount;

        // Convert to base currency
        const convertedAmount = convertAmountWithExchangeRates(
          budgetAmount,
          budgetCurrency,
          baseCurrency,
          exchangeRates
        );

        // Use converted amount if available, otherwise use original
        totalBudget +=
          convertedAmount !== null ? convertedAmount : budgetAmount;
        if (budgetCurrency) {
          currencies.add(budgetCurrency);
        }
      }
    });

    return {
      amount: totalBudget,
      currencies: Array.from(currencies),
      isMixed: currencies.size > 1,
      originalAmountsByCurrency,
    };
  };

  // Calculate actual transactions for a category in a given month (including descendants, converted to base currency)
  const calculateCategoryActual = (
    categoryId,
    month,
    type,
    includeDescendants = true
  ) => {
    const categoryIds = includeDescendants
      ? getCategoryAndDescendantIds(categoryId)
      : [categoryId];
    const [year, monthNum] = month.split('-');
    const monthStart = startOfMonth(parseISO(`${year}-${monthNum}-01`));
    const monthEnd = endOfMonth(parseISO(`${year}-${monthNum}-01`));

    let totalActual = 0;
    const currencies = new Set();
    const transactions = [];
    const originalAmountsByCurrency = {}; // Track original amounts by currency

    allTransactions.forEach((txn) => {
      if (!categoryIds.includes(txn.category_id)) return;
      if (txn.status === 'Cancelled' || txn.deleted_at) return;

      // Filter by type
      if (type === 'Income') {
        if (txn.type !== 'Income') return;
      } else if (type === 'Expense') {
        if (txn.type !== 'Expense' && txn.type !== 'Transfer Out') return;
      }

      // Filter by date
      const txnDate = parseISO(txn.date);
      if (txnDate < monthStart || txnDate > monthEnd) return;

      const amount = Math.abs(parseFloat(txn.amount || 0));
      const txnCurrency = txn.currency || baseCurrency;

      // Track original amount by currency
      if (!originalAmountsByCurrency[txnCurrency]) {
        originalAmountsByCurrency[txnCurrency] = 0;
      }
      originalAmountsByCurrency[txnCurrency] += amount;

      // Convert to base currency
      const convertedAmount = convertAmountWithExchangeRates(
        amount,
        txnCurrency,
        baseCurrency,
        exchangeRates
      );

      // Use converted amount if available, otherwise use original
      totalActual += convertedAmount !== null ? convertedAmount : amount;
      if (txnCurrency) {
        currencies.add(txnCurrency);
      }
      transactions.push(txn);
    });

    return {
      amount: totalActual,
      currencies: Array.from(currencies),
      isMixed: currencies.size > 1,
      transactions,
      originalAmountsByCurrency,
    };
  };

  // Organize categories by type and build tree
  const organizeCategoriesByType = (type) => {
    const categoryMap = new Map();
    const rootCategories = [];

    // Filter by type and status
    const filteredCategories = categories.filter(
      (cat) => cat.type === type && cat.status === 'Active'
    );

    // Create map
    filteredCategories.forEach((cat) => {
      categoryMap.set(cat.category_id, { ...cat, children: [] });
    });

    // Build tree
    filteredCategories.forEach((cat) => {
      const categoryNode = categoryMap.get(cat.category_id);
      if (cat.parent_category_id) {
        const parent = categoryMap.get(cat.parent_category_id);
        if (parent) {
          parent.children.push(categoryNode);
        } else {
          // Orphaned category, add to root
          rootCategories.push(categoryNode);
        }
      } else {
        rootCategories.push(categoryNode);
      }
    });

    return rootCategories;
  };

  // Calculate category data (budget, actual, difference, variance)
  const calculateCategoryData = (category, type) => {
    const budgetData = calculateCategoryBudget(
      category.category_id,
      selectedMonth
    );

    // If category has children, calculate separately to avoid double-counting
    let budgetAmount = budgetData.amount;
    let actualAmount = 0;
    let allCurrencies = new Set([...budgetData.currencies]);
    let budgetOriginalAmounts = { ...budgetData.originalAmountsByCurrency };
    let actualOriginalAmounts = {};

    if (category.children && category.children.length > 0) {
      // For parent categories: calculate direct transactions + sum of children
      // First, calculate the parent's own budget (without children) to avoid double-counting
      const parentOwnBudgetData = calculateCategoryBudget(
        category.category_id,
        selectedMonth
      );
      // But we need to subtract children's budgets since getCategoryAndDescendantIds includes them
      // So we'll calculate children separately and use that

      const directActual = calculateCategoryActual(
        category.category_id,
        selectedMonth,
        type,
        false // Don't include descendants for direct calculation
      );
      actualAmount = directActual.amount;
      directActual.currencies.forEach((c) => allCurrencies.add(c));
      Object.keys(directActual.originalAmountsByCurrency || {}).forEach(
        (currency) => {
          actualOriginalAmounts[currency] =
            (actualOriginalAmounts[currency] || 0) +
            (directActual.originalAmountsByCurrency[currency] || 0);
        }
      );

      let childrenBudget = 0;
      let childrenActual = 0;
      const childrenCurrencies = new Set();
      // Reset budgetOriginalAmounts to only include parent's own budget
      budgetOriginalAmounts = {};

      category.children.forEach((child) => {
        const childBudget = calculateCategoryBudget(
          child.category_id,
          selectedMonth
        );
        const childActual = calculateCategoryActual(
          child.category_id,
          selectedMonth,
          type,
          true // Include descendants for children
        );
        childrenBudget += childBudget.amount;
        childrenActual += childActual.amount;
        childBudget.currencies.forEach((c) => childrenCurrencies.add(c));
        childActual.currencies.forEach((c) => childrenCurrencies.add(c));

        // Aggregate original amounts
        Object.keys(childBudget.originalAmountsByCurrency || {}).forEach(
          (currency) => {
            budgetOriginalAmounts[currency] =
              (budgetOriginalAmounts[currency] || 0) +
              (childBudget.originalAmountsByCurrency[currency] || 0);
          }
        );
        Object.keys(childActual.originalAmountsByCurrency || {}).forEach(
          (currency) => {
            actualOriginalAmounts[currency] =
              (actualOriginalAmounts[currency] || 0) +
              (childActual.originalAmountsByCurrency[currency] || 0);
          }
        );
      });

      // Calculate parent's own budget (without children)
      // We need to get budgets that are directly assigned to the parent category, not its children
      const parentOwnBudgets = budgets.filter((budget) => {
        if (budget.category_id !== category.category_id) return false;
        if (budget.status !== 'Active') return false;

        const [year, monthNum] = selectedMonth.split('-');
        const monthDate = parseISO(`${year}-${monthNum}-01`);

        let appliesToMonth = false;
        if (budget.recurring) {
          if (budget.start_month) {
            const startDate = parseISO(budget.start_month);
            if (monthDate >= startOfMonth(startDate)) {
              if (!budget.end_month) {
                appliesToMonth = true;
              } else {
                const endDate = parseISO(budget.end_month);
                if (monthDate <= endOfMonth(endDate)) {
                  appliesToMonth = true;
                }
              }
            }
          }
        } else {
          if (budget.month) {
            const budgetMonth = parseISO(budget.month);
            if (
              monthDate >= startOfMonth(budgetMonth) &&
              monthDate <= endOfMonth(budgetMonth)
            ) {
              appliesToMonth = true;
            }
          }
        }
        return appliesToMonth;
      });

      let parentOwnBudget = 0;
      parentOwnBudgets.forEach((budget) => {
        const budgetAmount = parseFloat(budget.amount || 0);
        const budgetCurrency = budget.currency || baseCurrency;
        const convertedAmount = convertAmountWithExchangeRates(
          budgetAmount,
          budgetCurrency,
          baseCurrency,
          exchangeRates
        );
        parentOwnBudget +=
          convertedAmount !== null ? convertedAmount : budgetAmount;
        if (!budgetOriginalAmounts[budgetCurrency]) {
          budgetOriginalAmounts[budgetCurrency] = 0;
        }
        budgetOriginalAmounts[budgetCurrency] += budgetAmount;
        allCurrencies.add(budgetCurrency);
      });

      // Parent category budget: sum of parent's own budget + children's budgets
      budgetAmount = parentOwnBudget + childrenBudget;

      // Actual: direct + sum of children
      actualAmount += childrenActual;
      childrenCurrencies.forEach((c) => allCurrencies.add(c));
    } else {
      // For leaf categories: calculate including descendants (in case there are nested categories)
      const actualData = calculateCategoryActual(
        category.category_id,
        selectedMonth,
        type,
        true
      );
      actualAmount = actualData.amount;
      actualData.currencies.forEach((c) => allCurrencies.add(c));
      actualOriginalAmounts = {
        ...(actualData.originalAmountsByCurrency || {}),
      };
    }

    const difference = budgetAmount - actualAmount;
    // Variance: (actual - budget) / budget * 100
    // Negative means actual < budget (short for income, under budget for expense)
    // Positive means actual > budget (exceeded for income, over budget for expense)
    const variance =
      budgetAmount > 0
        ? ((actualAmount - budgetAmount) / budgetAmount) * 100
        : null;

    // Calculate difference original amounts
    const differenceOriginalAmounts = {};
    Object.keys(budgetOriginalAmounts).forEach((currency) => {
      differenceOriginalAmounts[currency] =
        (budgetOriginalAmounts[currency] || 0) -
        (actualOriginalAmounts[currency] || 0);
    });
    Object.keys(actualOriginalAmounts).forEach((currency) => {
      if (!differenceOriginalAmounts[currency]) {
        differenceOriginalAmounts[currency] = -(
          actualOriginalAmounts[currency] || 0
        );
      }
    });

    // Check if actually mixed (multiple different currencies with amounts)
    const currenciesWithBudgetAmounts = Object.keys(
      budgetOriginalAmounts
    ).filter((currency) => budgetOriginalAmounts[currency] > 0);
    const currenciesWithActualAmounts = Object.keys(
      actualOriginalAmounts
    ).filter((currency) => actualOriginalAmounts[currency] > 0);
    const allCurrenciesWithAmounts = new Set([
      ...currenciesWithBudgetAmounts,
      ...currenciesWithActualAmounts,
    ]);
    const isActuallyMixed = allCurrenciesWithAmounts.size > 1;

    return {
      budget: budgetAmount,
      actual: actualAmount,
      difference,
      variance,
      currencies: Array.from(allCurrencies),
      isMixed: isActuallyMixed,
      budgetOriginalAmounts,
      actualOriginalAmounts,
      differenceOriginalAmounts,
    };
  };

  // Build report data for a type (Income or Expense)
  const buildReportData = (type) => {
    const categoryTree = organizeCategoriesByType(type);
    const reportData = [];

    categoryTree.forEach((category) => {
      const data = calculateCategoryData(category, type);
      // Include category if it has budget, actual, or children with data
      const hasChildrenData =
        category.children &&
        category.children.some((child) => {
          const childData = calculateCategoryData(child, type);
          return childData.budget > 0 || childData.actual > 0;
        });

      if (data.budget > 0 || data.actual > 0 || hasChildrenData) {
        reportData.push({
          category,
          ...data,
        });
      }
    });

    return reportData;
  };

  // Calculate totals for a section
  const calculateSectionTotals = (reportData) => {
    let totalBudget = 0;
    let totalActual = 0;
    const allCurrencies = new Set();
    const totalBudgetOriginalAmounts = {};
    const totalActualOriginalAmounts = {};

    reportData.forEach((item) => {
      totalBudget += item.budget;
      totalActual += item.actual;
      item.currencies.forEach((c) => allCurrencies.add(c));

      // Aggregate original amounts
      Object.keys(item.budgetOriginalAmounts || {}).forEach((currency) => {
        totalBudgetOriginalAmounts[currency] =
          (totalBudgetOriginalAmounts[currency] || 0) +
          (item.budgetOriginalAmounts[currency] || 0);
      });
      Object.keys(item.actualOriginalAmounts || {}).forEach((currency) => {
        totalActualOriginalAmounts[currency] =
          (totalActualOriginalAmounts[currency] || 0) +
          (item.actualOriginalAmounts[currency] || 0);
      });
    });

    const totalDifference = totalBudget - totalActual;
    // Variance: (actual - budget) / budget * 100
    const totalVariance =
      totalBudget > 0
        ? ((totalActual - totalBudget) / totalBudget) * 100
        : null;

    // Calculate difference original amounts
    const totalDifferenceOriginalAmounts = {};
    Object.keys(totalBudgetOriginalAmounts).forEach((currency) => {
      totalDifferenceOriginalAmounts[currency] =
        (totalBudgetOriginalAmounts[currency] || 0) -
        (totalActualOriginalAmounts[currency] || 0);
    });
    Object.keys(totalActualOriginalAmounts).forEach((currency) => {
      if (!totalDifferenceOriginalAmounts[currency]) {
        totalDifferenceOriginalAmounts[currency] = -(
          totalActualOriginalAmounts[currency] || 0
        );
      }
    });

    // Check if actually mixed (multiple different currencies with amounts)
    const currenciesWithBudgetAmounts = Object.keys(
      totalBudgetOriginalAmounts
    ).filter((currency) => totalBudgetOriginalAmounts[currency] > 0);
    const currenciesWithActualAmounts = Object.keys(
      totalActualOriginalAmounts
    ).filter((currency) => totalActualOriginalAmounts[currency] > 0);
    const allCurrenciesWithAmounts = new Set([
      ...currenciesWithBudgetAmounts,
      ...currenciesWithActualAmounts,
    ]);
    const isActuallyMixed = allCurrenciesWithAmounts.size > 1;

    return {
      budget: totalBudget,
      actual: totalActual,
      difference: totalDifference,
      variance: totalVariance,
      currencies: Array.from(allCurrencies),
      isMixed: isActuallyMixed,
      budgetOriginalAmounts: totalBudgetOriginalAmounts,
      actualOriginalAmounts: totalActualOriginalAmounts,
      differenceOriginalAmounts: totalDifferenceOriginalAmounts,
    };
  };

  // Get transactions for modal
  const getTransactionsForModal = () => {
    if (!selectedCategoryForModal) return [];

    const { categoryId, type } = selectedCategoryForModal;
    const categoryIds = getCategoryAndDescendantIds(categoryId);
    const [year, monthNum] = selectedMonth.split('-');
    const monthStart = startOfMonth(parseISO(`${year}-${monthNum}-01`));
    const monthEnd = endOfMonth(parseISO(`${year}-${monthNum}-01`));

    return allTransactions
      .filter((txn) => {
        if (!categoryIds.includes(txn.category_id)) return false;
        if (txn.status === 'Cancelled' || txn.deleted_at) return false;

        if (type === 'Income') {
          if (txn.type !== 'Income') return false;
        } else if (type === 'Expense') {
          if (txn.type !== 'Expense' && txn.type !== 'Transfer Out')
            return false;
        }

        const txnDate = parseISO(txn.date);
        return txnDate >= monthStart && txnDate <= monthEnd;
      })
      .sort((a, b) => {
        const dateDiff = new Date(b.date) - new Date(a.date);
        if (dateDiff !== 0) return dateDiff;
        if (a.created_at && b.created_at) {
          return new Date(b.created_at) - new Date(a.created_at);
        }
        return 0;
      });
  };

  // Handle row click to show transactions
  const handleRowClick = (categoryId, type) => {
    setSelectedCategoryForModal({ categoryId, type });
    setTransactionModalOpen(true);
  };

  // Format variance based on type
  const formatVariance = (variance, type) => {
    if (variance === null || variance === undefined) return 'N/A';

    if (type === 'Income') {
      // Income: negative = short (show as negative), positive = exceeded (show with +)
      if (variance < 0) {
        return `${variance.toFixed(0)}%`;
      } else {
        return `+${variance.toFixed(0)}%`;
      }
    } else {
      // Expense: negative = under budget (show as positive), positive = over budget (show as positive)
      // Always show as positive percentage
      return `${Math.abs(variance).toFixed(0)}%`;
    }
  };

  // Get variance color based on type
  const getVarianceColor = (variance, type) => {
    if (variance === null || variance === undefined) return 'text.primary';

    if (type === 'Income') {
      // Income: negative = short = red, positive = exceeded = normal
      return variance < 0 ? 'error.main' : 'text.primary';
    } else {
      // Expense: negative = under budget = normal, positive = over budget = red
      return variance > 0 ? 'error.main' : 'text.primary';
    }
  };

  // Format currency display (amounts are already in base currency)
  const formatCurrencyDisplay = (
    amount,
    currencies,
    isMixed,
    originalAmountsByCurrency
  ) => {
    // If only base currency, show normally
    if (currencies.length === 1 && currencies[0] === baseCurrency) {
      return formatCurrency(amount, baseCurrency);
    }

    // If multiple currencies, show mixed chip (handled separately in render)
    if (isMixed) {
      return formatCurrency(amount, baseCurrency);
    }

    // If one foreign currency, find it and show original amount
    const foreignCurrency = currencies.find((c) => c !== baseCurrency);
    if (
      foreignCurrency &&
      originalAmountsByCurrency &&
      originalAmountsByCurrency[foreignCurrency]
    ) {
      return formatCurrency(amount, baseCurrency);
    }

    return formatCurrency(amount, baseCurrency);
  };

  // Get foreign currency display - check if all amounts are in the same foreign currency
  const getForeignCurrencyDisplay = (currencies, originalAmountsByCurrency) => {
    if (!originalAmountsByCurrency) return null;

    // Get all currencies that have amounts
    const currenciesWithAmounts = Object.keys(originalAmountsByCurrency).filter(
      (currency) => originalAmountsByCurrency[currency] > 0
    );

    // If only base currency, no foreign display
    if (
      currenciesWithAmounts.length === 1 &&
      currenciesWithAmounts[0] === baseCurrency
    ) {
      return null;
    }

    // If multiple different currencies, no foreign display (show chip instead)
    if (currenciesWithAmounts.length > 1) {
      return null;
    }

    // If one foreign currency (not base), show it
    const foreignCurrency = currenciesWithAmounts.find(
      (c) => c !== baseCurrency
    );
    if (foreignCurrency && originalAmountsByCurrency[foreignCurrency]) {
      return {
        currency: foreignCurrency,
        amount: originalAmountsByCurrency[foreignCurrency],
      };
    }

    return null;
  };

  // Get difference color based on type
  const getDifferenceColor = (difference, type) => {
    if (type === 'Income') {
      // Income: positive difference (budget > actual) = short = red
      // negative difference (budget < actual) = exceeded = green
      return difference > 0 ? 'error.main' : 'success.main';
    } else {
      // Expense: positive difference (budget > actual) = under budget = green
      // negative difference (budget < actual) = over budget = red
      return difference >= 0 ? 'success.main' : 'error.main';
    }
  };

  // Memoized report data
  const incomeReportData = useMemo(
    () => buildReportData('Income'),
    [
      categories,
      budgets,
      allTransactions,
      selectedMonth,
      exchangeRates,
      baseCurrency,
    ]
  );

  const expenseReportData = useMemo(
    () => buildReportData('Expense'),
    [
      categories,
      budgets,
      allTransactions,
      selectedMonth,
      exchangeRates,
      baseCurrency,
    ]
  );

  const incomeTotals = useMemo(
    () => calculateSectionTotals(incomeReportData),
    [incomeReportData]
  );

  const expenseTotals = useMemo(
    () => calculateSectionTotals(expenseReportData),
    [expenseReportData]
  );

  const netSummary = useMemo(() => {
    const plannedSavings = incomeTotals.budget - expenseTotals.budget;
    const actualSavings = incomeTotals.actual - expenseTotals.actual;
    return { plannedSavings, actualSavings };
  }, [incomeTotals, expenseTotals]);

  const modalTransactions = useMemo(
    () => getTransactionsForModal(),
    [selectedCategoryForModal, selectedMonth, allTransactions]
  );

  if (loading && !isInitialized) {
    return <LoadingSpinner />;
  }

  const selectedMonthDate = parseISO(`${selectedMonth}-01`);
  const monthDisplay = format(selectedMonthDate, 'MMMM yyyy');

  // Render category row
  const renderCategoryRow = (item, type, level = 0) => {
    const {
      category,
      budget,
      actual,
      difference,
      variance,
      isMixed,
      currencies,
      budgetOriginalAmounts,
      actualOriginalAmounts,
      differenceOriginalAmounts,
    } = item;
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expandedCategories.has(category.category_id);
    const differenceColor = getDifferenceColor(difference, type);

    // Get foreign currency displays
    const budgetForeign = getForeignCurrencyDisplay(
      currencies,
      budgetOriginalAmounts
    );
    const actualForeign = getForeignCurrencyDisplay(
      currencies,
      actualOriginalAmounts
    );
    const differenceForeign = getForeignCurrencyDisplay(
      currencies,
      differenceOriginalAmounts
    );

    // Render currency cell with optional foreign currency display
    const renderCurrencyCell = (
      amount,
      foreignInfo,
      originalAmounts,
      showMixedChip = false
    ) => (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 0.5,
          }}
        >
          {showMixedChip && isMixed && (
            <Chip
              label="Mixed currencies"
              size="small"
              sx={{ height: 18, fontSize: '0.65rem' }}
              color="default"
              variant="outlined"
            />
          )}
          <Typography variant="body2">
            {formatCurrencyDisplay(
              amount,
              currencies,
              isMixed,
              originalAmounts
            )}
          </Typography>
        </Box>
        {foreignInfo && (
          <Typography
            variant="caption"
            sx={{ fontSize: '0.7rem', color: 'text.secondary' }}
          >
            {formatCurrency(foreignInfo.amount, foreignInfo.currency)}
          </Typography>
        )}
      </Box>
    );

    return (
      <Fragment key={category.category_id}>
        <TableRow
          hover
          onClick={() => handleRowClick(category.category_id, type)}
          sx={{ cursor: 'pointer' }}
        >
          <TableCell>
            <Box sx={{ display: 'flex', alignItems: 'center', pl: level * 2 }}>
              {hasChildren ? (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCategoryExpansion(category.category_id);
                  }}
                  sx={{ mr: 1 }}
                >
                  {isExpanded ? (
                    <ExpandMoreIcon fontSize="small" />
                  ) : (
                    <ChevronRightIcon fontSize="small" />
                  )}
                </IconButton>
              ) : (
                <Box sx={{ width: 40 }} />
              )}
              <Typography variant="body2">{category.name}</Typography>
            </Box>
          </TableCell>
          <TableCell align="right">
            {renderCurrencyCell(
              budget,
              budgetForeign,
              budgetOriginalAmounts,
              true
            )}
          </TableCell>
          <TableCell align="right">
            {renderCurrencyCell(
              actual,
              actualForeign,
              actualOriginalAmounts,
              true
            )}
          </TableCell>
          <TableCell align="right">
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 0.5,
                }}
              >
                {isMixed && (
                  <Chip
                    label="Mixed currencies"
                    size="small"
                    sx={{ height: 18, fontSize: '0.65rem' }}
                    color="default"
                    variant="outlined"
                  />
                )}
                <Typography
                  variant="body2"
                  sx={{ color: differenceColor, fontWeight: 'medium' }}
                >
                  {formatCurrencyDisplay(
                    difference,
                    currencies,
                    isMixed,
                    differenceOriginalAmounts
                  )}
                </Typography>
              </Box>
              {differenceForeign && (
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.7rem', color: 'text.secondary' }}
                >
                  {formatCurrency(
                    differenceForeign.amount,
                    differenceForeign.currency
                  )}
                </Typography>
              )}
            </Box>
          </TableCell>
          <TableCell align="right">
            <Typography
              variant="body2"
              sx={{ color: getVarianceColor(variance, type) }}
            >
              {formatVariance(variance, type)}
            </Typography>
          </TableCell>
        </TableRow>
        {hasChildren && isExpanded && (
          <>
            {category.children.map((child) => {
              const childData = calculateCategoryData(child, type);
              const hasChildData = childData.budget > 0 || childData.actual > 0;
              if (!hasChildData) return null;
              return renderCategoryRow(
                { category: child, ...childData },
                type,
                level + 1
              );
            })}
          </>
        )}
      </Fragment>
    );
  };

  return (
    <Box>
      <Typography 
        variant="h5" 
        sx={{ 
          mb: { xs: 1.5, sm: 2, md: 3 },
          fontSize: { xs: '1.25rem', sm: '1.5rem' },
          fontWeight: 500,
        }}
      >
        Budget vs Actual
      </Typography>

      {error && <ErrorMessage error={error} />}

      {/* Month Navigation */}
      <Card sx={{ mb: { xs: 2, sm: 3 } }}>
        <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: { xs: 1, sm: 2 },
            }}
          >
            <IconButton onClick={handlePreviousMonth} size="small">
              <ChevronLeftIcon />
            </IconButton>
            <Typography
              variant="h6"
              sx={{ minWidth: { xs: 150, sm: 200 }, textAlign: 'center', fontSize: { xs: '1rem', sm: '1.25rem' } }}
            >
              {monthDisplay}
            </Typography>
            <IconButton onClick={handleNextMonth} size="small">
              <ChevronRightIcon />
            </IconButton>
          </Box>
        </CardContent>
      </Card>

      {/* Income Budget vs Actual Section */}
      <Card sx={{ mb: { xs: 2, sm: 3 } }}>
        <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
          <Typography variant="h6" sx={{ mb: { xs: 1.5, sm: 2 }, fontWeight: 'bold', fontSize: { xs: '1rem', sm: '1.125rem' } }}>
            Income Budget vs Actual
          </Typography>
          <Box
            sx={{
              overflowX: 'auto',
              mx: { xs: -1.5, sm: 0 },
              px: { xs: 1.5, sm: 0 },
              // Scroll shadow indicators
              background: {
                xs: `linear-gradient(to right, ${theme.palette.background.paper}, ${theme.palette.background.paper}),
                     linear-gradient(to right, ${theme.palette.background.paper}, ${theme.palette.background.paper}),
                     linear-gradient(to right, rgba(0,0,0,.08), rgba(255,255,255,0)),
                     linear-gradient(to left, rgba(0,0,0,.08), rgba(255,255,255,0))`,
                sm: 'none',
              },
              backgroundPosition: 'left center, right center, left center, right center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: '20px 100%, 20px 100%, 10px 100%, 10px 100%',
              backgroundAttachment: 'local, local, scroll, scroll',
            }}
          >
            <Table size="small" sx={{ minWidth: 600 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 140, whiteSpace: 'nowrap' }}>CATEGORY</TableCell>
                  <TableCell align="right" sx={{ minWidth: 100, whiteSpace: 'nowrap' }}>BUDGETED</TableCell>
                  <TableCell align="right" sx={{ minWidth: 110, whiteSpace: 'nowrap' }}>ACTUAL INCOME</TableCell>
                  <TableCell align="right" sx={{ minWidth: 100, whiteSpace: 'nowrap' }}>DIFFERENCE</TableCell>
                  <TableCell align="right" sx={{ minWidth: 80, whiteSpace: 'nowrap' }}>VARIANCE (%)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {incomeReportData.map((item) =>
                  renderCategoryRow(item, 'Income')
                )}
                {/* Total Row */}
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      Total
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {(() => {
                      const budgetForeign = getForeignCurrencyDisplay(
                        incomeTotals.currencies,
                        incomeTotals.budgetOriginalAmounts
                      );
                      return (
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                          }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: 0.5,
                            }}
                          >
                            {incomeTotals.isMixed && (
                              <Chip
                                label="Mixed currencies"
                                size="small"
                                sx={{ height: 18, fontSize: '0.65rem' }}
                                color="default"
                                variant="outlined"
                              />
                            )}
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 'bold' }}
                            >
                              {formatCurrencyDisplay(
                                incomeTotals.budget,
                                incomeTotals.currencies,
                                incomeTotals.isMixed,
                                incomeTotals.budgetOriginalAmounts
                              )}
                            </Typography>
                          </Box>
                          {budgetForeign && (
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: '0.7rem',
                                color: 'text.secondary',
                              }}
                            >
                              {formatCurrency(
                                budgetForeign.amount,
                                budgetForeign.currency
                              )}
                            </Typography>
                          )}
                        </Box>
                      );
                    })()}
                  </TableCell>
                  <TableCell align="right">
                    {(() => {
                      const actualForeign = getForeignCurrencyDisplay(
                        incomeTotals.currencies,
                        incomeTotals.actualOriginalAmounts
                      );
                      return (
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                          }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: 0.5,
                            }}
                          >
                            {incomeTotals.isMixed && (
                              <Chip
                                label="Mixed currencies"
                                size="small"
                                sx={{ height: 18, fontSize: '0.65rem' }}
                                color="default"
                                variant="outlined"
                              />
                            )}
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 'bold' }}
                            >
                              {formatCurrencyDisplay(
                                incomeTotals.actual,
                                incomeTotals.currencies,
                                incomeTotals.isMixed,
                                incomeTotals.actualOriginalAmounts
                              )}
                            </Typography>
                          </Box>
                          {actualForeign && (
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: '0.7rem',
                                color: 'text.secondary',
                              }}
                            >
                              {formatCurrency(
                                actualForeign.amount,
                                actualForeign.currency
                              )}
                            </Typography>
                          )}
                        </Box>
                      );
                    })()}
                  </TableCell>
                  <TableCell align="right">
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 0.5,
                      }}
                    >
                      {incomeTotals.isMixed && (
                        <Chip
                          label="Mixed currencies"
                          size="small"
                          sx={{ height: 18, fontSize: '0.65rem' }}
                          color="default"
                          variant="outlined"
                        />
                      )}
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 'bold',
                          color: getDifferenceColor(
                            incomeTotals.difference,
                            'Income'
                          ),
                        }}
                      >
                        {formatCurrencyDisplay(
                          incomeTotals.difference,
                          incomeTotals.currencies,
                          incomeTotals.isMixed,
                          incomeTotals.differenceOriginalAmounts
                        )}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 'bold',
                        color: getVarianceColor(
                          incomeTotals.variance,
                          'Income'
                        ),
                      }}
                    >
                      {formatVariance(incomeTotals.variance, 'Income')}
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>

      {/* Expense Budget vs Actual Section */}
      <Card sx={{ mb: { xs: 2, sm: 3 } }}>
        <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
          <Typography variant="h6" sx={{ mb: { xs: 1.5, sm: 2 }, fontWeight: 'bold', fontSize: { xs: '1rem', sm: '1.125rem' } }}>
            Expense Budget vs Actual
          </Typography>
          <Box
            sx={{
              overflowX: 'auto',
              mx: { xs: -1.5, sm: 0 },
              px: { xs: 1.5, sm: 0 },
              // Scroll shadow indicators
              background: {
                xs: `linear-gradient(to right, ${theme.palette.background.paper}, ${theme.palette.background.paper}),
                     linear-gradient(to right, ${theme.palette.background.paper}, ${theme.palette.background.paper}),
                     linear-gradient(to right, rgba(0,0,0,.08), rgba(255,255,255,0)),
                     linear-gradient(to left, rgba(0,0,0,.08), rgba(255,255,255,0))`,
                sm: 'none',
              },
              backgroundPosition: 'left center, right center, left center, right center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: '20px 100%, 20px 100%, 10px 100%, 10px 100%',
              backgroundAttachment: 'local, local, scroll, scroll',
            }}
          >
            <Table size="small" sx={{ minWidth: 600 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 140, whiteSpace: 'nowrap' }}>CATEGORY</TableCell>
                  <TableCell align="right" sx={{ minWidth: 100, whiteSpace: 'nowrap' }}>BUDGETED</TableCell>
                  <TableCell align="right" sx={{ minWidth: 120, whiteSpace: 'nowrap' }}>ACTUAL SPENDING</TableCell>
                  <TableCell align="right" sx={{ minWidth: 100, whiteSpace: 'nowrap' }}>DIFFERENCE</TableCell>
                  <TableCell align="right" sx={{ minWidth: 80, whiteSpace: 'nowrap' }}>VARIANCE (%)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {expenseReportData.map((item) =>
                  renderCategoryRow(item, 'Expense')
                )}
                {/* Total Row */}
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      Total
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {(() => {
                      const budgetForeign = getForeignCurrencyDisplay(
                        expenseTotals.currencies,
                        expenseTotals.budgetOriginalAmounts
                      );
                      return (
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                          }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: 0.5,
                            }}
                          >
                            {expenseTotals.isMixed && (
                              <Chip
                                label="Mixed currencies"
                                size="small"
                                sx={{ height: 18, fontSize: '0.65rem' }}
                                color="default"
                                variant="outlined"
                              />
                            )}
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 'bold' }}
                            >
                              {formatCurrencyDisplay(
                                expenseTotals.budget,
                                expenseTotals.currencies,
                                expenseTotals.isMixed,
                                expenseTotals.budgetOriginalAmounts
                              )}
                            </Typography>
                          </Box>
                          {budgetForeign && (
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: '0.7rem',
                                color: 'text.secondary',
                              }}
                            >
                              {formatCurrency(
                                budgetForeign.amount,
                                budgetForeign.currency
                              )}
                            </Typography>
                          )}
                        </Box>
                      );
                    })()}
                  </TableCell>
                  <TableCell align="right">
                    {(() => {
                      const actualForeign = getForeignCurrencyDisplay(
                        expenseTotals.currencies,
                        expenseTotals.actualOriginalAmounts
                      );
                      return (
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                          }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: 0.5,
                            }}
                          >
                            {expenseTotals.isMixed && (
                              <Chip
                                label="Mixed currencies"
                                size="small"
                                sx={{ height: 18, fontSize: '0.65rem' }}
                                color="default"
                                variant="outlined"
                              />
                            )}
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 'bold' }}
                            >
                              {formatCurrencyDisplay(
                                expenseTotals.actual,
                                expenseTotals.currencies,
                                expenseTotals.isMixed,
                                expenseTotals.actualOriginalAmounts
                              )}
                            </Typography>
                          </Box>
                          {actualForeign && (
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: '0.7rem',
                                color: 'text.secondary',
                              }}
                            >
                              {formatCurrency(
                                actualForeign.amount,
                                actualForeign.currency
                              )}
                            </Typography>
                          )}
                        </Box>
                      );
                    })()}
                  </TableCell>
                  <TableCell align="right">
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 0.5,
                      }}
                    >
                      {expenseTotals.isMixed && (
                        <Chip
                          label="Mixed currencies"
                          size="small"
                          sx={{ height: 18, fontSize: '0.65rem' }}
                          color="default"
                          variant="outlined"
                        />
                      )}
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 'bold',
                          color: getDifferenceColor(
                            expenseTotals.difference,
                            'Expense'
                          ),
                        }}
                      >
                        {formatCurrencyDisplay(
                          expenseTotals.difference,
                          expenseTotals.currencies,
                          expenseTotals.isMixed,
                          expenseTotals.differenceOriginalAmounts
                        )}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 'bold',
                        color: getVarianceColor(
                          expenseTotals.variance,
                          'Expense'
                        ),
                      }}
                    >
                      {formatVariance(expenseTotals.variance, 'Expense')}
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>

      {/* Net Summary Section */}
      <Card sx={{ mb: { xs: 2, sm: 3 } }}>
        <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
          <Typography variant="h6" sx={{ mb: { xs: 1.5, sm: 2 }, fontWeight: 'bold', fontSize: { xs: '1rem', sm: '1.125rem' } }}>
            Net Summary
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 1.5, sm: 4 } }}>
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8125rem' }}>
                Planned Savings
              </Typography>
              <Typography
                variant="h6"
                sx={{
                  fontSize: { xs: '1.125rem', sm: '1.25rem' },
                  color:
                    netSummary.plannedSavings >= 0
                      ? 'success.main'
                      : 'error.main',
                }}
              >
                {formatCurrency(netSummary.plannedSavings, baseCurrency)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8125rem' }}>
                Actual Savings
              </Typography>
              <Typography
                variant="h6"
                sx={{
                  fontSize: { xs: '1.125rem', sm: '1.25rem' },
                  color:
                    netSummary.actualSavings >= 0
                      ? 'success.main'
                      : 'error.main',
                }}
              >
                {formatCurrency(netSummary.actualSavings, baseCurrency)}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Transaction Modal */}
      <Dialog
        open={transactionModalOpen}
        onClose={() => setTransactionModalOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ pb: 1 }}>
          Transactions - {monthDisplay}
          {selectedCategoryForModal && (
            <Typography variant="body2" color="text.secondary">
              {
                categories.find(
                  (c) => c.category_id === selectedCategoryForModal.categoryId
                )?.name
              }
            </Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ p: { xs: 1, sm: 2 } }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 500 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>Date</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>Category</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>Description</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>Amount</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>Currency</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {modalTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography variant="body2" color="text.secondary">
                        No transactions found
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  modalTransactions.map((txn) => {
                    const category = categories.find(
                      (c) => c.category_id === txn.category_id
                    );
                    return (
                      <TableRow key={txn.transaction_id}>
                        <TableCell>
                          {format(parseISO(txn.date), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>{category ? category.name : '-'}</TableCell>
                        <TableCell>{txn.description || '-'}</TableCell>
                        <TableCell align="right">
                          {formatCurrency(
                            Math.abs(parseFloat(txn.amount || 0)),
                            txn.currency
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip label={txn.currency} size="small" />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransactionModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Reports;
