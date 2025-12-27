import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { fetchAccounts } from '../store/slices/accountsSlice'
import { fetchTransactions } from '../store/slices/transactionsSlice'
import { fetchCategories } from '../store/slices/categoriesSlice'
import { fetchBudgets } from '../store/slices/budgetsSlice'
import { fetchTransfers } from '../store/slices/transfersSlice'
import { fetchBorrowingLendingRecords } from '../store/slices/borrowingsLendingsSlice'
import { fetchSettings } from '../store/slices/settingsSlice'
import { fetchExchangeRates } from '../store/slices/exchangeRatesSlice'

/**
 * Hook that refreshes page-specific data when navigating to a route.
 * Each page should call this hook to ensure fresh data on navigation.
 * 
 * @param {Object} config - Configuration object
 * @param {string[]} config.dataTypes - Array of data types to refresh for this page
 * @param {Object} config.filters - Optional filters to pass to fetch functions
 */
export function usePageRefresh(config = {}) {
  const dispatch = useDispatch()
  const location = useLocation()
  const appInitialized = useSelector((state) => state.appInit.isInitialized)
  const prevLocationRef = useRef(location.pathname)
  const lastRefreshRef = useRef({})

  const {
    dataTypes = [],
    filters = {},
  } = config

  useEffect(() => {
    // Only refresh if app is initialized
    if (!appInitialized) return

    // Only refresh if route actually changed
    if (prevLocationRef.current === location.pathname) return

    // Update previous location
    prevLocationRef.current = location.pathname

    // Debounce: Don't refresh if we just refreshed this data type recently (within 1 second)
    const now = Date.now()
    const shouldRefresh = dataTypes.some(type => {
      const lastRefresh = lastRefreshRef.current[type] || 0
      return (now - lastRefresh) > 1000 // 1 second debounce
    })

    if (!shouldRefresh && dataTypes.length > 0) return

    // Refresh data based on dataTypes
    dataTypes.forEach(type => {
      lastRefreshRef.current[type] = now
      
      switch (type) {
        case 'accounts':
          dispatch(fetchAccounts({ status: 'Active', ...filters.accounts }))
          break
        case 'transactions':
          dispatch(fetchTransactions({ ...filters.transactions }))
          break
        case 'categories':
          dispatch(fetchCategories({ ...filters.categories }))
          break
        case 'budgets':
          dispatch(fetchBudgets({ ...filters.budgets }))
          break
        case 'transfers':
          dispatch(fetchTransfers({ ...filters.transfers }))
          break
        case 'borrowingsLendings':
          dispatch(fetchBorrowingLendingRecords({ ...filters.borrowingsLendings }))
          break
        case 'settings':
          dispatch(fetchSettings())
          break
        case 'exchangeRates':
          dispatch(fetchExchangeRates({ ...filters.exchangeRates }))
          break
        default:
          console.warn(`Unknown data type for refresh: ${type}`)
      }
    })
  }, [location.pathname, appInitialized, dispatch, dataTypes, filters])
}

