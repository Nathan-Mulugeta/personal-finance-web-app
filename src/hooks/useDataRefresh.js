import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchAccounts } from '../store/slices/accountsSlice'
import { fetchTransactions } from '../store/slices/transactionsSlice'
import { fetchCategories } from '../store/slices/categoriesSlice'
import { fetchBudgets } from '../store/slices/budgetsSlice'
import { fetchTransfers } from '../store/slices/transfersSlice'
import { fetchBorrowingLendingRecords } from '../store/slices/borrowingsLendingsSlice'
import { fetchSettings } from '../store/slices/settingsSlice'
import { fetchExchangeRates } from '../store/slices/exchangeRatesSlice'
import { recalculateAllBalances } from '../store/slices/accountsSlice'

/**
 * Hook to handle data refresh mechanisms:
 * 1. Refresh on app focus
 * 2. Periodic background refresh
 */
export function useDataRefresh() {
  const dispatch = useDispatch()
  const appInitialized = useSelector((state) => state.appInit.isInitialized)
  const allTransactions = useSelector((state) => state.transactions.allTransactions)

  // Refresh on app focus
  useEffect(() => {
    if (!appInitialized) return

    const handleFocus = () => {
      // Silent background refresh using incremental sync
      // These will automatically use incremental sync if lastSync timestamps exist
      dispatch(fetchAccounts({ status: 'Active' }))
      dispatch(fetchTransactions({}))
      dispatch(fetchCategories({}))
      dispatch(fetchBudgets({}))
      dispatch(fetchTransfers({}))
      dispatch(fetchBorrowingLendingRecords({}))
      dispatch(fetchSettings())
      dispatch(fetchExchangeRates({}))
      
      // Recalculate balances after a short delay to ensure transactions are loaded
      setTimeout(() => {
        dispatch(recalculateAllBalances())
      }, 500)
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [appInitialized, dispatch])

  // Periodic background refresh (every 5 minutes)
  useEffect(() => {
    if (!appInitialized) return

    const refreshInterval = setInterval(() => {
      // Background refresh using incremental sync
      // These will automatically use incremental sync if lastSync timestamps exist
      dispatch(fetchAccounts({ status: 'Active' }))
      dispatch(fetchTransactions({}))
      dispatch(fetchCategories({}))
      dispatch(fetchBudgets({}))
      dispatch(fetchTransfers({}))
      dispatch(fetchBorrowingLendingRecords({}))
      dispatch(fetchSettings())
      dispatch(fetchExchangeRates({}))
      
      // Recalculate balances after a short delay
      setTimeout(() => {
        dispatch(recalculateAllBalances())
      }, 500)
    }, 300000) // 5 minutes

    return () => clearInterval(refreshInterval)
  }, [appInitialized, dispatch])

  // Recalculate balances when transactions change
  // Note: This is a fallback - individual balance recalculation happens in transaction handlers
  useEffect(() => {
    if (!appInitialized) return

    // Debounce balance recalculation to avoid excessive calculations
    // Only recalculate if transactions array length changes significantly
    const timeoutId = setTimeout(() => {
      if (allTransactions && allTransactions.length > 0) {
        dispatch(recalculateAllBalances())
      }
    }, 1000) // 1 second debounce for bulk recalculation

    return () => clearTimeout(timeoutId)
  }, [allTransactions?.length, appInitialized, dispatch])
}

