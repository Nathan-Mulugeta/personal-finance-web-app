import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as budgetsApi from '../../lib/api/budgets'

// Async thunks
export const fetchBudgets = createAsyncThunk(
  'budgets/fetchBudgets',
  async (filters, { rejectWithValue }) => {
    try {
      return await budgetsApi.getBudgets(filters)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const fetchBudget = createAsyncThunk(
  'budgets/fetchBudget',
  async (budgetId, { rejectWithValue }) => {
    try {
      return await budgetsApi.getBudgetById(budgetId)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const createBudget = createAsyncThunk(
  'budgets/createBudget',
  async (budgetData, { rejectWithValue }) => {
    try {
      return await budgetsApi.createBudget(budgetData)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const updateBudget = createAsyncThunk(
  'budgets/updateBudget',
  async ({ budgetId, updates }, { rejectWithValue }) => {
    try {
      return await budgetsApi.updateBudget(budgetId, updates)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const deleteBudget = createAsyncThunk(
  'budgets/deleteBudget',
  async (budgetId, { rejectWithValue }) => {
    try {
      await budgetsApi.deleteBudget(budgetId)
      return budgetId
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const fetchEffectiveBudget = createAsyncThunk(
  'budgets/fetchEffectiveBudget',
  async ({ categoryId, month }, { rejectWithValue }) => {
    try {
      return await budgetsApi.getEffectiveBudget(categoryId, month)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

const initialState = {
  budgets: [],
  currentBudget: null,
  effectiveBudgets: {},
  loading: false,
  error: null,
}

const budgetsSlice = createSlice({
  name: 'budgets',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    clearCurrentBudget: (state) => {
      state.currentBudget = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch budgets
      .addCase(fetchBudgets.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchBudgets.fulfilled, (state, action) => {
        state.loading = false
        state.budgets = action.payload
      })
      .addCase(fetchBudgets.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Fetch budget
      .addCase(fetchBudget.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchBudget.fulfilled, (state, action) => {
        state.loading = false
        state.currentBudget = action.payload
      })
      .addCase(fetchBudget.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Create budget
      .addCase(createBudget.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createBudget.fulfilled, (state, action) => {
        state.loading = false
        state.budgets.push(action.payload)
      })
      .addCase(createBudget.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Update budget
      .addCase(updateBudget.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateBudget.fulfilled, (state, action) => {
        state.loading = false
        const index = state.budgets.findIndex(bdg => bdg.budget_id === action.payload.budget_id)
        if (index !== -1) {
          state.budgets[index] = action.payload
        }
        if (state.currentBudget?.budget_id === action.payload.budget_id) {
          state.currentBudget = action.payload
        }
      })
      .addCase(updateBudget.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Delete budget
      .addCase(deleteBudget.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteBudget.fulfilled, (state, action) => {
        state.loading = false
        state.budgets = state.budgets.filter(bdg => bdg.budget_id !== action.payload)
        if (state.currentBudget?.budget_id === action.payload) {
          state.currentBudget = null
        }
      })
      .addCase(deleteBudget.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Fetch effective budget
      .addCase(fetchEffectiveBudget.fulfilled, (state, action) => {
        const { categoryId, month } = action.meta.arg
        const key = `${categoryId}_${month}`
        state.effectiveBudgets[key] = action.payload
      })
  },
})

export const { clearError, clearCurrentBudget } = budgetsSlice.actions
export default budgetsSlice.reducer

