import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchAccounts } from '../store/slices/accountsSlice'
import { fetchTransactions } from '../store/slices/transactionsSlice'
import { fetchCategories } from '../store/slices/categoriesSlice'
import { fetchBudgets } from '../store/slices/budgetsSlice'
import { fetchTransfers } from '../store/slices/transfersSlice'
import { fetchBorrowingLendingRecords } from '../store/slices/borrowingsLendingsSlice'
import { fetchSettings } from '../store/slices/settingsSlice'
import { fetchExchangeRates } from '../store/slices/exchangeRatesSlice'

// Only refresh if the user was inactive for more than 1 minute
const INACTIVITY_THRESHOLD = 60000 // 1 minute in ms

/**
 * Hook to handle data refresh on returning from inactivity.
 * 
 * Tracks when the tab becomes inactive (via blur or visibility change)
 * and only refreshes data if the user was away for more than 1 minute.
 * 
 * This serves as a safety net for cases where realtime subscriptions
 * might have missed updates (e.g., WebSocket disconnection while backgrounded).
 */
export function useDataRefresh() {
  const dispatch = useDispatch()
  const appInitialized = useSelector((state) => state.appInit.isInitialized)
  const lastActiveTime = useRef(Date.now())
  const isInactive = useRef(false)

  useEffect(() => {
    if (!appInitialized) return

    const markInactive = () => {
      if (!isInactive.current) {
        lastActiveTime.current = Date.now()
        isInactive.current = true
      }
    }

    const handleReturn = () => {
      if (!isInactive.current) return

      isInactive.current = false
      const inactiveDuration = Date.now() - lastActiveTime.current

      if (inactiveDuration >= INACTIVITY_THRESHOLD) {
        // Refresh all data after extended inactivity
        dispatch(fetchAccounts({ status: 'Active' }))
        dispatch(fetchTransactions({}))
        dispatch(fetchCategories({}))
        dispatch(fetchBudgets({}))
        dispatch(fetchTransfers({}))
        dispatch(fetchBorrowingLendingRecords({}))
        dispatch(fetchSettings())
        dispatch(fetchExchangeRates({}))
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        markInactive()
      } else {
        handleReturn()
      }
    }

    // Track both focus and visibility for maximum coverage
    window.addEventListener('blur', markInactive)
    window.addEventListener('focus', handleReturn)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('blur', markInactive)
      window.removeEventListener('focus', handleReturn)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [appInitialized, dispatch])
}
