import { useState, useMemo, useEffect, Fragment } from 'react';
import { useSelector } from 'react-redux';
import {
  Box,
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
  Divider,
  LinearProgress,
  TextField,
  InputAdornment,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TodayIcon from '@mui/icons-material/Today';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import BudgetDialog from '../components/common/BudgetDialog';
import CategoryTransactionsList from '../components/common/CategoryTransactionsList';
import { usePageRefresh } from '../hooks/usePageRefresh';
import PageSkeleton from '../components/common/PageSkeleton';
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
import {
  findBudgetForCategoryMonth,
  budgetAppliesToMonth,
} from '../utils/budgetMatching';

// Tappable mobile row: suppress the browser tap highlight (blue flash on
// Android/Chrome) and sticky hover on touch; give explicit pressed feedback
const tappableRowSx = {
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  userSelect: 'none',
  '&:active': { backgroundColor: 'action.hover' },
  '@media (hover: hover)': {
    '&:hover': { backgroundColor: 'action.hover' },
  },
};

const PERIOD_OPTIONS = [
  { value: 'month', label: 'Month' },
  { value: '6months', label: '6 Months' },
  { value: '1year', label: '1 Year' },
];

// A muted, full-bleed separator. The negative x-margins cancel the page
// content padding (AppLayout: p {xs:1.5, sm:2, md:3}) so the line runs edge to
// edge, stacking the page into tile-like sections without any box/tint. A hair
// thicker and slightly stronger than a row divider so it reads as a section
// break, while still staying muted.
const PAGE_DIVIDER_SX = (theme) => ({
  mx: { xs: -1.5, sm: -2, md: -3 },
  my: { xs: 1.5, sm: 2 },
  borderBottomWidth: 2,
  borderColor:
    theme.palette.mode === 'dark'
      ? 'rgba(233, 236, 244, 0.20)'
      : 'rgba(0, 0, 0, 0.16)',
});

// Narrow a report section to categories matching a search query. A top-level
// row is kept when its own name matches or any of its subcategories match, so
// searching a subcategory still surfaces its parent's row (auto-expanded).
function filterReportBySearch(reportData, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return reportData;
  return reportData.filter((item) => {
    if (item.category?.name?.toLowerCase().includes(q)) return true;
    return (item.category?.children || []).some((child) =>
      child.name?.toLowerCase().includes(q)
    );
  });
}

function Reports() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // Matches the md breakpoint previously used for the CSS card/table switch
  const isDesktopView = useMediaQuery(theme.breakpoints.up('md'));
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
  const [periodType, setPeriodType] = useState('month'); // 'month' | '6months' | '1year'
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [reportSearch, setReportSearch] = useState('');
  // Debounced copy drives the (expensive) filtering so typing stays smooth
  const [debouncedReportSearch, setDebouncedReportSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedReportSearch(reportSearch), 250);
    return () => clearTimeout(t);
  }, [reportSearch]);
  const reportSearchActive = debouncedReportSearch.trim().length > 0;
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [selectedCategoryForModal, setSelectedCategoryForModal] =
    useState(null);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  // { budget: record | null, categoryId: string } — null budget means create
  const [budgetDialogTarget, setBudgetDialogTarget] = useState(null);

  // Get base currency
  const baseCurrency =
    settings.find((s) => s.setting_key === 'BaseCurrency')?.setting_value ||
    'USD';

  // Get date range based on selected month and period type
  const getDateRange = (selectedMonth, periodType) => {
    const endDate = endOfMonth(parseISO(`${selectedMonth}-01`));
    let startDate;
    
    if (periodType === 'month') {
      startDate = startOfMonth(parseISO(`${selectedMonth}-01`));
    } else if (periodType === '6months') {
      startDate = startOfMonth(subMonths(endDate, 5)); // 6 months including current
    } else if (periodType === '1year') {
      startDate = startOfMonth(subMonths(endDate, 11)); // 12 months including current
    }
    
    return { start: startDate, end: endDate };
  };

  // Get current date range
  const dateRange = useMemo(
    () => getDateRange(selectedMonth, periodType),
    [selectedMonth, periodType]
  );

  // The immediately preceding period of the same length, for month-over-month
  // (period-over-period) deltas on totals and each category
  const previousDateRange = useMemo(() => {
    const monthsBack =
      periodType === '6months' ? 6 : periodType === '1year' ? 12 : 1;
    const prevMonth = format(
      subMonths(parseISO(`${selectedMonth}-01`), monthsBack),
      'yyyy-MM'
    );
    return getDateRange(prevMonth, periodType);
  }, [selectedMonth, periodType]);

  // Human label for the previous period, used in delta captions
  const periodWord =
    periodType === '6months'
      ? 'prev 6 mo'
      : periodType === '1year'
      ? 'last year'
      : 'last month';

  // Month navigation handlers
  const handlePreviousPeriod = () => {
    const currentDate = parseISO(`${selectedMonth}-01`);
    let monthsToSubtract = 1;
    if (periodType === '6months') {
      monthsToSubtract = 6;
    } else if (periodType === '1year') {
      monthsToSubtract = 12;
    }
    const newDate = subMonths(currentDate, monthsToSubtract);
    setSelectedMonth(format(newDate, 'yyyy-MM'));
  };

  const handleNextPeriod = () => {
    const currentDate = parseISO(`${selectedMonth}-01`);
    let monthsToAdd = 1;
    if (periodType === '6months') {
      monthsToAdd = 6;
    } else if (periodType === '1year') {
      monthsToAdd = 12;
    }
    const newDate = addMonths(currentDate, monthsToAdd);
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

  // Helper function to count months between two dates (inclusive)
  const countMonthsBetween = (startDate, endDate) => {
    let count = 0;
    let current = startOfMonth(startDate);
    const end = endOfMonth(endDate);
    
    while (current <= end) {
      count++;
      current = addMonths(current, 1);
    }
    
    return count;
  };

  // Calculate budget for a category in a given date range (converted to base currency)
  const calculateCategoryBudget = (categoryId, dateRange) => {
    const categoryIds = getCategoryAndDescendantIds(categoryId);
    const { start: rangeStart, end: rangeEnd } = dateRange;

    let totalBudget = 0;
    const currencies = new Set();
    const originalAmountsByCurrency = {}; // Track original amounts by currency

    budgets.forEach((budget) => {
      if (!categoryIds.includes(budget.category_id)) return;
      if (budget.status !== 'Active') return;

      let applicableMonths = 0;

      if (budget.recurring) {
        // Recurring budget: count how many months in the range this budget applies to
        const budgetStart = budget.start_month
          ? startOfMonth(parseISO(budget.start_month))
          : null;
        const budgetEnd = budget.end_month
          ? endOfMonth(parseISO(budget.end_month))
          : null;

        // Check if budget overlaps with the date range
        const budgetAppliesToRange =
          (!budgetStart || rangeEnd >= budgetStart) &&
          (!budgetEnd || rangeStart <= budgetEnd);

        if (budgetAppliesToRange) {
          // Calculate the actual overlap period
          const overlapStart =
            budgetStart && budgetStart > rangeStart ? budgetStart : rangeStart;
          const overlapEnd =
            budgetEnd && budgetEnd < rangeEnd ? budgetEnd : rangeEnd;

          // Count exact number of months in the overlap
          applicableMonths = countMonthsBetween(overlapStart, overlapEnd);
        }
      } else {
        // One-time budget: include if budget month falls within the date range
        if (budget.month) {
          const budgetMonth = parseISO(budget.month);
          const budgetMonthStart = startOfMonth(budgetMonth);
          const budgetMonthEnd = endOfMonth(budgetMonth);

          if (
            budgetMonthStart <= rangeEnd &&
            budgetMonthEnd >= rangeStart
          ) {
            applicableMonths = 1;
          }
        }
      }

      if (applicableMonths > 0) {
        const monthlyBudgetAmount = parseFloat(budget.amount || 0);
        const budgetAmount = monthlyBudgetAmount * applicableMonths;
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

  // Calculate actual transactions for a category in a given date range (including descendants, converted to base currency)
  const calculateCategoryActual = (
    categoryId,
    dateRange,
    type,
    includeDescendants = true
  ) => {
    const categoryIds = includeDescendants
      ? getCategoryAndDescendantIds(categoryId)
      : [categoryId];
    const { start: rangeStart, end: rangeEnd } = dateRange;

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

      // Filter by date range
      const txnDate = parseISO(txn.date);
      if (txnDate < rangeStart || txnDate > rangeEnd) return;

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
      dateRange
    );

    // If category has children, calculate separately to avoid double-counting
    let budgetAmount = budgetData.amount;
    let actualAmount = 0;
    let allCurrencies = new Set([...budgetData.currencies]);
    let budgetOriginalAmounts = { ...budgetData.originalAmountsByCurrency };
    let actualOriginalAmounts = {};

    if (category.children && category.children.length > 0) {
      // For parent categories: calculate direct transactions + sum of children
      // (children's budgets are calculated separately below to avoid
      // double-counting, since getCategoryAndDescendantIds includes them)
      const directActual = calculateCategoryActual(
        category.category_id,
        dateRange,
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
          dateRange
        );
        const childActual = calculateCategoryActual(
          child.category_id,
          dateRange,
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

        const { start: rangeStart, end: rangeEnd } = dateRange;

        let appliesToRange = false;
        if (budget.recurring) {
          if (budget.start_month) {
            const startDate = startOfMonth(parseISO(budget.start_month));
            const endDate = budget.end_month
              ? endOfMonth(parseISO(budget.end_month))
              : null;
            appliesToRange =
              (!endDate || rangeStart <= endDate) &&
              (!startDate || rangeEnd >= startDate);
          }
        } else {
          if (budget.month) {
            const budgetMonth = parseISO(budget.month);
            const budgetMonthStart = startOfMonth(budgetMonth);
            const budgetMonthEnd = endOfMonth(budgetMonth);
            appliesToRange =
              budgetMonthStart <= rangeEnd && budgetMonthEnd >= rangeStart;
          }
        }
        return appliesToRange;
      });

      let parentOwnBudget = 0;
      const { start: rangeStart, end: rangeEnd } = dateRange;

      parentOwnBudgets.forEach((budget) => {
        let applicableMonths = 0;
        
        if (budget.recurring) {
          // Count months for recurring budget
          const budgetStart = budget.start_month
            ? startOfMonth(parseISO(budget.start_month))
            : null;
          const budgetEnd = budget.end_month
            ? endOfMonth(parseISO(budget.end_month))
            : null;

          const budgetAppliesToRange =
            (!budgetStart || rangeEnd >= budgetStart) &&
            (!budgetEnd || rangeStart <= budgetEnd);

          if (budgetAppliesToRange) {
            const overlapStart =
              budgetStart && budgetStart > rangeStart ? budgetStart : rangeStart;
            const overlapEnd =
              budgetEnd && budgetEnd < rangeEnd ? budgetEnd : rangeEnd;
            applicableMonths = countMonthsBetween(overlapStart, overlapEnd);
          }
        } else {
          // One-time budget
          if (budget.month) {
            const budgetMonth = parseISO(budget.month);
            const budgetMonthStart = startOfMonth(budgetMonth);
            const budgetMonthEnd = endOfMonth(budgetMonth);
            if (
              budgetMonthStart <= rangeEnd &&
              budgetMonthEnd >= rangeStart
            ) {
              applicableMonths = 1;
            }
          }
        }

        if (applicableMonths > 0) {
          const monthlyBudgetAmount = parseFloat(budget.amount || 0);
          const budgetAmount = monthlyBudgetAmount * applicableMonths;
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
        }
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
        dateRange,
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

    // Same-category actual for the previous period (incl. descendants), for the
    // period-over-period delta shown on the row
    const previousActual = calculateCategoryActual(
      category.category_id,
      previousDateRange,
      type,
      true
    ).amount;

    return {
      budget: budgetAmount,
      actual: actualAmount,
      previousActual,
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

    // Biggest actual first, so "where the money went" reads top-down
    reportData.sort((a, b) => b.actual - a.actual);

    return reportData;
  };

  // Calculate totals for a section
  const calculateSectionTotals = (reportData) => {
    let totalBudget = 0;
    let totalActual = 0;
    let totalPreviousActual = 0;
    const allCurrencies = new Set();
    const totalBudgetOriginalAmounts = {};
    const totalActualOriginalAmounts = {};

    reportData.forEach((item) => {
      totalBudget += item.budget;
      totalActual += item.actual;
      totalPreviousActual += item.previousActual || 0;
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
      previousActual: totalPreviousActual,
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
    const { start: rangeStart, end: rangeEnd } = dateRange;

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
        return txnDate >= rangeStart && txnDate <= rangeEnd;
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

  // Find the budget record that applies to a category in the selected month
  // (prefer an Active one; shared matching rules with the Budgets page)
  const findBudgetForCategory = (categoryId) =>
    findBudgetForCategoryMonth(budgets, categoryId, selectedMonth);

  // True when any descendant category has its own budget for the month —
  // used to cue aggregated vs own-record budget amounts on parent rows
  const descendantsHaveBudgets = (categoryId) => {
    const descendantIds = getCategoryAndDescendantIds(categoryId).filter(
      (id) => id !== categoryId
    );
    if (descendantIds.length === 0) return false;
    return budgets.some(
      (budget) =>
        descendantIds.includes(budget.category_id) &&
        budgetAppliesToMonth(budget, selectedMonth)
    );
  };

  const handleOpenBudgetDialog = (categoryId = null) => {
    const budget = categoryId ? findBudgetForCategory(categoryId) : null;
    setBudgetDialogTarget({ budget, categoryId: categoryId || '' });
    setBudgetDialogOpen(true);
  };

  // Get foreign currency display - check if all amounts are in the same foreign currency
  const getForeignCurrencyDisplay = (currencies, originalAmountsByCurrency) => {
    if (!originalAmountsByCurrency) return null;

    // Get all currencies that have amounts (differences can be negative,
    // e.g. an exceeded income budget, so compare against zero)
    const currenciesWithAmounts = Object.keys(originalAmountsByCurrency).filter(
      (currency) => originalAmountsByCurrency[currency] !== 0
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

  // Format money, using the short "Br" symbol for ETB so it fits in tight rows.
  // Ethiopia writes the symbol after the amount, e.g. "4,500.00 Br".
  const fmt = (amount, currency) => {
    if (currency !== 'ETB') return formatCurrency(amount, currency);
    const num = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return `${num} Br`;
  };

  // For a category in a single non-base currency (e.g. you budget & log an
  // income in USD while the base is ETB), show the ORIGINAL amount as the
  // primary and the base conversion as a much smaller secondary — you read the
  // number you actually think in, with the base value as a tiny reference.
  // Base-only or mixed-currency amounts just show the base amount.
  const getMoneyDisplay = (baseAmount, originalAmounts) => {
    const foreign = getForeignCurrencyDisplay(null, originalAmounts);
    if (foreign) {
      return {
        primary: fmt(foreign.amount, foreign.currency),
        secondary: fmt(baseAmount, baseCurrency),
      };
    }
    return {
      primary: fmt(baseAmount, baseCurrency),
      secondary: null,
    };
  };

  // Render primary amount with an optional much-smaller, muted secondary — a
  // tiny reference glance without eating row space
  const renderMoneyInline = (money) => (
    <>
      {money.primary}
      {money.secondary && (
        <Box
          component="span"
          sx={{
            fontSize: '0.68em',
            fontWeight: 400,
            color: 'text.secondary',
            ml: 0.35,
          }}
        >
          {money.secondary}
        </Box>
      )}
    </>
  );

  // Stacked money cell (desktop table): original amount as the primary line,
  // base conversion as a smaller secondary line beneath it
  const renderMoneyStacked = (
    baseAmount,
    originalAmounts,
    { isMixed = false, bold = false, color } = {}
  ) => {
    const money = getMoneyDisplay(baseAmount, originalAmounts);
    return (
      <Box
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
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
          <Typography variant="body2" sx={{ fontWeight: bold ? 'bold' : undefined, color }}>
            {money.primary}
          </Typography>
        </Box>
        {money.secondary && (
          <Typography
            variant="caption"
            sx={{ fontSize: '0.7rem', color: 'text.secondary' }}
          >
            {money.secondary}
          </Typography>
        )}
      </Box>
    );
  };

  // Difference shown in a single currency — the one it was budgeted in
  const getDiffText = (difference, differenceOriginalAmounts, type) => {
    const f = getForeignCurrencyDisplay(null, differenceOriginalAmounts);
    return f
      ? fmt(getDisplayDifference(f.amount, type), f.currency)
      : fmt(getDisplayDifference(difference, type), baseCurrency);
  };

  // Income exceeding its budget is a win, not a deficit — never show the
  // difference with a minus sign there; expenses keep their sign
  const getDisplayDifference = (amount, type) =>
    type === 'Income' ? Math.abs(amount) : amount;

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
  // Build the (expensive) report data independent of the search text, so a
  // keystroke never triggers a full recompute — only the cheap filter re-runs.
  const incomeReportDataFull = useMemo(
    () => buildReportData('Income'),
    [categories, budgets, allTransactions, dateRange, exchangeRates, baseCurrency]
  );
  const incomeReportData = useMemo(
    () => filterReportBySearch(incomeReportDataFull, debouncedReportSearch),
    [incomeReportDataFull, debouncedReportSearch]
  );

  const expenseReportDataFull = useMemo(
    () => buildReportData('Expense'),
    [categories, budgets, allTransactions, dateRange, exchangeRates, baseCurrency]
  );
  const expenseReportData = useMemo(
    () => filterReportBySearch(expenseReportDataFull, debouncedReportSearch),
    [expenseReportDataFull, debouncedReportSearch]
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
    const previousSavings =
      (incomeTotals.previousActual || 0) - (expenseTotals.previousActual || 0);
    return { plannedSavings, actualSavings, previousSavings };
  }, [incomeTotals, expenseTotals]);

  // Period-over-period delta. `goodWhen` decides the color: for income (and
  // net) higher is good; for expenses lower is good. Returns null when there's
  // no prior baseline or the change rounds to 0.
  const getDelta = (current, previous, goodWhen = 'up') => {
    if (previous == null || previous <= 0) return null;
    const rounded = Math.round(((current - previous) / previous) * 100);
    if (rounded === 0) return null;
    const up = rounded > 0;
    const isGood = goodWhen === 'up' ? up : !up;
    return {
      up,
      text: `${Math.abs(rounded)}%`,
      color: isGood ? 'google.green' : 'google.red',
    };
  };

  // A compact, well-aligned trend badge: a filled up/down triangle + percent,
  // scaled to the surrounding font. `label` appends "vs {period}".
  const renderDelta = (delta, { label = false } = {}) => {
    if (!delta) return null;
    const Arrow = delta.up ? ArrowDropUpIcon : ArrowDropDownIcon;
    return (
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          whiteSpace: 'nowrap',
          fontWeight: 600,
          color: delta.color,
          lineHeight: 1,
        }}
      >
        <Arrow sx={{ fontSize: '1.35em', mx: '-0.18em' }} />
        <Box component="span" sx={{ ml: '0.25em' }}>
          {delta.text}
        </Box>
        {label && (
          <Box
            component="span"
            sx={{ color: 'text.secondary', fontWeight: 400, ml: '0.4em' }}
          >
            vs {periodWord}
          </Box>
        )}
      </Box>
    );
  };

  // One-line, positive-leaning headline that gives the numbers meaning
  const insight = useMemo(() => {
    const income = incomeTotals.actual;
    const expense = expenseTotals.actual;
    if (income <= 0 && expense <= 0) return null;

    const parts = [];
    if (income > 0) {
      const rate = Math.round(((income - expense) / income) * 100);
      parts.push(
        rate >= 0
          ? `${rate}% of income saved`
          : `spending ${Math.abs(rate)}% over income`
      );
    }
    const prevExpense = expenseTotals.previousActual || 0;
    if (expense > 0 && prevExpense > 0) {
      const pct = Math.round(((expense - prevExpense) / prevExpense) * 100);
      if (pct !== 0) {
        parts.push(
          `spending ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% vs ${periodWord}`
        );
      }
    }
    if (parts.length === 0 && expense > 0) {
      parts.push(`Spent ${formatCurrency(expense, baseCurrency)}`);
    }
    return parts.length ? parts.join(' · ') : null;
  }, [incomeTotals, expenseTotals, baseCurrency, periodWord]);

  const modalTransactions = useMemo(
    () => getTransactionsForModal(),
    [selectedCategoryForModal, dateRange, allTransactions]
  );

  if (loading && !isInitialized) {
    return <PageSkeleton />;
  }

  // Format period display
  const getPeriodDisplay = () => {
    if (periodType === 'month') {
      const selectedMonthDate = parseISO(`${selectedMonth}-01`);
      return format(selectedMonthDate, 'MMMM yyyy');
    } else if (periodType === '6months') {
      const startDate = dateRange.start;
      const endDate = dateRange.end;
      if (format(startDate, 'yyyy') === format(endDate, 'yyyy')) {
        return `${format(startDate, 'MMM')} - ${format(endDate, 'MMM yyyy')}`;
      } else {
        return `${format(startDate, 'MMM yyyy')} - ${format(endDate, 'MMM yyyy')}`;
      }
    } else if (periodType === '1year') {
      const startDate = dateRange.start;
      const endDate = dateRange.end;
      if (format(startDate, 'yyyy') === format(endDate, 'yyyy')) {
        return format(startDate, 'yyyy');
      } else {
        return `${format(startDate, 'MMM yyyy')} - ${format(endDate, 'MMM yyyy')}`;
      }
    }
    return '';
  };

  const periodDisplay = getPeriodDisplay();
  const currentMonth = format(new Date(), 'yyyy-MM');

  // Render category row
  const renderCategoryRow = (item, type, level = 0) => {
    const {
      category,
      budget,
      actual,
      previousActual,
      difference,
      variance,
      isMixed,
      budgetOriginalAmounts,
      actualOriginalAmounts,
      differenceOriginalAmounts,
    } = item;
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded =
      reportSearchActive || expandedCategories.has(category.category_id);
    const differenceColor = getDifferenceColor(difference, type);
    const spendDelta = getDelta(
      actual,
      previousActual,
      type === 'Income' ? 'up' : 'down'
    );
    const ownBudget = findBudgetForCategory(category.category_id);
    const childBudgets =
      budget > 0 && hasChildren && descendantsHaveBudgets(category.category_id);
    // Aggregated purely from children (the common case): no label needed.
    // A real parent-level budget is the rare case worth flagging.
    const budgetFromChildrenOnly = childBudgets && !ownBudget;
    const budgetIncludesChildren = childBudgets && !!ownBudget;
    const budgetParentOnly = !!ownBudget && hasChildren && !childBudgets;

    // Difference is shown in a single currency — the one it was budgeted in
    const diffForeign = getForeignCurrencyDisplay(
      null,
      differenceOriginalAmounts
    );
    const diffText = diffForeign
      ? fmt(getDisplayDifference(diffForeign.amount, type), diffForeign.currency)
      : fmt(getDisplayDifference(difference, type), baseCurrency);

    // Currency cell: original amount as primary, base conversion as a smaller
    // secondary line (see getMoneyDisplay)
    const renderCurrencyCell = (amount, originalAmounts, showMixedChip = false) => {
      const money = getMoneyDisplay(amount, originalAmounts);
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
            {showMixedChip && isMixed && (
              <Chip
                label="Mixed currencies"
                size="small"
                sx={{ height: 18, fontSize: '0.65rem' }}
                color="default"
                variant="outlined"
              />
            )}
            <Typography variant="body2">{money.primary}</Typography>
          </Box>
          {money.secondary && (
            <Typography
              variant="caption"
              sx={{ fontSize: '0.7rem', color: 'text.secondary' }}
            >
              {money.secondary}
            </Typography>
          )}
        </Box>
      );
    };

    return (
      <Fragment key={category.category_id}>
        <TableRow
          hover
          onClick={() =>
            hasChildren
              ? toggleCategoryExpansion(category.category_id)
              : handleRowClick(category.category_id, type)
          }
          sx={{ cursor: 'pointer', userSelect: 'none' }}
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
            <Box
              onClick={(event) => {
                event.stopPropagation();
                handleOpenBudgetDialog(category.category_id);
              }}
              role="button"
              aria-label={budget > 0 ? 'Edit budget' : 'Set budget'}
              sx={{
                display: 'inline-block',
                cursor: 'pointer',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              {budget > 0 ? (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                  }}
                >
                  <Box
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                  >
                    {renderCurrencyCell(budget, budgetOriginalAmounts, true)}
                    {!budgetFromChildrenOnly && (
                      <EditIcon
                        sx={{ fontSize: 12, color: 'text.secondary' }}
                      />
                    )}
                  </Box>
                  {(budgetParentOnly || budgetIncludesChildren) && (
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.65rem',
                        color: 'text.secondary',
                        fontStyle: 'italic',
                      }}
                    >
                      {budgetParentOnly
                        ? 'applies to parent only'
                        : 'includes subcategories'}
                    </Typography>
                  )}
                </Box>
              ) : (
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.75rem', color: 'primary.main' }}
                >
                  Set budget
                </Typography>
              )}
            </Box>
          </TableCell>
          <TableCell align="right">
            {renderCurrencyCell(actual, actualOriginalAmounts, true)}
            {spendDelta && (
              <Box
                sx={{
                  fontSize: '0.6875rem',
                  mt: 0.25,
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                {renderDelta(spendDelta, { label: true })}
              </Box>
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
                  {diffText}
                </Typography>
              </Box>
            </Box>
          </TableCell>
          <TableCell align="right">
            {renderProgressCell({ budget, actual, difference, variance }, type)}
          </TableCell>
        </TableRow>
        {hasChildren && isExpanded && (
          <>
            {category.children
              .map((child) => ({
                child,
                data: calculateCategoryData(child, type),
              }))
              .filter(({ data }) => data.budget > 0 || data.actual > 0)
              .sort((a, b) => b.data.actual - a.data.actual)
              .map(({ child, data }) =>
                renderCategoryRow(
                  { category: child, ...data },
                  type,
                  level + 1
                )
              )}
            <TableRow
              hover
              onClick={() => handleRowClick(category.category_id, type)}
              sx={{ cursor: 'pointer' }}
            >
              <TableCell colSpan={5} sx={{ py: 0.75 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    pl: (level + 1) * 2 + 5,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ color: 'primary.main' }}
                  >
                    All {category.name} transactions
                  </Typography>
                  <ChevronRightIcon
                    sx={{ fontSize: 14, color: 'primary.main', ml: 0.25 }}
                  />
                </Box>
              </TableCell>
            </TableRow>
          </>
        )}
      </Fragment>
    );
  };

  // Human phrase for how actuals compare to budget
  const getVariancePhrase = (variance, type) => {
    if (variance === null || variance === undefined) {
      return { text: 'No budget', color: 'text.secondary' };
    }
    const pctOfBudget = Math.round(100 + variance);
    if (type === 'Income') {
      return {
        text: `${pctOfBudget}% of plan`,
        color: variance < 0 ? 'error.main' : 'success.main',
      };
    }
    if (variance > 0) {
      return {
        text: `${Math.round(variance)}% over budget`,
        color: 'error.main',
      };
    }
    return { text: `${pctOfBudget}% used`, color: 'text.secondary' };
  };

  // Variance phrase + progress bar for desktop table cells
  const renderProgressCell = (
    { budget, actual, difference, variance },
    type,
    bold = false
  ) => {
    const phrase = getVariancePhrase(variance, type);
    const pctUsed = budget > 0 ? (actual / budget) * 100 : null;
    const barColor = getDifferenceColor(difference, type).startsWith('success')
      ? 'success'
      : 'error';
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 0.5,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.75rem',
            fontWeight: bold ? 'bold' : 500,
            color: phrase.color,
          }}
        >
          {phrase.text}
        </Typography>
        {pctUsed !== null && (
          <LinearProgress
            variant="determinate"
            value={Math.min(100, pctUsed)}
            color={barColor}
            sx={{
              height: 4,
              borderRadius: 2,
              width: 110,
              backgroundColor: 'action.hover',
            }}
          />
        )}
      </Box>
    );
  };

  // Render a category as a dense list row with a progress bar (mobile view).
  // Parent rows expand/collapse on tap; leaf rows open the transaction modal.
  const renderMobileCategoryRow = (item, type, level = 0) => {
    const {
      category,
      budget,
      actual,
      previousActual,
      difference,
      isMixed,
      budgetOriginalAmounts,
      actualOriginalAmounts,
      differenceOriginalAmounts,
    } = item;
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded =
      reportSearchActive || expandedCategories.has(category.category_id);
    // Period-over-period trend + an over-budget cue on the amount itself
    const spendDelta = getDelta(
      actual,
      previousActual,
      type === 'Income' ? 'up' : 'down'
    );
    const overBudget = type === 'Expense' && budget > 0 && actual > budget;
    // Original-currency-first money displays (see getMoneyDisplay)
    const actualMoney = getMoneyDisplay(actual, actualOriginalAmounts);
    const budgetMoney = getMoneyDisplay(budget, budgetOriginalAmounts);
    const diffForeign = getForeignCurrencyDisplay(
      null,
      differenceOriginalAmounts
    );
    // Difference in the budgeted currency: magnitude + a direction word so it
    // clearly reads as the budget difference. difference = budget − actual.
    // Expense: >0 under → "left", <0 over → "over".
    // Income:  >0 short of plan → "short", <0 exceeded → "over".
    const diffCurrency = diffForeign ? diffForeign.currency : baseCurrency;
    const diffAmount = diffForeign ? diffForeign.amount : difference;
    const diffText = fmt(Math.abs(diffAmount), diffCurrency);
    const diffWord =
      difference < 0
        ? 'over'
        : difference > 0
        ? type === 'Income'
          ? 'short'
          : 'left'
        : '';

    // Budgets aggregated purely from children (the common case) get no
    // label; a real parent-level budget is the rare case worth flagging.
    // A parent can also have its own budget plus budgeted children (tapping
    // edits the own record, smaller than the shown sum) — kept honest.
    const ownBudget = findBudgetForCategory(category.category_id);
    const childBudgets =
      budget > 0 && hasChildren && descendantsHaveBudgets(category.category_id);
    const budgetFromChildrenOnly = childBudgets && !ownBudget;
    const budgetIncludesChildren = childBudgets && !!ownBudget;
    const budgetParentOnly = !!ownBudget && hasChildren && !childBudgets;
    const budgetLabel = budgetParentOnly
      ? ' (applies to parent only)'
      : budgetIncludesChildren
      ? ' (includes subcategories)'
      : '';

    return (
      <Fragment key={category.category_id}>
        <Box
          onClick={() =>
            hasChildren
              ? toggleCategoryExpansion(category.category_id)
              : handleRowClick(category.category_id, type)
          }
          sx={{
            py: level > 0 ? 1 : 1.25,
            pl: level * 3.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
            ...tappableRowSx,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                minWidth: 0,
                flex: 1,
              }}
            >
              {hasChildren && (
                <ExpandMoreIcon
                  sx={{
                    fontSize: 18,
                    mr: 0.5,
                    color: 'text.secondary',
                    flexShrink: 0,
                    transform: isExpanded ? 'none' : 'rotate(-90deg)',
                    transition: 'transform 0.15s ease-in-out',
                  }}
                />
              )}
              <Typography
                variant="body2"
                noWrap
                sx={{
                  fontSize: level > 0 ? '0.875rem' : '0.9375rem',
                  fontWeight: level > 0 ? 400 : 500,
                  color: level > 0 ? 'text.secondary' : 'text.primary',
                  minWidth: 0,
                }}
              >
                {category.name}
              </Typography>
              {isMixed && (
                <Chip
                  label="Mixed"
                  size="small"
                  variant="outlined"
                  sx={{
                    ml: 0.75,
                    height: 16,
                    fontSize: '0.625rem',
                    flexShrink: 0,
                  }}
                />
              )}
            </Box>
            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 0.625,
                }}
              >
                {spendDelta && (
                  <Box sx={{ fontSize: '0.6875rem' }}>
                    {renderDelta(spendDelta)}
                  </Box>
                )}
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: level > 0 ? '0.875rem' : '0.9375rem',
                    fontWeight: level > 0 ? 500 : 600,
                    color: overBudget
                      ? 'error.main'
                      : level > 0
                      ? 'text.secondary'
                      : 'text.primary',
                  }}
                >
                  {actualMoney.primary}
                </Typography>
              </Box>
              {actualMoney.secondary && (
                <Typography
                  sx={{
                    fontSize: '0.625rem',
                    lineHeight: 1.25,
                    color: 'text.secondary',
                  }}
                >
                  {actualMoney.secondary}
                </Typography>
              )}
            </Box>
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              mt: 0.125,
              pl: hasChildren ? 2.875 : 0,
            }}
          >
            <Box
              onClick={(event) => {
                event.stopPropagation();
                handleOpenBudgetDialog(category.category_id);
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.25,
                minWidth: 0,
                py: 0.25,
                px: 0.5,
                ml: -0.5,
                borderRadius: 0.5,
                ...tappableRowSx,
              }}
            >
              {budget > 0 ? (
                <>
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      fontSize: '0.6875rem',
                      color: 'text.secondary',
                      minWidth: 0,
                    }}
                  >
                    of {budgetMoney.primary}
                    {budgetLabel}
                  </Typography>
                  {/* Edit cue when there's an editable own budget; a "+" cue
                      when the shown budget is aggregated from children and
                      tapping instead creates the parent's own budget */}
                  {budgetFromChildrenOnly ? (
                    <AddIcon
                      sx={{ fontSize: 13, color: 'text.secondary', flexShrink: 0 }}
                    />
                  ) : (
                    <EditIcon
                      sx={{ fontSize: 11, color: 'text.secondary', flexShrink: 0 }}
                    />
                  )}
                </>
              ) : (
                <Typography
                  variant="caption"
                  noWrap
                  sx={{ fontSize: '0.6875rem', color: 'primary.main' }}
                >
                  Set budget
                </Typography>
              )}
            </Box>
            {budget > 0 && (
              <Typography
                variant="caption"
                noWrap
                sx={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  color: getDifferenceColor(difference, type),
                  flexShrink: 0,
                }}
              >
                {diffText}
                {diffWord ? ` ${diffWord}` : ''} ·{' '}
                {Math.round((actual / budget) * 100)}%
              </Typography>
            )}
          </Box>
        </Box>
        {hasChildren && isExpanded && (
          <>
            {category.children
              .map((child) => ({
                child,
                data: calculateCategoryData(child, type),
              }))
              .filter(({ data }) => data.budget > 0 || data.actual > 0)
              .sort((a, b) => b.data.actual - a.data.actual)
              .map(({ child, data }) =>
                renderMobileCategoryRow(
                  { category: child, ...data },
                  type,
                  level + 1
                )
              )}
            <Box
              onClick={() => handleRowClick(category.category_id, type)}
              sx={{
                py: 0.75,
                pl: (level + 1) * 3.5,
                display: 'flex',
                alignItems: 'center',
                borderBottom: '1px solid',
                borderColor: 'divider',
                ...tappableRowSx,
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontSize: '0.6875rem', color: 'primary.main' }}
              >
                All {category.name} transactions
              </Typography>
              <ChevronRightIcon
                sx={{ fontSize: 14, color: 'primary.main', ml: 0.25 }}
              />
            </Box>
          </>
        )}
      </Fragment>
    );
  };

  // Render a full report section as a dense list with totals up top (mobile)
  const renderSectionMobile = (reportData, totals, type, label) => {
    const totalActualMoney = getMoneyDisplay(
      totals.actual,
      totals.actualOriginalAmounts
    );
    const totalBudgetMoney = getMoneyDisplay(
      totals.budget,
      totals.budgetOriginalAmounts
    );
    const variancePhrase = getVariancePhrase(totals.variance, type);
    const sectionColor = type === 'Income' ? 'google.green' : 'google.red';
    const sectionTint = type === 'Income' ? 'google.greenBg' : 'google.redBg';

    return (
      <Box>
        {/* Section header — a subtle green/red aggregate band marks the start
            of each section, following the app's income/expense colour pattern */}
        <Box
          sx={{
            px: 1.25,
            py: 1,
            mb: 0.75,
            borderRadius: 1.5,
            backgroundColor: sectionTint,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              mb: 0.25,
            }}
          >
            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: sectionColor,
              }}
            >
              {label}
            </Typography>
            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: variancePhrase.color,
                flexShrink: 0,
              }}
            >
              {variancePhrase.text}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, minWidth: 0 }}>
              {renderMoneyInline(totalActualMoney)}
            </Typography>
            {totals.budget > 0 && (
              <Typography
                variant="caption"
                noWrap
                sx={{
                  fontSize: '0.75rem',
                  color: 'text.secondary',
                  flexShrink: 0,
                  minWidth: 0,
                }}
              >
                of {renderMoneyInline(totalBudgetMoney)}
              </Typography>
            )}
          </Box>
        </Box>
        {reportData.length === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1.5, fontSize: '0.8125rem' }}
          >
            {reportSearchActive
              ? 'No categories match your filter'
              : 'No categories with budget or activity for this period'}
          </Typography>
        ) : (
          <Box sx={{ mt: 0.5 }}>
            {reportData.map((item) => renderMobileCategoryRow(item, type))}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: { xs: 1.5, sm: 2, md: 3 },
        }}
      >
        <Typography
          variant="h5"
          sx={{
            fontSize: { xs: '1.25rem', sm: '1.5rem' },
            fontWeight: 500,
          }}
        >
          Budget vs Actual
        </Typography>
        <IconButton
          onClick={() => handleOpenBudgetDialog()}
          aria-label="Add budget"
          sx={{
            backgroundColor: 'primary.main',
            color: 'primary.contrastText',
            width: 36,
            height: 36,
            '&:hover': {
              backgroundColor: 'primary.dark',
            },
          }}
        >
          <AddIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

      {error && <ErrorMessage error={error} />}

      {/* Period Navigation */}
      <Box sx={{ mb: { xs: 1.25, sm: 2 } }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: { xs: 0.75, sm: 1.5 },
            }}
          >
            {/* Period Type Selector — borderless underline tabs */}
            <Box
              sx={{ display: 'flex', justifyContent: 'center' }}
            >
              {PERIOD_OPTIONS.map((option, index) => (
                <Fragment key={option.value}>
                  {index > 0 && (
                    <Divider
                      orientation="vertical"
                      flexItem
                      sx={{ my: 0.75 }}
                    />
                  )}
                  <Box
                    onClick={() => setPeriodType(option.value)}
                    sx={{
                      px: { xs: 1.5, sm: 2.5 },
                      py: { xs: 0.5, sm: 0.75 },
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                      userSelect: 'none',
                      fontWeight: periodType === option.value ? 600 : 400,
                      color:
                        periodType === option.value
                          ? 'primary.main'
                          : 'text.secondary',
                      borderBottom: '2px solid',
                      borderColor:
                        periodType === option.value
                          ? 'primary.main'
                          : 'transparent',
                      transition:
                        'color 0.15s ease, border-color 0.15s ease',
                      '@media (hover: hover)': {
                        '&:hover': {
                          color:
                            periodType === option.value
                              ? 'primary.main'
                              : 'text.primary',
                        },
                      },
                    }}
                  >
                    {option.label}
                  </Box>
                </Fragment>
              ))}
            </Box>

            {/* Period Navigation */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: { xs: 1, sm: 2 },
              }}
            >
              <IconButton onClick={handlePreviousPeriod} size="small">
                <ChevronLeftIcon />
              </IconButton>
              <Typography
                variant="h6"
                sx={{ minWidth: { xs: 120, sm: 250 }, textAlign: 'center', fontSize: { xs: '1rem', sm: '1.25rem' } }}
              >
                {periodDisplay}
              </Typography>
              <IconButton onClick={handleNextPeriod} size="small">
                <ChevronRightIcon />
              </IconButton>
            </Box>

            {/* Quick jump back to the current month */}
            {selectedMonth !== currentMonth && (
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Button
                  size="small"
                  onClick={() => setSelectedMonth(currentMonth)}
                  startIcon={<TodayIcon sx={{ fontSize: 16 }} />}
                  sx={{ textTransform: 'none' }}
                >
                  This month
                </Button>
              </Box>
            )}
          </Box>
      </Box>

      <Divider sx={PAGE_DIVIDER_SX} />

      {/* Filter to a specific category */}
      <Box sx={{ mb: { xs: 2, sm: 2.5 } }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Filter by category…"
          value={reportSearch}
          onChange={(e) => setReportSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" sx={{ fontSize: 20 }} />
              </InputAdornment>
            ),
            endAdornment: reportSearch && (
              <InputAdornment position="end">
                <IconButton
                  onClick={() => {
                    setReportSearch('');
                    setDebouncedReportSearch('');
                  }}
                  edge="end"
                  size="small"
                  aria-label="Clear filter"
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: { xs: '0.875rem', sm: '0.9375rem' },
            },
          }}
        />
      </Box>

      {/* At-a-glance summary */}
      <Box sx={{ mb: { xs: 2.5, sm: 3 } }}>
            {(() => {
              const tiles = [
                {
                  label: 'Income',
                  value: incomeTotals.actual,
                  plan: incomeTotals.budget,
                  color: 'success.main',
                  delta: getDelta(
                    incomeTotals.actual,
                    incomeTotals.previousActual,
                    'up'
                  ),
                },
                {
                  label: 'Expenses',
                  value: expenseTotals.actual,
                  plan: expenseTotals.budget,
                  color: 'error.main',
                  delta: getDelta(
                    expenseTotals.actual,
                    expenseTotals.previousActual,
                    'down'
                  ),
                },
                {
                  label: 'Net',
                  value: netSummary.actualSavings,
                  plan: netSummary.plannedSavings,
                  color:
                    netSummary.actualSavings >= 0
                      ? 'success.main'
                      : 'error.main',
                  delta: getDelta(
                    netSummary.actualSavings,
                    netSummary.previousSavings,
                    'up'
                  ),
                },
              ];

              // Desktop: three columns with dividers
              if (isDesktopView) {
                return (
                  <Box sx={{ display: 'flex', gap: 4 }}>
                    {tiles.map((tile, index) => (
                      <Fragment key={tile.label}>
                        {index > 0 && (
                          <Divider orientation="vertical" flexItem />
                        )}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: '0.8125rem',
                              color: 'text.secondary',
                            }}
                          >
                            {tile.label}
                          </Typography>
                          <Typography
                            noWrap
                            sx={{
                              fontSize: '1.375rem',
                              fontWeight: 600,
                              color: tile.color,
                            }}
                          >
                            {formatCurrency(tile.value, baseCurrency)}
                          </Typography>
                          {tile.delta && (
                            <Box sx={{ fontSize: '0.75rem', mt: 0.25 }}>
                              {renderDelta(tile.delta, { label: true })}
                            </Box>
                          )}
                          <Typography
                            noWrap
                            variant="caption"
                            sx={{
                              fontSize: '0.75rem',
                              color: 'text.secondary',
                              display: 'block',
                            }}
                          >
                            Plan: {formatCurrency(tile.plan, baseCurrency)}
                          </Typography>
                        </Box>
                      </Fragment>
                    ))}
                  </Box>
                );
              }

              // Mobile: stacked rows — label left, amount + delta right, so a
              // long amount gets the full width instead of a squeezed column
              return (
                <Box>
                  {tiles.map((tile, index) => (
                    <Box
                      key={tile.label}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1.5,
                        py: 1,
                        borderTop: index > 0 ? '1px solid' : 'none',
                        borderColor: 'divider',
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          flexShrink: 0,
                        }}
                      >
                        {tile.label}
                      </Typography>
                      <Box sx={{ textAlign: 'right', minWidth: 0 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 0.75,
                          }}
                        >
                          {tile.delta && (
                            <Box sx={{ fontSize: '0.6875rem' }}>
                              {renderDelta(tile.delta)}
                            </Box>
                          )}
                          <Typography
                            noWrap
                            sx={{
                              fontSize: '1.0625rem',
                              fontWeight: 700,
                              color: tile.color,
                            }}
                          >
                            {formatCurrency(tile.value, baseCurrency)}
                          </Typography>
                        </Box>
                        {tile.plan > 0 && (
                          <Typography
                            sx={{
                              fontSize: '0.6875rem',
                              color: 'text.secondary',
                            }}
                          >
                            Plan {formatCurrency(tile.plan, baseCurrency)}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              );
            })()}
            {insight && (
              <Typography
                sx={{
                  mt: { xs: 1.25, sm: 1.5 },
                  textAlign: 'center',
                  fontSize: { xs: '0.75rem', md: '0.8125rem' },
                  color: 'text.secondary',
                }}
              >
                {insight}
              </Typography>
            )}
      </Box>

      <Divider sx={PAGE_DIVIDER_SX} />

      {/* Income Budget vs Actual Section */}
      <Box sx={{ mb: { xs: 3, sm: 3 } }}>
          {isDesktopView && (
            <Typography variant="h6" sx={{ mb: { xs: 1.5, sm: 2 }, fontWeight: 'bold', fontSize: { xs: '1rem', sm: '1.125rem' } }}>
              Income Budget vs Actual
            </Typography>
          )}
          {/* Mobile list view */}
          {!isDesktopView &&
            renderSectionMobile(incomeReportData, incomeTotals, 'Income', 'Income')}
          {/* Desktop table view */}
          {isDesktopView && (
          <Box
            sx={{
              overflowX: 'auto',
            }}
          >
            <Table size="small" sx={{ minWidth: 600 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 140, whiteSpace: 'nowrap' }}>CATEGORY</TableCell>
                  <TableCell align="right" sx={{ minWidth: 100, whiteSpace: 'nowrap' }}>BUDGETED</TableCell>
                  <TableCell align="right" sx={{ minWidth: 110, whiteSpace: 'nowrap' }}>ACTUAL INCOME</TableCell>
                  <TableCell align="right" sx={{ minWidth: 100, whiteSpace: 'nowrap' }}>DIFFERENCE</TableCell>
                  <TableCell align="right" sx={{ minWidth: 130, whiteSpace: 'nowrap' }}>PROGRESS</TableCell>
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
                    {renderMoneyStacked(
                      incomeTotals.budget,
                      incomeTotals.budgetOriginalAmounts,
                      { isMixed: incomeTotals.isMixed, bold: true }
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {renderMoneyStacked(
                      incomeTotals.actual,
                      incomeTotals.actualOriginalAmounts,
                      { isMixed: incomeTotals.isMixed, bold: true }
                    )}
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
                        {getDiffText(
                          incomeTotals.difference,
                          incomeTotals.differenceOriginalAmounts,
                          'Income'
                        )}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    {renderProgressCell(incomeTotals, 'Income', true)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Box>
          )}
      </Box>

      <Divider sx={PAGE_DIVIDER_SX} />

      {/* Expense Budget vs Actual Section */}
      <Box sx={{ mb: { xs: 2.5, sm: 3 } }}>
          {isDesktopView && (
            <Typography variant="h6" sx={{ mb: { xs: 1.5, sm: 2 }, fontWeight: 'bold', fontSize: { xs: '1rem', sm: '1.125rem' } }}>
              Expense Budget vs Actual
            </Typography>
          )}
          {/* Mobile list view */}
          {!isDesktopView &&
            renderSectionMobile(expenseReportData, expenseTotals, 'Expense', 'Expenses')}
          {/* Desktop table view */}
          {isDesktopView && (
          <Box
            sx={{
              overflowX: 'auto',
            }}
          >
            <Table size="small" sx={{ minWidth: 600 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 140, whiteSpace: 'nowrap' }}>CATEGORY</TableCell>
                  <TableCell align="right" sx={{ minWidth: 100, whiteSpace: 'nowrap' }}>BUDGETED</TableCell>
                  <TableCell align="right" sx={{ minWidth: 120, whiteSpace: 'nowrap' }}>ACTUAL SPENDING</TableCell>
                  <TableCell align="right" sx={{ minWidth: 100, whiteSpace: 'nowrap' }}>DIFFERENCE</TableCell>
                  <TableCell align="right" sx={{ minWidth: 130, whiteSpace: 'nowrap' }}>PROGRESS</TableCell>
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
                    {renderMoneyStacked(
                      expenseTotals.budget,
                      expenseTotals.budgetOriginalAmounts,
                      { isMixed: expenseTotals.isMixed, bold: true }
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {renderMoneyStacked(
                      expenseTotals.actual,
                      expenseTotals.actualOriginalAmounts,
                      { isMixed: expenseTotals.isMixed, bold: true }
                    )}
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
                        {getDiffText(
                          expenseTotals.difference,
                          expenseTotals.differenceOriginalAmounts,
                          'Expense'
                        )}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    {renderProgressCell(expenseTotals, 'Expense', true)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Box>
          )}
      </Box>

      {/* Transaction Modal */}
      <Dialog
        open={transactionModalOpen}
        onClose={() => setTransactionModalOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ pb: 1 }}>
          Transactions - {periodDisplay}
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
          <CategoryTransactionsList transactions={modalTransactions} />
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          <Button
            startIcon={<EditIcon sx={{ fontSize: 18 }} />}
            onClick={() =>
              selectedCategoryForModal &&
              handleOpenBudgetDialog(selectedCategoryForModal.categoryId)
            }
          >
            {selectedCategoryForModal &&
            findBudgetForCategory(selectedCategoryForModal.categoryId)
              ? 'Edit budget'
              : 'Add budget'}
          </Button>
          <Button onClick={() => setTransactionModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Create/Edit Budget Dialog (shared with the Budgets page) */}
      <BudgetDialog
        open={budgetDialogOpen}
        onClose={() => setBudgetDialogOpen(false)}
        editingBudget={budgetDialogTarget?.budget || null}
        referenceMonth={selectedMonth}
        defaultCategoryId={budgetDialogTarget?.categoryId || ''}
      />
    </Box>
  );
}

export default Reports;
