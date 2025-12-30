import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { supabase } from '../lib/supabase'
import { updateAccountInStore, removeAccountFromStore, fetchAccounts } from '../store/slices/accountsSlice'
import { fetchTransactions, selectLastLocalMutation } from '../store/slices/transactionsSlice'
import { fetchCategories } from '../store/slices/categoriesSlice'
import { fetchBudgets } from '../store/slices/budgetsSlice'
import { fetchTransfers } from '../store/slices/transfersSlice'
import { fetchBorrowingLendingRecords } from '../store/slices/borrowingsLendingsSlice'
import { fetchSettings } from '../store/slices/settingsSlice'
import { fetchExchangeRates } from '../store/slices/exchangeRatesSlice'

// Time window (ms) after a local mutation during which realtime fetches are skipped
// This prevents race conditions where the realtime sync overwrites locally-added transactions
const LOCAL_MUTATION_WINDOW_MS = 2000

/**
 * Hook to manage Supabase Realtime subscriptions for all tables.
 * Provides instant updates when data changes in the database.
 * 
 * This hook should be used once at the app level (in ProtectedRoute)
 * to avoid multiple subscriptions.
 */
export function useRealtimeSync() {
  const dispatch = useDispatch()
  const user = useSelector((state) => state.auth.user)
  const appInitialized = useSelector((state) => state.appInit.isInitialized)
  const lastLocalMutation = useSelector(selectLastLocalMutation)
  const channelRef = useRef(null)
  const debounceTimers = useRef({})
  // Keep a ref to lastLocalMutation so the debounce callback can access the latest value
  const lastLocalMutationRef = useRef(lastLocalMutation)

  // Keep the ref updated with the latest lastLocalMutation value
  useEffect(() => {
    lastLocalMutationRef.current = lastLocalMutation
  }, [lastLocalMutation])

  useEffect(() => {
    // Only subscribe if user is authenticated and app is initialized
    if (!user?.id || !appInitialized) {
      return
    }

    // Check if we're within the local mutation window for transactions
    const isWithinMutationWindow = () => {
      const lastMutation = lastLocalMutationRef.current
      if (!lastMutation) return false
      return Date.now() - lastMutation < LOCAL_MUTATION_WINDOW_MS
    }

    // Debounced refresh to avoid excessive updates
    const debouncedRefresh = (entity, delay = 500) => {
      if (debounceTimers.current[entity]) {
        clearTimeout(debounceTimers.current[entity])
      }
      debounceTimers.current[entity] = setTimeout(() => {
        switch (entity) {
          case 'accounts':
            dispatch(fetchAccounts({ status: 'Active', forceFull: true }))
            break
          case 'transactions':
            // Skip fetch if a local mutation happened recently
            // This prevents overwriting locally-added transactions
            if (isWithinMutationWindow()) {
              // Schedule another check after the window expires
              debouncedRefresh('transactions', LOCAL_MUTATION_WINDOW_MS)
              return
            }
            dispatch(fetchTransactions({ forceFull: true }))
            break
          case 'categories':
            dispatch(fetchCategories({ forceFull: true }))
            break
          case 'budgets':
            dispatch(fetchBudgets({ forceFull: true }))
            break
          case 'transfers':
            dispatch(fetchTransfers({ forceFull: true }))
            break
          case 'borrowings_lendings':
            dispatch(fetchBorrowingLendingRecords({ forceFull: true }))
            break
          case 'settings':
            dispatch(fetchSettings())
            break
          case 'exchange_rates':
            dispatch(fetchExchangeRates({ forceFull: true }))
            break
        }
      }, delay)
    }

    // Handle account changes - update store directly for speed
    const handleAccountChange = (payload) => {
      if (payload.new?.user_id !== user.id && payload.old?.user_id !== user.id) {
        return // Ignore changes for other users
      }

      switch (payload.eventType) {
        case 'INSERT':
        case 'UPDATE':
          // Update the account directly in store
          dispatch(updateAccountInStore(payload.new))
          break
        case 'DELETE':
          dispatch(removeAccountFromStore(payload.old.account_id))
          break
      }
    }

    // Handle transaction changes - triggers balance recalculation via DB trigger
    const handleTransactionChange = (payload) => {
      if (payload.new?.user_id !== user.id && payload.old?.user_id !== user.id) {
        return
      }
      // Debounced refresh since balance is updated by trigger
      // Also refresh accounts to get updated current_balance
      debouncedRefresh('transactions', 300)
      debouncedRefresh('accounts', 500)
    }

    // Generic handler for other tables
    const createGenericHandler = (entity) => (payload) => {
      if (payload.new?.user_id !== user.id && payload.old?.user_id !== user.id) {
        return
      }
      debouncedRefresh(entity, 500)
    }

    // Create a single channel for all subscriptions
    const channel = supabase
      .channel(`realtime-sync-${user.id}`)
      // Accounts - direct store updates for instant feedback
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts', filter: `user_id=eq.${user.id}` },
        handleAccountChange
      )
      // Transactions - refreshes both transactions and accounts (for balance)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${user.id}` },
        handleTransactionChange
      )
      // Categories
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories', filter: `user_id=eq.${user.id}` },
        createGenericHandler('categories')
      )
      // Budgets
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'budgets', filter: `user_id=eq.${user.id}` },
        createGenericHandler('budgets')
      )
      // Borrowings/Lendings
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'borrowings_lendings', filter: `user_id=eq.${user.id}` },
        createGenericHandler('borrowings_lendings')
      )
      // Settings
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings', filter: `user_id=eq.${user.id}` },
        createGenericHandler('settings')
      )
      // Exchange Rates
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exchange_rates', filter: `user_id=eq.${user.id}` },
        createGenericHandler('exchange_rates')
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime sync connected')
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('Realtime sync error, will retry...')
        }
      })

    channelRef.current = channel

    // Cleanup on unmount
    return () => {
      // Clear all debounce timers
      Object.values(debounceTimers.current).forEach(clearTimeout)
      debounceTimers.current = {}

      // Unsubscribe from channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user?.id, appInitialized, dispatch])

  // Return nothing - this hook just sets up subscriptions
  return null
}

export default useRealtimeSync

