import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as transactionsApi from '../../lib/api/transactions';

// Async thunks
export const fetchTransactions = createAsyncThunk(
  'transactions/fetchTransactions',
  async (filters, { rejectWithValue }) => {
    try {
      return await transactionsApi.getTransactions(filters);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchTransaction = createAsyncThunk(
  'transactions/fetchTransaction',
  async (transactionId, { rejectWithValue }) => {
    try {
      return await transactionsApi.getTransactionById(transactionId);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const createTransaction = createAsyncThunk(
  'transactions/createTransaction',
  async (transactionData, { rejectWithValue }) => {
    try {
      return await transactionsApi.createTransaction(transactionData);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const batchCreateTransactions = createAsyncThunk(
  'transactions/batchCreateTransactions',
  async (transactionsArray, { rejectWithValue }) => {
    try {
      return await transactionsApi.batchCreateTransactions(transactionsArray);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const updateTransaction = createAsyncThunk(
  'transactions/updateTransaction',
  async ({ transactionId, updates }, { rejectWithValue }) => {
    try {
      return await transactionsApi.updateTransaction(transactionId, updates);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const deleteTransaction = createAsyncThunk(
  'transactions/deleteTransaction',
  async (transactionId, { rejectWithValue }) => {
    try {
      await transactionsApi.deleteTransaction(transactionId);
      return transactionId;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  transactions: [],
  currentTransaction: null,
  loading: false,
  error: null,
};

const transactionsSlice = createSlice({
  name: 'transactions',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearCurrentTransaction: (state) => {
      state.currentTransaction = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch transactions
      .addCase(fetchTransactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.transactions = action.payload;
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Fetch transaction
      .addCase(fetchTransaction.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTransaction.fulfilled, (state, action) => {
        state.loading = false;
        state.currentTransaction = action.payload;
      })
      .addCase(fetchTransaction.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Create transaction
      .addCase(createTransaction.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createTransaction.fulfilled, (state, action) => {
        state.loading = false;
        state.transactions.unshift(action.payload);
      })
      .addCase(createTransaction.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Batch create transactions
      .addCase(batchCreateTransactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(batchCreateTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.transactions = [...action.payload, ...state.transactions];
      })
      .addCase(batchCreateTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Update transaction
      .addCase(updateTransaction.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateTransaction.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.transactions.findIndex(
          (txn) => txn.transaction_id === action.payload.transaction_id
        );
        if (index !== -1) {
          state.transactions[index] = action.payload;
        }
        if (
          state.currentTransaction?.transaction_id ===
          action.payload.transaction_id
        ) {
          state.currentTransaction = action.payload;
        }
      })
      .addCase(updateTransaction.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Delete transaction
      .addCase(deleteTransaction.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteTransaction.fulfilled, (state, action) => {
        state.loading = false;
        state.transactions = state.transactions.filter(
          (txn) => txn.transaction_id !== action.payload
        );
        if (state.currentTransaction?.transaction_id === action.payload) {
          state.currentTransaction = null;
        }
      })
      .addCase(deleteTransaction.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearError, clearCurrentTransaction } =
  transactionsSlice.actions;
export default transactionsSlice.reducer;
