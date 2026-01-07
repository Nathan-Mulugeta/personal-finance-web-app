import { useRef, useEffect } from 'react';
import { Autocomplete, TextField, Box, Typography } from '@mui/material';

/**
 * Searchable category dropdown component using MUI Autocomplete.
 * Provides type-ahead search functionality for easy category selection.
 */
function CategoryAutocomplete({
  categories, // Flattened category list with depth info
  value, // Selected category_id
  onChange, // (category_id) => void
  onSelect, // Optional callback after a category is selected (for focus chaining)
  label = 'Category *',
  error,
  helperText,
  disabled,
  filterByType, // Optional: 'Income' or 'Expense'
  required = false,
  autoFocus = false, // Auto-focus the input on mount
  inputRef: externalInputRef, // Optional external ref for parent components to access input
  ...props
}) {
  const internalInputRef = useRef(null);
  const inputRef = externalInputRef || internalInputRef;

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
  const baseFilteredCategories = filterByType
    ? categories.filter(
        (cat) => cat.type === filterByType && cat.status === 'Active'
      )
    : categories.filter((cat) => cat.status === 'Active');

  // Custom filter function that includes parent categories when subcategories match
  // and includes all subcategories when parent categories match
  const filterOptions = (options, { inputValue }) => {
    if (!inputValue || inputValue.trim() === '') {
      return options;
    }

    const query = inputValue.toLowerCase().trim();
    const matchingCategoryIds = new Set();
    const parentIdsToInclude = new Set();
    const childIdsToInclude = new Set();

    // Helper function to recursively find all descendants of a category
    const findDescendants = (parentId) => {
      options.forEach((option) => {
        if (option.parent_category_id === parentId) {
          childIdsToInclude.add(option.category_id);
          // Recursively find children of this child
          findDescendants(option.category_id);
        }
      });
    };

    // Find all categories that match the query
    options.forEach((option) => {
      const name = (option.name || '').toLowerCase();
      if (name.includes(query)) {
        matchingCategoryIds.add(option.category_id);

        // If this is a subcategory, include its parent
        if (option.parent_category_id) {
          parentIdsToInclude.add(option.parent_category_id);
        }

        // If this is a parent category (has children), include all its subcategories
        if (option.hasChildren) {
          findDescendants(option.category_id);
        }
      }
    });

    // Build result set: matching categories + their parents + all subcategories of matching parents
    const resultIds = new Set([
      ...matchingCategoryIds,
      ...parentIdsToInclude,
      ...childIdsToInclude,
    ]);

    // Filter options to only include matching categories, their parents, and subcategories
    // Maintain the original order from the flattened tree
    const filtered = options.filter((option) =>
      resultIds.has(option.category_id)
    );

    // Sort to maintain hierarchy: parents before their children
    // Since the original list is already in hierarchical order, we just need to
    // ensure parents come before children in the filtered result
    const sorted = filtered.sort((a, b) => {
      // If a is parent of b, a should come first
      if (a.category_id === b.parent_category_id) return -1;
      if (b.category_id === a.parent_category_id) return 1;
      // Otherwise maintain original order (by finding original indices)
      const indexA = baseFilteredCategories.findIndex(
        (cat) => cat.category_id === a.category_id
      );
      const indexB = baseFilteredCategories.findIndex(
        (cat) => cat.category_id === b.category_id
      );
      return indexA - indexB;
    });

    return sorted;
  };

  const selectedCategory =
    baseFilteredCategories.find((cat) => cat.category_id === value) || null;

  return (
    <Autocomplete
      options={baseFilteredCategories}
      value={selectedCategory}
      filterOptions={filterOptions}
      onChange={(_, newValue) => {
        const categoryId = newValue?.category_id || '';
        onChange(categoryId);
        // Call onSelect callback if a category was selected (for focus chaining)
        if (categoryId && onSelect) {
          // Small delay to allow form state to update
          setTimeout(() => onSelect(categoryId), 50);
        }
      }}
      getOptionLabel={(option) => option.name || ''}
      isOptionEqualToValue={(option, value) =>
        option?.category_id === value?.category_id
      }
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
