import { useRef, useEffect } from 'react';
import { Autocomplete, TextField, Box, Typography } from '@mui/material';

/**
 * Searchable category dropdown component using MUI Autocomplete.
 * Provides type-ahead search functionality for easy category selection.
 */
function CategoryAutocomplete({
  categories,          // Flattened category list with depth info
  value,               // Selected category_id
  onChange,            // (category_id) => void
  label = "Category *",
  error,
  helperText,
  disabled,
  filterByType,        // Optional: 'Income' or 'Expense'
  required = false,
  autoFocus = false,   // Auto-focus the input on mount
  ...props
}) {
  const inputRef = useRef(null);

  // Auto-focus the input when autoFocus prop is true
  useEffect(() => {
    if (autoFocus && inputRef.current && !disabled) {
      // Small delay to ensure the dialog is fully mounted
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, disabled]);

  // Filter categories by type if specified
  const filteredCategories = filterByType
    ? categories.filter(cat => cat.type === filterByType && cat.status === 'Active')
    : categories.filter(cat => cat.status === 'Active');

  const selectedCategory = filteredCategories.find(cat => cat.category_id === value) || null;

  return (
    <Autocomplete
      options={filteredCategories}
      value={selectedCategory}
      onChange={(_, newValue) => onChange(newValue?.category_id || '')}
      getOptionLabel={(option) => option.name || ''}
      isOptionEqualToValue={(option, value) => option?.category_id === value?.category_id}
      disabled={disabled}
      fullWidth
      renderInput={(params) => (
        <TextField
          {...params}
          inputRef={inputRef}
          label={label}
          error={error}
          helperText={helperText}
          required={required}
        />
      )}
      renderOption={(props, option) => {
        const { key, ...otherProps } = props;
        return (
          <Box
            component="li"
            key={key}
            {...otherProps}
            sx={{ pl: 2 + (option.depth || 0) * 2 }}
          >
            <Typography sx={{ fontWeight: option.hasChildren ? 600 : 400 }}>
              {option.name}
            </Typography>
          </Box>
        );
      }}
      {...props}
    />
  );
}

export default CategoryAutocomplete;

