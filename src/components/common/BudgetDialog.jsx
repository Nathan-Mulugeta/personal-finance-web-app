import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { format, parseISO, startOfMonth, subMonths } from 'date-fns';
import {
  createBudget,
  updateBudget,
  deleteBudget,
  clearError,
} from '../../store/slices/budgetsSlice';
import { budgetSchema } from '../../schemas/budgetSchema';
import { BUDGET_STATUSES } from '../../lib/api/budgets';
import CategoryAutocomplete from './CategoryAutocomplete';
import { selectCategoryNameGetter } from '../../store/selectors';

// Month string helpers ('YYYY-MM-DD' or 'YYYY-MM' -> 'YYYY-MM')
const toMonthInput = (value) =>
  value ? `${value.split('-')[0]}-${value.split('-')[1]}` : '';

const getPreviousMonth = (monthStr) =>
  format(subMonths(parseISO(`${monthStr}-01`), 1), 'yyyy-MM');

/**
 * Shared create/edit budget dialog (used by the Budgets and Reports pages).
 *
 * @param {boolean} open
 * @param {Function} onClose
 * @param {Object|null} editingBudget - budget record to edit, or null to create
 * @param {string} referenceMonth - 'YYYY-MM' month the user is viewing; used
 *   as the default month and as the split point when editing a recurring
 *   budget from partway through its range
 * @param {string} [defaultCategoryId] - preselect a category when creating
 */
