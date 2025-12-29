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

// Tiered refresh thresholds
// Core data (transactions, accounts) is always refreshed on return from background
// since WebSocket events are lost when the app is backgrounded on mobile
const FULL_REFRESH_THRESHOLD = 30000 // 30 seconds for all other data types

/**
 * Hook to handle data refresh on returning from inactivity.
 * 
 * Uses a tiered refresh strategy:
 * - Core data (transactions, accounts): Always refreshed on any background return,
 *   since these are most likely to have external changes and WebSocket events
 *   are lost when the mobile PWA is backgrounded.
 * - Other data (categories, budgets, etc.): Refreshed after 30+ seconds of inactivity.
 * 
 * Uses incremental sync (default behavior) to minimize API load - only fetches
 * records modified since the last sync via the 'since' parameter.
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

      // Always refresh core data (transactions, accounts) on any return from background
      // Uses incremental sync by default to minimize data transfer
      dispatch(fetchTransactions({}))
      dispatch(fetchAccounts({ status: 'Active' }))

      // Refresh all other data after extended inactivity
      if (inactiveDuration >= FULL_REFRESH_THRESHOLD) {
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
