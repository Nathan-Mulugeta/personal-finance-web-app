import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as budgetsApi from '../../lib/api/budgets'
import { mergeIncrementalData, getIdField } from '../../utils/dataMerge'
import { updateLastSync } from './syncSlice'

// Async thunks
export const fetchBudgets = createAsyncThunk(
  'budgets/fetchBudgets',
  async (filters, { rejectWithValue, getState, dispatch }) => {
    try {
      // Get last sync timestamp for incremental fetch
      const syncState = getState().sync;
      const lastSync = syncState.lastSyncBudgets;
      const isIncremental = !!lastSync && !filters.forceFull;
      
      // Add since parameter if we have a last sync timestamp
      const fetchFilters = isIncremental 
        ? { ...filters, since: lastSync }
        : filters;
      
      const data = await budgetsApi.getBudgets(fetchFilters);
      
      // Update sync timestamp after successful fetch
      if (data && data.length >= 0) {
        dispatch(updateLastSync({ entity: 'budgets', timestamp: new Date().toISOString() }));
      }
      
      return { data, isIncremental };
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
  backgroundLoading: false,
  error: null,
  isInitialized: false,
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
        if (!state.isInitialized) {
          state.loading = true
        } else {
          state.backgroundLoading = true
        }
        state.error = null
      })
      .addCase(fetchBudgets.fulfilled, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
        const { data: budgets, isIncremental } = action.payload || { data: [], isIncremental: false };
        
        if (isIncremental && state.budgets.length > 0) {
          // Merge incremental data with existing
          state.budgets = mergeIncrementalData(
            state.budgets,
            budgets,
            getIdField('budgets')
          );
        } else {
          // Full fetch - replace all data
          state.budgets = budgets || [];
        }
        
        state.isInitialized = true
      })
      .addCase(fetchBudgets.rejected, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
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

