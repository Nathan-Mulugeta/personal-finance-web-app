import { showNotification } from './slices/notificationsSlice'

const countOf = (value) => {
  if (Array.isArray(value)) return value.length
  if (Array.isArray(value?.transactions)) return value.transactions.length
  return null
}

const plural = (count, noun) =>
  count === 1 ? `1 ${noun}` : `${count} ${noun}s`

// Maps fulfilled thunk action types to snackbar messages. Values are either
// a string or a function of the action returning a string (or null to skip).
const SUCCESS_MESSAGES = {
  'transactions/createTransaction/fulfilled': 'Transaction added',
  'transactions/updateTransaction/fulfilled': 'Transaction updated',
  'transactions/deleteTransaction/fulfilled': 'Transaction deleted',
  'transactions/batchCreateTransactions/fulfilled': (action) => {
    const count = countOf(action.payload)
    return count ? `${plural(count, 'transaction')} added` : 'Transactions added'
  },
  'transactions/bulkDeleteTransactions/fulfilled': (action) => {
    const count = action.payload?.deletedTransactionIds?.length
    return count
      ? `${plural(count, 'transaction')} deleted`
      : 'Transactions deleted'
  },
  'transactions/bulkUpdateTransactions/fulfilled': (action) => {
    const count = action.payload?.updated?.length
    return count
      ? `${plural(count, 'transaction')} updated`
      : 'Transactions updated'
  },
  'transfers/createTransfer/fulfilled': 'Transfer created',
  'transfers/deleteTransfer/fulfilled': 'Transfer deleted',
  'accounts/createAccount/fulfilled': 'Account created',
  'accounts/updateAccount/fulfilled': 'Account updated',
  'accounts/deleteAccount/fulfilled': 'Account deleted',
  'categories/createCategory/fulfilled': 'Category created',
  'categories/updateCategory/fulfilled': 'Category updated',
  'categories/deleteCategory/fulfilled': 'Category deleted',
  'budgets/createBudget/fulfilled': 'Budget created',
  'budgets/updateBudget/fulfilled': 'Budget updated',
  'budgets/deleteBudget/fulfilled': 'Budget deleted',
  'borrowingsLendings/createBorrowingLendingRecord/fulfilled': 'Record created',
  'borrowingsLendings/updateBorrowingLendingRecord/fulfilled': 'Record updated',
  'borrowingsLendings/deleteBorrowingLendingRecord/fulfilled': 'Record deleted',
  'borrowingsLendings/recordPayment/fulfilled': 'Payment recorded',
  'borrowingsLendings/markAsFullyPaid/fulfilled': 'Marked as fully paid',
  'settings/updateSetting/fulfilled': 'Saved',
  'settings/updateSettings/fulfilled': 'Settings saved',
}

// Shows a success snackbar whenever a mutating thunk fulfills, so individual
// dialogs and pages don't each need to dispatch feedback.
export const notificationsMiddleware = (storeApi) => (next) => (action) => {
  const result = next(action)
  const entry = SUCCESS_MESSAGES[action.type]
  if (entry) {
    const message = typeof entry === 'function' ? entry(action) : entry
    if (message) {
      storeApi.dispatch(showNotification({ message }))
    }
  }
  return result
}
