import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as categoriesApi from '../../lib/api/categories'
import { mergeIncrementalData, getIdField } from '../../utils/dataMerge'
import { updateLastSync } from './syncSlice'
import { deduplicatedRequest } from '../../lib/api/requestDeduplication'

// Async thunks
export const fetchCategories = createAsyncThunk(
  'categories/fetchCategories',
  async (filters, { rejectWithValue, getState, dispatch }) => {
    try {
      // Get last sync timestamp for incremental fetch
      const syncState = getState().sync;
      const lastSync = syncState.lastSyncCategories;
      const isIncremental = !!lastSync && !filters.forceFull;
      
      // Add since parameter if we have a last sync timestamp
      const fetchFilters = isIncremental 
        ? { ...filters, since: lastSync }
        : filters;
      
      // Use deduplication to prevent duplicate concurrent requests
      const data = await deduplicatedRequest(
        'categories/getCategories',
        fetchFilters,
        () => categoriesApi.getCategories(fetchFilters)
      );
      
      // Update sync timestamp after successful fetch
      if (data && data.length >= 0) {
        dispatch(updateLastSync({ entity: 'categories', timestamp: new Date().toISOString() }));
      }
      
      return { data, isIncremental };
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const fetchCategoryTree = createAsyncThunk(
  'categories/fetchCategoryTree',
  async (filters, { rejectWithValue }) => {
    try {
      return await categoriesApi.buildCategoryTree(filters)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const fetchCategory = createAsyncThunk(
  'categories/fetchCategory',
  async (categoryId, { rejectWithValue }) => {
    try {
      return await categoriesApi.getCategoryById(categoryId)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const createCategory = createAsyncThunk(
  'categories/createCategory',
  async (categoryData, { rejectWithValue }) => {
    try {
      return await categoriesApi.createCategory(categoryData)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const updateCategory = createAsyncThunk(
  'categories/updateCategory',
  async ({ categoryId, updates }, { rejectWithValue }) => {
    try {
      return await categoriesApi.updateCategory(categoryId, updates)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const deleteCategory = createAsyncThunk(
  'categories/deleteCategory',
  async (categoryId, { rejectWithValue }) => {
    try {
      await categoriesApi.deleteCategory(categoryId)
      return categoryId
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

const initialState = {
  categories: [],
  categoryTree: [],
  currentCategory: null,
  loading: false,
  backgroundLoading: false,
  error: null,
  isInitialized: false,
}

const categoriesSlice = createSlice({
  name: 'categories',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    clearCurrentCategory: (state) => {
      state.currentCategory = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch categories
      .addCase(fetchCategories.pending, (state) => {
        if (!state.isInitialized) {
          state.loading = true
        } else {
          state.backgroundLoading = true
        }
        state.error = null
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
        const { data: categories, isIncremental } = action.payload || { data: [], isIncremental: false };
        
        if (isIncremental && state.categories.length > 0) {
          // Merge incremental data with existing
          state.categories = mergeIncrementalData(
            state.categories,
            categories,
            getIdField('categories')
          );
        } else {
          // Full fetch - replace all data
          state.categories = categories || [];
        }
        
        state.isInitialized = true
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
        state.error = action.payload
      })
      // Fetch category tree
      .addCase(fetchCategoryTree.pending, (state) => {
        if (!state.isInitialized) {
          state.loading = true
        } else {
          state.backgroundLoading = true
        }
        state.error = null
      })
      .addCase(fetchCategoryTree.fulfilled, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
        state.categoryTree = action.payload
      })
      .addCase(fetchCategoryTree.rejected, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
        state.error = action.payload
      })
      // Fetch category
      .addCase(fetchCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCategory.fulfilled, (state, action) => {
        state.loading = false
        state.currentCategory = action.payload
      })
      .addCase(fetchCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Create category
      .addCase(createCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createCategory.fulfilled, (state, action) => {
        state.loading = false
        state.categories.push(action.payload)
        // Tree will be rebuilt by the refresh call
      })
      .addCase(createCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Update category
      .addCase(updateCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateCategory.fulfilled, (state, action) => {
        state.loading = false
        const index = state.categories.findIndex(cat => cat.category_id === action.payload.category_id)
        if (index !== -1) {
          state.categories[index] = action.payload
        }
        if (state.currentCategory?.category_id === action.payload.category_id) {
          state.currentCategory = action.payload
        }
        // Tree will be rebuilt by the refresh call
      })
      .addCase(updateCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Delete category
      .addCase(deleteCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteCategory.fulfilled, (state, action) => {
        state.loading = false
        state.categories = state.categories.filter(cat => cat.category_id !== action.payload)
        if (state.currentCategory?.category_id === action.payload) {
          state.currentCategory = null
        }
        // Tree will be rebuilt by the refresh call
      })
      .addCase(deleteCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  },
})

export const { clearError, clearCurrentCategory } = categoriesSlice.actions
export default categoriesSlice.reducer

