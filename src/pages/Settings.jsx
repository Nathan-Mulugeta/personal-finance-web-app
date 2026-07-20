import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Alert,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { AI_PROVIDER_LINKS } from '../lib/api/aiParsing';
import { updateSettings } from '../store/slices/settingsSlice';
import { fetchCategories } from '../store/slices/categoriesSlice';
import { fetchAccounts } from '../store/slices/accountsSlice';
import PageSkeleton from '../components/common/PageSkeleton';
import ErrorMessage from '../components/common/ErrorMessage';
import CategoryAutocomplete from '../components/common/CategoryAutocomplete';
import { usePageRefresh } from '../hooks/usePageRefresh';
import { persistor } from '../store';
import RefreshIcon from '@mui/icons-material/Refresh';

function Settings() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { settings, loading, backgroundLoading, isInitialized, error } =
    useSelector((state) => state.settings);
  const { categories } = useSelector((state) => state.categories);
  const { accounts } = useSelector((state) => state.accounts);
  const categoriesInitialized = useSelector(
    (state) => state.categories.isInitialized
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Per-setting focused editing
  const [editing, setEditing] = useState(null); // active setting config
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Refresh data on navigation
  usePageRefresh({
    dataTypes: ['settings', 'categories', 'accounts'],
    filters: {
      categories: { status: 'Active' },
      accounts: { status: 'Active' },
    },
  });


  const openEditor = (setting) => {
    let initial;
    if (setting.type === 'apikey') {
      initial =
        getSettingValue('GroqAPIKey') || getSettingValue('GeminiAPIKey');
    } else if (setting.type === 'currency') {
      initial = getSettingValue('BaseCurrency');
    } else {
      initial = getSettingValue(setting.key);
    }
    setEditValue(initial || '');
    setSaveError(null);
    setEditing(setting);
  };

  const saveSetting = async () => {
    if (!editing) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      let updates;
      if (editing.type === 'apikey') {
        updates = { GroqAPIKey: editValue || '', GeminiAPIKey: '' };
      } else if (editing.type === 'currency') {
        updates = { BaseCurrency: (editValue || '').toUpperCase() };
      } else {
        updates = { [editing.key]: editValue || '' };
      }
      await dispatch(updateSettings(updates)).unwrap();
      setEditing(null);
    } catch (err) {
      setSaveError(err?.message || 'Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Get setting value helper
  const getSettingValue = (key) => {
    const setting = settings.find((s) => s.setting_key === key);
    return setting?.setting_value || '';
  };

  // Get category name helper
  const getCategoryName = (categoryId) => {
    if (!categoryId) return 'Not set';
    const category = categories.find((cat) => cat.category_id === categoryId);
    return category?.name || 'Unknown';
  };

  // Get account name helper
  const getAccountName = (accountId) => {
    if (!accountId) return 'Not set';
    const account = accounts.find((acc) => acc.account_id === accountId);
    return account ? `${account.name} (${account.currency})` : 'Unknown';
  };

  // Get income categories for borrowing (money coming in)
  const getIncomeCategories = () => {
    return categories.filter(
      (cat) => cat.type === 'Income' && cat.status === 'Active'
    );
  };

  // Get expense categories for lending (money going out)
  const getExpenseCategories = () => {
    return categories.filter(
      (cat) => cat.type === 'Expense' && cat.status === 'Active'
    );
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Purge persisted storage using redux-persist
      await persistor.purge();

      // Reload the page to rehydrate with empty state and fetch fresh data
      // This ensures all Redux state is reset properly
      window.location.reload();
    } catch (err) {
      console.error('Error refreshing data:', err);
      setIsRefreshing(false);
    }
  };

  if (loading && settings.length === 0) {
    return <PageSkeleton />;
  }

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: { xs: 2, sm: 3 },
          gap: 1,
        }}
      >
        <Typography
          variant="h4"
          sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, fontWeight: 500 }}
        >
          Settings
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          <Tooltip title={isRefreshing ? 'Refreshing…' : 'Refresh data'}>
            <span>
              <IconButton
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                aria-label="Refresh data"
                sx={{ width: 36, height: 36, color: 'text.secondary' }}
              >
                {isRefreshing ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <RefreshIcon sx={{ fontSize: 20 }} />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {error && <ErrorMessage error={error} />}

      {(() => {
        const apiKey =
          getSettingValue('GroqAPIKey') || getSettingValue('GeminiAPIKey');
        const sections = [
          {
            label: 'General',
            rows: [
              {
                key: 'BaseCurrency',
                type: 'currency',
                label: 'Base Currency',
                desc: 'Default currency for totals and conversions',
                value: getSettingValue('BaseCurrency') || 'Not set',
              },
              {
                key: 'DefaultAccountID',
                type: 'account',
                label: 'Default Account',
                desc: 'Auto-selected when creating transactions',
                value: getAccountName(getSettingValue('DefaultAccountID')),
              },
              {
                key: 'AIAPIKey',
                type: 'apikey',
                label: 'AI API Key',
                desc: 'For receipt scanning and natural-language entry',
                value: apiKey ? `••••${apiKey.slice(-4)}` : 'Not set',
              },
            ],
          },
          {
            label: 'Borrowing & Lending',
            rows: [
              {
                key: 'BorrowingCategoryID',
                type: 'category',
                categoryType: 'Income',
                label: 'Borrowing Category',
                desc: 'Default category for borrowing transactions',
                value: getCategoryName(getSettingValue('BorrowingCategoryID')),
              },
              {
                key: 'LendingCategoryID',
                type: 'category',
                categoryType: 'Expense',
                label: 'Lending Category',
                desc: 'Default category for lending transactions',
                value: getCategoryName(getSettingValue('LendingCategoryID')),
              },
              {
                key: 'BorrowingPaymentCategoryID',
                type: 'category',
                categoryType: 'Expense',
                label: 'Borrowing Payment Category',
                desc: 'Used when recording borrowing payments',
                value: getCategoryName(
                  getSettingValue('BorrowingPaymentCategoryID')
                ),
              },
              {
                key: 'LendingPaymentCategoryID',
                type: 'category',
                categoryType: 'Income',
                label: 'Lending Payment Category',
                desc: 'Used when recording lending payments',
                value: getCategoryName(
                  getSettingValue('LendingPaymentCategoryID')
                ),
              },
            ],
          },
        ];

        const isUnset = (v) =>
          !v || v === 'Not set' || v === 'None' || v === 'Not selected';

        return sections.map((section) => (
          <Box key={section.label} sx={{ mb: 3 }}>
            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: 'text.secondary',
                mb: 0.5,
              }}
            >
              {section.label}
            </Typography>
            {section.rows.map((row) => (
              <Box
                key={row.key}
                onClick={() => openEditor(row)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                  py: 1.25,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                  '&:active': { backgroundColor: 'action.hover' },
                  '@media (hover: hover)': {
                    '&:hover': { backgroundColor: 'action.hover' },
                  },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                    {row.label}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: '0.6875rem',
                      color: 'text.secondary',
                      display: 'block',
                    }}
                  >
                    {row.desc}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.25,
                    minWidth: 0,
                    maxWidth: '55%',
                    flexShrink: 0,
                  }}
                >
                  <Typography
                    noWrap
                    sx={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      textAlign: 'right',
                      minWidth: 0,
                      color: isUnset(row.value)
                        ? 'text.disabled'
                        : 'text.primary',
                    }}
                  >
                    {row.value}
                  </Typography>
                  <ChevronRightIcon
                    sx={{ fontSize: 18, color: 'text.disabled', flexShrink: 0 }}
                  />
                </Box>
              </Box>
            ))}
          </Box>
        ));
      })()}

      {/* Focused single-setting editor */}
      <Dialog
        open={!!editing}
        onClose={() => !isSaving && setEditing(null)}
        maxWidth="xs"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>{editing?.label}</DialogTitle>
        <DialogContent>
          {saveError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {saveError}
            </Alert>
          )}
          {editing?.desc && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2, fontSize: '0.8125rem' }}
            >
              {editing.desc}
            </Typography>
          )}
          {editing?.type === 'currency' && (
            <TextField
              fullWidth
              autoFocus
              label="Currency (ISO code)"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value.toUpperCase())}
              inputProps={{ maxLength: 3, style: { textTransform: 'uppercase' } }}
              helperText="e.g. USD, EUR, ETB"
            />
          )}
          {editing?.type === 'account' && (
            <FormControl fullWidth>
              <InputLabel>Account</InputLabel>
              <Select
                value={editValue}
                label="Account"
                onChange={(e) => setEditValue(e.target.value)}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {accounts
                  .filter((acc) => acc.status === 'Active')
                  .map((account) => (
                    <MenuItem
                      key={account.account_id}
                      value={account.account_id}
                    >
                      {account.name} ({account.currency})
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
          {editing?.type === 'apikey' && (
            <TextField
              fullWidth
              autoFocus
              type="password"
              label="API key"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              helperText={
                <span>
                  Get a key from:{' '}
                  {AI_PROVIDER_LINKS.map((link, index) => (
                    <span key={link.url}>
                      {index > 0 && ' · '}
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'inherit' }}
                      >
                        {link.label}
                      </a>
                    </span>
                  ))}
                </span>
              }
            />
          )}
          {editing?.type === 'category' && (
            <CategoryAutocomplete
              categories={
                editing.categoryType === 'Income'
                  ? getIncomeCategories()
                  : getExpenseCategories()
              }
              value={editValue}
              onChange={(id) => setEditValue(id || '')}
              label="Category"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={saveSetting}
            disabled={isSaving}
            startIcon={
              isSaving ? <CircularProgress size={20} color="inherit" /> : null
            }
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Settings;