function BudgetDialog({
  open,
  onClose,
  editingBudget = null,
  referenceMonth,
  defaultCategoryId = '',
}) {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { categories } = useSelector((state) => state.categories);
  const { settings } = useSelector((state) => state.settings);
  const getCategoryName = useSelector(selectCategoryNameGetter);

  const [actionError, setActionError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const baseCurrency =
    settings.find((s) => s.setting_key === 'BaseCurrency')?.setting_value ||
    'USD';

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      categoryId: '',
      currency: 'USD',
      amount: '',
      month: format(new Date(), 'yyyy-MM'),
      recurring: false,
      startMonth: format(new Date(), 'yyyy-MM'),
      endMonth: '',
      notes: '',
      status: 'Active',
    },
  });

  const watchedRecurring = watch('recurring');
  const watchedStatus = watch('status');
  const watchedCategoryId = watch('categoryId');

  // Populate the form each time the dialog opens
  useEffect(() => {
    if (!open) return;

    if (editingBudget) {
      reset({
        categoryId: editingBudget.category_id,
        currency: editingBudget.currency,
        amount: editingBudget.amount,
        month: editingBudget.month
          ? toMonthInput(editingBudget.month)
          : format(new Date(), 'yyyy-MM'),
        recurring: editingBudget.recurring,
        startMonth: editingBudget.start_month
          ? toMonthInput(editingBudget.start_month)
          : format(new Date(), 'yyyy-MM'),
        endMonth: toMonthInput(editingBudget.end_month),
        notes: editingBudget.notes || '',
        status: editingBudget.status,
      });
    } else {
      reset({
        categoryId: defaultCategoryId || '',
        currency: baseCurrency,
        amount: '',
        month: referenceMonth,
        recurring: false,
        startMonth: referenceMonth,
        endMonth: '',
        notes: '',
        status: 'Active',
      });
    }
    setActionError(null);
    setDeleteConfirm(null);
    setDeleteError(null);
    setIsSubmitting(false);
    setIsDeleting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingBudget, defaultCategoryId, referenceMonth]);

  // Auto-set currency from base currency when creating a new budget
  useEffect(() => {
    if (watchedCategoryId && !editingBudget) {
      setValue('currency', baseCurrency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCategoryId, editingBudget]);

  const handleClose = () => {
    setActionError(null);
    setDeleteConfirm(null);
    setDeleteError(null);
    setIsSubmitting(false);
    setIsDeleting(false);
    reset();
    dispatch(clearError());
    onClose();
  };

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      // Clean up data: convert empty strings to null for optional fields
      const cleanedData = {
        ...data,
        endMonth:
          data.endMonth && data.endMonth.trim() !== '' ? data.endMonth : null,
        month: data.month && data.month.trim() !== '' ? data.month : null,
        startMonth:
          data.startMonth && data.startMonth.trim() !== ''
            ? data.startMonth
            : null,
        notes: data.notes && data.notes.trim() !== '' ? data.notes : '',
      };

      const budgetData = {
        categoryId: cleanedData.categoryId,
        currency: cleanedData.currency.toUpperCase(),
        amount: parseFloat(cleanedData.amount),
        recurring: cleanedData.recurring,
        notes: cleanedData.notes,
        status: cleanedData.status,
      };

      if (cleanedData.recurring) {
        budgetData.startMonth = cleanedData.startMonth;
        budgetData.endMonth = cleanedData.endMonth || null; // Allow null for non-ending budgets
      } else {
        // For one-time budgets, ensure month is set
        if (!cleanedData.month) {
          setActionError('Month is required for one-time budgets');
          setIsSubmitting(false);
          return;
        }
        budgetData.month = cleanedData.month;
      }

      if (editingBudget) {
        // Check if we need to split a recurring budget for a future month
        if (
          editingBudget.recurring &&
          cleanedData.recurring &&
          editingBudget.start_month &&
          cleanedData.startMonth
        ) {
          // Parse dates for comparison
          const budgetStartDate = parseISO(
            `${toMonthInput(editingBudget.start_month)}-01`
          );
          const selectedDate = parseISO(`${referenceMonth}-01`);

          // Check if referenceMonth (the month the user is viewing) is after
          // the budget's start_month
          if (selectedDate > startOfMonth(budgetStartDate)) {
            // Split the budget: end the old one before referenceMonth and
            // create a new one from referenceMonth
            const endMonthForOldBudget = getPreviousMonth(referenceMonth);

            // Update the old budget to end at the month before referenceMonth
            // Keep original amount and other original fields, only update end_month
            await dispatch(
              updateBudget({
                budgetId: editingBudget.budget_id,
                updates: {
                  categoryId: editingBudget.category_id,
                  currency: editingBudget.currency,
                  amount: parseFloat(editingBudget.amount), // Keep original amount
                  recurring: true,
                  notes: editingBudget.notes || '', // Keep original notes
                  status: editingBudget.status, // Keep original status
                  startMonth: toMonthInput(editingBudget.start_month) || null,
                  endMonth: endMonthForOldBudget,
                },
              })
            ).unwrap();

            // Create a new recurring budget starting from referenceMonth with
            // the new amount and updated fields
            const originalEndMonth = editingBudget.end_month
              ? parseISO(`${toMonthInput(editingBudget.end_month)}-01`)
              : null;
            const newEndMonth =
              originalEndMonth && originalEndMonth >= selectedDate
                ? toMonthInput(editingBudget.end_month)
                : cleanedData.endMonth;

            await dispatch(
              createBudget({
                ...budgetData,
                startMonth: referenceMonth,
                endMonth: newEndMonth,
              })
            ).unwrap();
          } else if (selectedDate < startOfMonth(budgetStartDate)) {
            // Selected month is before start_month: update start_month to referenceMonth
            await dispatch(
              updateBudget({
                budgetId: editingBudget.budget_id,
                updates: {
                  ...budgetData,
                  startMonth: referenceMonth,
                },
              })
            ).unwrap();
          } else {
            // Selected month equals start_month: just update the amount and other fields
            await dispatch(
              updateBudget({
                budgetId: editingBudget.budget_id,
                updates: budgetData,
              })
            ).unwrap();
          }
        } else {
          // Not a recurring budget or not splitting: use normal update
          await dispatch(
            updateBudget({
              budgetId: editingBudget.budget_id,
              updates: budgetData,
            })
          ).unwrap();
        }
      } else {
        await dispatch(createBudget(budgetData)).unwrap();
      }
      handleClose();
    } catch (err) {
      console.error('Error saving budget:', err);
      const errorMessage =
        err?.message || 'Failed to save budget. Please try again.';
      setActionError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingBudget) return;

    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await dispatch(deleteBudget(editingBudget.budget_id)).unwrap();
      setDeleteConfirm(null);
      setDeleteError(null);
      handleClose();
    } catch (err) {
      console.error('Error deleting budget:', err);
      const errorMessage =
        err?.message || 'Failed to delete budget. Please try again.';
      setDeleteError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogTitle>
            {editingBudget ? 'Edit Budget' : 'Create New Budget'}
          </DialogTitle>
          <DialogContent>
            {actionError && (
              <Alert
                severity="error"
                sx={{ mb: 2 }}
                onClose={() => setActionError(null)}
              >
                {actionError}
              </Alert>
            )}
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <CategoryAutocomplete
                  categories={categories}
                  value={watchedCategoryId || ''}
                  onChange={(id) => setValue('categoryId', id)}
                  label="Category *"
                  error={!!errors.categoryId}
                  helperText={errors.categoryId?.message}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Currency (ISO Code) *"
                  {...register('currency')}
                  error={!!errors.currency}
                  helperText={errors.currency?.message || 'e.g., USD, EUR, ETB'}
                  inputProps={{
                    maxLength: 3,
                    style: { textTransform: 'uppercase' },
                  }}
                  onChange={(e) => {
                    setValue('currency', e.target.value.toUpperCase());
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Amount *"
                  {...register('amount', { valueAsNumber: true })}
                  error={!!errors.amount}
                  helperText={errors.amount?.message}
                  inputProps={{ step: '0.01', min: '0.01' }}
                />
              </Grid>
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Switch
                    {...register('recurring')}
                    checked={watchedRecurring}
                    onChange={(e) => setValue('recurring', e.target.checked)}
                  />
                  <Typography>Recurring Budget</Typography>
                </Box>
              </Grid>
              {watchedRecurring ? (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      type="month"
                      label="Start Month *"
                      {...register('startMonth', {
                        required:
                          'Start month is required for recurring budgets',
                      })}
                      error={!!errors.startMonth}
                      helperText={errors.startMonth?.message}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      type="month"
                      label="End Month (Optional)"
                      {...register('endMonth')}
                      error={!!errors.endMonth}
                      helperText={
                        errors.endMonth?.message ||
                        'Leave empty for non-ending budget'
                      }
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                </>
              ) : (
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    type="month"
                    label="Month *"
                    {...register('month', {
                      required: 'Month is required for one-time budgets',
                    })}
                    error={!!errors.month}
                    helperText={errors.month?.message}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              )}
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!errors.status}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    {...register('status')}
                    label="Status"
                    value={watchedStatus || ''}
                    onChange={(e) => setValue('status', e.target.value)}
                  >
                    {BUDGET_STATUSES.map((status) => (
                      <MenuItem key={status} value={status}>
                        {status}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.status && (
                    <FormHelperText>{errors.status.message}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Notes (Optional)"
                  {...register('notes')}
                  error={!!errors.notes}
                  helperText={errors.notes?.message}
                  multiline
                  rows={2}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
              }}
            >
              <Box>
                {editingBudget && (
                  <Button
                    onClick={() => handleDelete()}
                    color="error"
                    disabled={isSubmitting || isDeleting}
                    startIcon={
                      isDeleting ? (
                        <CircularProgress size={20} color="inherit" />
                      ) : (
                        <DeleteIcon />
                      )
                    }
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </Button>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  onClick={handleClose}
                  disabled={isSubmitting || isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={isSubmitting || isDeleting}
                  startIcon={
                    isSubmitting ? (
                      <CircularProgress size={20} color="inherit" />
                    ) : null
                  }
                >
                  {isSubmitting
                    ? editingBudget
                      ? 'Updating...'
                      : 'Creating...'
                    : editingBudget
                    ? 'Update'
                    : 'Create'}
                </Button>
              </Box>
            </Box>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirm && !!editingBudget}
        onClose={() => {
          setDeleteConfirm(null);
          setDeleteError(null);
        }}
        fullScreen={isMobile}
      >
        <DialogTitle>Delete Budget</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the budget for{' '}
            <strong>
              {editingBudget && getCategoryName(editingBudget.category_id)}
            </strong>
            ?
          </Typography>
          {deleteError && (
            <Alert
              severity="error"
              sx={{ mt: 2 }}
              onClose={() => setDeleteError(null)}
            >
              {deleteError}
            </Alert>
          )}
          <Alert severity="warning" sx={{ mt: 2 }}>
            This action cannot be undone.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteConfirm(null);
              setDeleteError(null);
            }}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
            startIcon={
              isDeleting ? <CircularProgress size={20} color="inherit" /> : null
            }
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default BudgetDialog;
