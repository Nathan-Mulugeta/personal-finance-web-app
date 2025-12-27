import { fetchAccounts } from '../store/slices/accountsSlice';
import { fetchTransactions } from '../store/slices/transactionsSlice';
import { fetchCategories } from '../store/slices/categoriesSlice';
import { fetchBudgets } from '../store/slices/budgetsSlice';
import { fetchTransfers } from '../store/slices/transfersSlice';
import { fetchBorrowingLendingRecords } from '../store/slices/borrowingsLendingsSlice';
import { fetchSettings } from '../store/slices/settingsSlice';
import { fetchExchangeRates } from '../store/slices/exchangeRatesSlice';
import { recalculateAllBalances } from '../store/slices/accountsSlice';

/**
 * Refreshes all data in the application.
 * This should be called after any create/update/delete operation
 * to ensure all pages have fresh data.
 *
 * @param {Function} dispatch - Redux dispatch function
 * @param {Object} options - Optional configuration
 * @param {boolean} options.forceFull - Force full refresh (bypass incremental sync)
 * @param {boolean} options.recalculateBalances - Whether to recalculate balances (default: true)
 * @param {string[]} options.forceFullFor - Array of entity types to force full refresh for
 */
export async function refreshAllData(dispatch, options = {}) {
  const { forceFull = false, recalculateBalances = true, forceFullFor = [] } = options;

  try {
    // Fetch all data in parallel
    const fetchOptions = forceFull ? { forceFull: true } : {};

    await Promise.all([
      dispatch(fetchAccounts({ status: 'Active', ...fetchOptions })),
      dispatch(fetchTransactions({ ...fetchOptions })),
      dispatch(fetchCategories({ ...fetchOptions })),
      dispatch(fetchBudgets({ ...fetchOptions })),
      // Always force full refresh for transfers to ensure all transfers are shown
      dispatch(fetchTransfers({ forceFull: true, ...fetchOptions })),
      dispatch(fetchBorrowingLendingRecords({ ...fetchOptions })),
      dispatch(fetchSettings()),
      dispatch(fetchExchangeRates({ ...fetchOptions })),
    ]);

    // Recalculate balances after a short delay to ensure transactions are loaded
    if (recalculateBalances) {
      setTimeout(() => {
        dispatch(recalculateAllBalances());
      }, 500);
    }
  } catch (error) {
    console.error('Error refreshing all data:', error);
    // Don't throw - allow the app to continue even if refresh fails
  }
}
