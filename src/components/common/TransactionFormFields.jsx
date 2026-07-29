import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  FormControl,
  FormHelperText,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CategoryAutocomplete from './CategoryAutocomplete';
import AccountAutocomplete from './AccountAutocomplete';
import BudgetInlineCue from './BudgetInlineCue';
import { flattenCategoryTree } from '../../utils/categoryHierarchy';
import { currencyLabel } from '../../utils/currencyConversion';
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from '../../lib/api/transactions';

/**
 * The shared field set for the Add/Edit transaction forms — one source of truth
 * for the layout, chips, currency prefix, budget cue, and the "More options"
 * (Date + Status) collapse, so the two dialogs can't drift. The parent owns the
 * react-hook-form instance, the refs, and the submit; this just renders + wires
 * the fields.
 *
 * @param {Function} register - RHF register
 * @param {Function} setValue - RHF setValue
 * @param {Function} watch - RHF watch
 * @param {Object} errors - RHF formState.errors
 * @param {Array} accounts
 * @param {Array} categories
 * @param {React.Ref} amountInputRef
 * @param {React.Ref} categoryInputRef
 * @param {string} [excludeTransactionId] - the row being edited (budget cue math)
 * @param {boolean} [autoFocusAccount]
 * @param {boolean} [autoFocusCategory]
 */
export default function TransactionFormFields({
  register,
  setValue,
  watch,
  errors,
  accounts,
  categories,
  amountInputRef,
  categoryInputRef,
  excludeTransactionId,
  autoFocusAccount = false,
  autoFocusCategory = false,
}) {
  const [showMore, setShowMore] = useState(false);

  const watchedAccountId = watch('accountId');
  const watchedCategoryId = watch('categoryId');
  const watchedType = watch('type');
  const watchedStatus = watch('status');

  // Filter categories by type and flatten with hierarchy
  const getFilteredCategories = () => {
    if (!watchedType) return flattenCategoryTree(categories);
    let filtered;
    if (watchedType === 'Income') {
      filtered = categories.filter((cat) => cat.type === 'Income');
    } else if (watchedType === 'Expense') {
      filtered = categories.filter((cat) => cat.type === 'Expense');
    } else {
      filtered = categories;
    }
    return flattenCategoryTree(filtered);
  };

  return (
    <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mt: { xs: 0.5, sm: 1 } }}>
      <Grid item xs={12} sm={6}>
        <AccountAutocomplete
          accounts={accounts}
          value={watchedAccountId || ''}
          onChange={(id) => setValue('accountId', id)}
          onSelect={() => {
            // Focus Category field after account selection
            setTimeout(() => {
              categoryInputRef.current?.focus();
            }, 100);
          }}
          label="Account"
          error={!!errors.accountId}
          helperText={errors.accountId?.message}
          required
          autoFocus={autoFocusAccount}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        {/* Type as two tap-to-select chips (faster + more thumb-friendly
            than a dropdown), filling the field's width */}
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mb: 0.5,
            ml: 0.25,
            color: errors.type ? 'error.main' : 'text.secondary',
          }}
        >
          Type *
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {TRANSACTION_TYPES.filter((t) => !t.includes('Transfer')).map(
            (type) => {
              const selected = watchedType === type;
              return (
                <Chip
                  key={type}
                  label={type}
                  onClick={() =>
                    setValue('type', type, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                  color={selected ? 'primary' : 'default'}
                  variant={selected ? 'filled' : 'outlined'}
                  sx={{ flex: 1, fontWeight: 500 }}
                />
              );
            }
          )}
        </Box>
        {errors.type && (
          <FormHelperText error sx={{ ml: 0.25 }}>
            {errors.type.message}
          </FormHelperText>
        )}
      </Grid>
      <Grid item xs={12} sm={6}>
        <CategoryAutocomplete
          categories={getFilteredCategories()}
          leafOnly
          value={watchedCategoryId || ''}
          onChange={(id) => setValue('categoryId', id)}
          onSelect={() => {
            // Focus Amount field after category selection
            setTimeout(() => {
              amountInputRef.current?.focus();
            }, 50);
          }}
          label="Category *"
          error={!!errors.categoryId}
          helperText={
            errors.categoryId?.message ||
            (!watchedType ? 'Please select a transaction type first' : undefined)
          }
          disabled={!watchedType}
          autoFocus={autoFocusCategory && !!watchedType && !!watchedAccountId}
          inputRef={categoryInputRef}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          fullWidth
          type="number"
          label="Amount *"
          {...register('amount', { valueAsNumber: true })}
          inputRef={amountInputRef}
          error={!!errors.amount}
          helperText={errors.amount?.message}
          inputProps={{ step: '0.01', min: '0.01' }}
          InputProps={
            watch('currency')
              ? {
                  startAdornment: (
                    <InputAdornment position="start">
                      {currencyLabel(watch('currency'))}
                    </InputAdornment>
                  ),
                }
              : undefined
          }
        />
        <BudgetInlineCue
          categoryId={watchedCategoryId}
          type={watchedType}
          amount={watch('amount')}
          amountCurrency={watch('currency')}
          excludeTransactionId={excludeTransactionId}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="Description"
          {...register('description')}
          error={!!errors.description}
          helperText={errors.description?.message}
          multiline
          rows={2}
        />
      </Grid>
      <Grid item xs={12}>
        {/* Date + Status default sensibly, so they stay out of the way
            behind "More options" until you actually need them. */}
        <Button
          onClick={() => setShowMore((v) => !v)}
          size="small"
          endIcon={
            <ExpandMoreIcon
              sx={{
                transition: 'transform 0.2s',
                transform: showMore ? 'rotate(180deg)' : 'none',
              }}
            />
          }
          sx={{ textTransform: 'none', color: 'text.secondary', px: 0.5 }}
        >
          More options
        </Button>
        <Collapse in={showMore || !!errors.date || !!errors.status}>
          <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mt: 0 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="date"
                label="Date *"
                {...register('date')}
                error={!!errors.date}
                helperText={errors.date?.message}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth error={!!errors.status}>
                <InputLabel>Status</InputLabel>
                <Select
                  {...register('status')}
                  label="Status"
                  value={watchedStatus || ''}
                  onChange={(e) => setValue('status', e.target.value)}
                >
                  {TRANSACTION_STATUSES.map((status) => (
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
          </Grid>
        </Collapse>
      </Grid>
    </Grid>
  );
}
