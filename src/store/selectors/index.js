import { createSelector } from '@reduxjs/toolkit';

// ============================================
// Base Selectors (simple state accessors)
// ============================================

// Accounts
export const selectAccountsState = (state) => state.accounts;
export const selectAllAccounts = (state) => state.accounts.accounts;
export const selectAccountsLoading = (state) => state.accounts.loading;
export const selectAccountsError = (state) => state.accounts.error;

// Categories
export const selectCategoriesState = (state) => state.categories;
export const selectAllCategories = (state) => state.categories.categories;
export const selectCategoriesLoading = (state) => state.categories.loading;
export const selectCategoriesError = (state) => state.categories.error;

// Transactions
export const selectTransactionsState = (state) => state.transactions;
export const selectAllTransactions = (state) => state.transactions.allTransactions;
export const selectFilteredTransactions = (state) => state.transactions.transactions;
export const selectTransactionsLoading = (state) => state.transactions.loading;

// Settings
export const selectSettingsState = (state) => state.settings;
export const selectAllSettings = (state) => state.settings.settings;

// ============================================
// Memoized Account Selectors
// ============================================

/**
 * Select only active accounts
 * Memoized - only recalculates when accounts array changes
 */
export const selectActiveAccounts = createSelector(
  [selectAllAccounts],
  (accounts) => accounts.filter((account) => account.status === 'Active')
);

/**
 * Create a Map for O(1) account lookups by ID
 * Memoized - only rebuilds map when accounts change
 */
export const selectAccountMap = createSelector(
  [selectAllAccounts],
  (accounts) => new Map(accounts.map((account) => [account.account_id, account]))
);

/**
 * Get account name by ID (returns a function for dynamic lookups)
 * Usage: const getAccountName = useSelector(selectAccountNameGetter)
 *        const name = getAccountName(accountId)
 */
export const selectAccountNameGetter = createSelector(
  [selectAccountMap],
  (accountMap) => (accountId) => {
    if (!accountId) return 'Unknown';
    const account = accountMap.get(accountId);
    return account?.name || 'Unknown';
  }
);

/**
 * Get account currency by ID
 */
export const selectAccountCurrencyGetter = createSelector(
  [selectAccountMap],
  (accountMap) => (accountId) => {
    if (!accountId) return '';
    const account = accountMap.get(accountId);
    return account?.currency || '';
  }
);

// ============================================
// Memoized Category Selectors
// ============================================

/**
 * Select only active categories
 */
export const selectActiveCategories = createSelector(
  [selectAllCategories],
  (categories) => categories.filter((category) => category.status === 'Active')
);

/**
 * Select active income categories
 */
export const selectIncomeCategories = createSelector(
  [selectActiveCategories],
  (categories) => categories.filter((category) => category.type === 'Income')
);

/**
 * Select active expense categories
 */
export const selectExpenseCategories = createSelector(
  [selectActiveCategories],
  (categories) => categories.filter((category) => category.type === 'Expense')
);

/**
 * Create a Map for O(1) category lookups by ID
 */
export const selectCategoryMap = createSelector(
  [selectAllCategories],
  (categories) => new Map(categories.map((category) => [category.category_id, category]))
);

/**
 * Get category name by ID
 */
export const selectCategoryNameGetter = createSelector(
  [selectCategoryMap],
  (categoryMap) => (categoryId) => {
    if (!categoryId) return 'Unknown';
    const category = categoryMap.get(categoryId);
    return category?.name || 'Unknown';
  }
);

/**
 * Get category display name by ID (includes parent if exists)
 * Returns "Parent > Subcategory" format for subcategories, or just the name for parent categories
 */
export const selectCategoryDisplayNameGetter = createSelector(
  [selectCategoryMap],
  (categoryMap) => (categoryId) => {
    if (!categoryId) return 'Unknown';
    const category = categoryMap.get(categoryId);
    if (!category) return 'Unknown';
    
    // If category has a parent, show "Parent > Subcategory" format
    if (category.parent_category_id) {
      const parent = categoryMap.get(category.parent_category_id);
      if (parent) {
        return `${parent.name} > ${category.name}`;
      }
    }
    
    // Otherwise, just return the category name
    return category.name || 'Unknown';
  }
);

/**
 * Select categories filtered by type (parameterized selector factory)
 * Usage: const expenseCategories = useSelector(selectCategoriesByType('Expense'))
 */
export const selectCategoriesByType = (type) =>
  createSelector([selectActiveCategories], (categories) =>
    categories.filter((category) => category.type === type)
  );

// ============================================
// Memoized Settings Selectors
// ============================================

/**
 * Create a Map for O(1) setting lookups by key
 */
export const selectSettingsMap = createSelector(
  [selectAllSettings],
  (settings) => new Map(settings.map((setting) => [setting.setting_key, setting.setting_value]))
);

/**
 * Get base currency from settings
 */
export const selectBaseCurrency = createSelector(
  [selectSettingsMap],
  (settingsMap) => settingsMap.get('BaseCurrency') || 'USD'
);

/**
 * Get default account ID from settings
 */
export const selectDefaultAccountId = createSelector(
  [selectSettingsMap],
  (settingsMap) => settingsMap.get('DefaultAccountID') || null
);

/**
 * Get Gemini API key from settings
 */
export const selectGeminiApiKey = createSelector(
  [selectSettingsMap],
  (settingsMap) => settingsMap.get('GeminiAPIKey') || null
);

/**
 * Get borrowing category ID from settings
 */
export const selectBorrowingCategoryId = createSelector(
  [selectSettingsMap],
  (settingsMap) => settingsMap.get('BorrowingCategoryID') || null
);

/**
 * Get lending category ID from settings
 */
export const selectLendingCategoryId = createSelector(
  [selectSettingsMap],
  (settingsMap) => settingsMap.get('LendingCategoryID') || null
);

/**
 * Get borrowing payment category ID from settings
 */
export const selectBorrowingPaymentCategoryId = createSelector(
  [selectSettingsMap],
  (settingsMap) => settingsMap.get('BorrowingPaymentCategoryID') || null
);

/**
 * Get lending payment category ID from settings
 */
export const selectLendingPaymentCategoryId = createSelector(
  [selectSettingsMap],
  (settingsMap) => settingsMap.get('LendingPaymentCategoryID') || null
);

// ============================================
// Composite Selectors (combining multiple slices)
// ============================================

/**
 * Get default account object (combines settings + accounts)
 */
export const selectDefaultAccount = createSelector(
  [selectDefaultAccountId, selectAccountMap],
  (defaultAccountId, accountMap) => {
    if (!defaultAccountId) return null;
    return accountMap.get(defaultAccountId) || null;
  }
);

/**
 * Get currency totals across all active accounts
 * Returns: { USD: 1000, EUR: 500, ... }
 */
export const selectCurrencyTotals = createSelector(
  [selectActiveAccounts],
  (accounts) => {
    const totals = {};
    accounts.forEach((account) => {
      const currency = account.currency;
      const balance = account.current_balance ?? account.opening_balance ?? 0;
      totals[currency] = (totals[currency] || 0) + balance;
    });
    return totals;
  }
);

/**
 * Get total balance in base currency (requires exchange rates in state)
 * This is a placeholder - actual implementation would need exchange rate state
 */
export const selectTotalBalanceInBaseCurrency = createSelector(
  [selectCurrencyTotals, selectBaseCurrency],
  (currencyTotals, baseCurrency) => {
    // For accounts in base currency, return directly
    // For other currencies, conversion would be needed (requires exchange rates)
    return currencyTotals[baseCurrency] || 0;
  }
);

