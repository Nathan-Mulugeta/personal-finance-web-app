import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import accountsReducer from './slices/accountsSlice'
import categoriesReducer from './slices/categoriesSlice'
import transactionsReducer from './slices/transactionsSlice'
import budgetsReducer from './slices/budgetsSlice'
import transfersReducer from './slices/transfersSlice'
import borrowingsLendingsReducer from './slices/borrowingsLendingsSlice'
import settingsReducer from './slices/settingsSlice'

export default configureStore({
  reducer: {
    auth: authReducer,
    accounts: accountsReducer,
    categories: categoriesReducer,
    transactions: transactionsReducer,
    budgets: budgetsReducer,
    transfers: transfersReducer,
    borrowingsLendings: borrowingsLendingsReducer,
    settings: settingsReducer,
  },
})

