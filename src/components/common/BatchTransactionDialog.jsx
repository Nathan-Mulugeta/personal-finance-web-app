import { useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import {
  Dialog,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import BatchTransactionForm from './BatchTransactionForm';
import BatchTransactionSummary from './BatchTransactionSummary';
import BatchTransactionEdit from './BatchTransactionEdit';
import { createTransaction } from '../../store/slices/transactionsSlice';
import { generateId } from '../../lib/supabase';

/**
 * Batch Transaction Entry Dialog
 * Manages the flow of entering multiple transactions before submitting them all.
 * 
 * Modes:
 * - entry: Creating/entering a new transaction
 * - summary: Viewing summary of all queued transactions
 * - edit: Editing the list of queued transactions
 */
function BatchTransactionDialog({ open, onClose }) {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // State for managing batch entry flow
  const [mode, setMode] = useState('entry'); // 'entry' | 'summary' | 'edit'
  const [queuedTransactions, setQueuedTransactions] = useState([]);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Reset state when dialog opens
  const handleOpen = useCallback(() => {
    setMode('entry');
    setQueuedTransactions([]);
    setEditingTransaction(null);
    setIsSubmitting(false);
    setSubmitError(null);
  }, []);

  // Handle close and reset
  const handleClose = useCallback(() => {
    setMode('entry');
    setQueuedTransactions([]);
    setEditingTransaction(null);
    setIsSubmitting(false);
    setSubmitError(null);
    onClose();
  }, [onClose]);

  // Add transaction to queue (Next button)
  const handleNext = useCallback((transactionData) => {
    const newTransaction = {
      ...transactionData,
      tempId: generateId('batch'),
    };
    setQueuedTransactions((prev) => [...prev, newTransaction]);
    // Stay in entry mode for next transaction
  }, []);

  // Move to summary screen (Done button)
  const handleDone = useCallback((transactionData) => {
    // If there's data in the current form, add it first
    if (transactionData && transactionData.amount) {
      const newTransaction = {
        ...transactionData,
        tempId: generateId('batch'),
      };
      setQueuedTransactions((prev) => [...prev, newTransaction]);
    }
    setMode('summary');
  }, []);

  // Handle edit mode
  const handleEditMode = useCallback(() => {
    setMode('edit');
    setEditingTransaction(null);
  }, []);

  // Handle editing a specific transaction from the list
  const handleEditTransaction = useCallback((transaction) => {
    setEditingTransaction(transaction);
    setMode('entry');
  }, []);

  // Update an edited transaction
  const handleUpdateTransaction = useCallback((tempId, updatedData) => {
    setQueuedTransactions((prev) =>
      prev.map((txn) =>
        txn.tempId === tempId ? { ...updatedData, tempId } : txn
      )
    );
    setEditingTransaction(null);
    setMode('edit');
  }, []);

  // Remove a transaction from the queue
  const handleRemoveTransaction = useCallback((tempId) => {
    setQueuedTransactions((prev) => prev.filter((txn) => txn.tempId !== tempId));
  }, []);

  // Add a new transaction from edit mode
  const handleAddFromEdit = useCallback(() => {
    setEditingTransaction(null);
    setMode('entry');
  }, []);

  // Go back to summary from edit
  const handleBackToSummary = useCallback(() => {
    setMode('summary');
  }, []);

  // Submit all queued transactions
  const handleSubmit = useCallback(async () => {
    if (queuedTransactions.length === 0) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Submit all transactions
      for (const txn of queuedTransactions) {
        const { tempId, ...transactionData } = txn;
        await dispatch(createTransaction(transactionData)).unwrap();
      }

      // Close dialog on success
      handleClose();
    } catch (err) {
      console.error('Error submitting batch transactions:', err);
      setSubmitError(err?.message || 'Failed to submit transactions. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [queuedTransactions, dispatch, handleClose]);

  // Handle cancel from entry mode - go back to edit if there are queued transactions
  const handleCancelEntry = useCallback(() => {
    if (editingTransaction) {
      // If editing, go back to edit list without saving changes
      setEditingTransaction(null);
      setMode('edit');
    } else if (queuedTransactions.length > 0) {
      // If there are queued transactions, go to summary
      setMode('summary');
    } else {
      // Otherwise close the dialog
      handleClose();
    }
  }, [editingTransaction, queuedTransactions.length, handleClose]);

  // Render content based on mode
  const renderContent = () => {
    switch (mode) {
      case 'entry':
        return (
          <BatchTransactionForm
            onNext={handleNext}
            onDone={handleDone}
            onCancel={handleCancelEntry}
            editingTransaction={editingTransaction}
            onUpdate={handleUpdateTransaction}
            queuedCount={queuedTransactions.length}
          />
        );
      case 'summary':
        return (
          <BatchTransactionSummary
            transactions={queuedTransactions}
            onCancel={handleClose}
            onEdit={handleEditMode}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            error={submitError}
          />
        );
      case 'edit':
        return (
          <BatchTransactionEdit
            transactions={queuedTransactions}
            onEdit={handleEditTransaction}
            onRemove={handleRemoveTransaction}
            onAdd={handleAddFromEdit}
            onCancel={handleClose}
            onSubmit={handleSubmit}
            onBack={handleBackToSummary}
            isSubmitting={isSubmitting}
            error={submitError}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      onTransitionEnter={handleOpen}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: isMobile
          ? {
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              maxHeight: '100%',
            }
          : {},
      }}
    >
      {renderContent()}
    </Dialog>
  );
}

export default BatchTransactionDialog;

