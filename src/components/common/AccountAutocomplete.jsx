import { useRef, useEffect } from 'react';
import { Autocomplete, TextField, Box, Typography } from '@mui/material';

/**
 * Searchable account dropdown component using MUI Autocomplete.
 * Provides type-ahead search functionality for easy account selection.
 */
function AccountAutocomplete({
  accounts, // List of accounts
  value, // Selected account_id
  onChange, // (account_id) => void
  onSelect, // Optional callback after an account is selected (for focus chaining)
  label = 'Account *',
  error,
  helperText,
  disabled,
  required = false,
  autoFocus = false, // Auto-focus the input on mount
  excludeAccountId, // Optional: exclude an account from the list (e.g., when selecting "To Account", exclude "From Account")
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

  // Filter active accounts and optionally exclude one account
  const filteredAccounts = accounts.filter((acc) => {
    if (acc.status !== 'Active') return false;
    if (excludeAccountId && acc.account_id === excludeAccountId) return false;
    return true;
  });

  const selectedAccount =
    filteredAccounts.find((acc) => acc.account_id === value) || null;

  return (
    <Autocomplete
      options={filteredAccounts}
      value={selectedAccount}
      onChange={(_, newValue) => {
        const accountId = newValue?.account_id || '';
        onChange(accountId);
        // Call onSelect callback if an account was selected (for focus chaining)
        if (accountId && onSelect) {
          // Small delay to allow form state to update
          setTimeout(() => onSelect(accountId), 50);
        }
      }}
      getOptionLabel={(option) =>
        option.name ? `${option.name} (${option.currency})` : ''
      }
      isOptionEqualToValue={(option, value) =>
        option?.account_id === value?.account_id
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
          <Box component="li" key={key} {...otherProps}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
                alignItems: 'center',
              }}
            >
              <Typography>{option.name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                {option.currency}
              </Typography>
            </Box>
          </Box>
        );
      }}
      {...props}
    />
  );
}

export default AccountAutocomplete;
