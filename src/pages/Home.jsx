import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { selectCategoryMap } from '../store/selectors';
import {
  Button,
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Checkbox,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ChecklistIcon from '@mui/icons-material/Checklist';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AddIcon from '@mui/icons-material/Add';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ChatIcon from '@mui/icons-material/Chat';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AddTransactionDialog from '../components/common/AddTransactionDialog';
import CategoryTransactionsList from '../components/common/CategoryTransactionsList';
import { getTransactionsTotalLabel } from '../utils/currencyConversion';
import BatchTransactionDialog from '../components/common/BatchTransactionDialog';
import AddTransferDialog from '../components/common/AddTransferDialog';
import ReceiptCaptureDialog from '../components/common/ReceiptCaptureDialog';
import NaturalLanguageDialog from '../components/common/NaturalLanguageDialog';
import AITransactionsReviewModal from '../components/common/AITransactionsReviewModal';
import ErrorMessage from '../components/common/ErrorMessage';
import EmptyState from '../components/common/EmptyState';
import { usePageRefresh } from '../hooks/usePageRefresh';
import { clearError } from '../store/slices/transactionsSlice';
import { updateSetting } from '../store/slices/settingsSlice';

const HOME_SHORTCUTS_SETTING_KEY = 'HomeCategoryShortcuts';

function Home({ quickAddExpense = false }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const [addTransactionPrefill, setAddTransactionPrefill] = useState(null);
  const [batchTransactionOpen, setBatchTransactionOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [receiptCaptureOpen, setReceiptCaptureOpen] = useState(false);
  const [naturalLanguageOpen, setNaturalLanguageOpen] = useState(false);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  const [aiParsedData, setAiParsedData] = useState(null);
  const [isReceiptParsing, setIsReceiptParsing] = useState(false);
  const [manageShortcutsOpen, setManageShortcutsOpen] = useState(false);
  const [shortcutDraftIds, setShortcutDraftIds] = useState([]);
  const [shortcutSearchQuery, setShortcutSearchQuery] = useState('');
  const [isSavingShortcuts, setIsSavingShortcuts] = useState(false);
  const searchInputRef = useRef(null);
  const hasOpenedQuickAddRef = useRef(false);
  // Let the section headers host the transaction-list multi-select toggle so
  // the list itself doesn't render an empty toggle-only row above the rows
  const recentSelectRef = useRef(null);
  const searchSelectRef = useRef(null);

  // Get data from Redux
  const { allTransactions, error } = useSelector((state) => state.transactions);
  const { categories } = useSelector((state) => state.categories);
  const { settings } = useSelector((state) => state.settings);

  // Memoized O(1) lookup functions from selectors
  const categoryMap = useSelector(selectCategoryMap);

  const activeShortcutCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.status === 'Active' &&
          (category.type === 'Income' || category.type === 'Expense')
      ),
    [categories]
  );

  const savedShortcutIds = useMemo(() => {
    const savedValue = settings.find(
      (setting) => setting.setting_key === HOME_SHORTCUTS_SETTING_KEY
    )?.setting_value;

    if (!savedValue) return [];

    try {
      const parsed = JSON.parse(savedValue);
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }, [settings]);

  const shortcutCategories = useMemo(() => {
    const activeById = new Map(
      activeShortcutCategories.map((category) => [category.category_id, category])
    );

    return savedShortcutIds
      .map((id) => activeById.get(id))
      .filter(Boolean);
  }, [savedShortcutIds, activeShortcutCategories]);

  const filteredShortcutOptions = useMemo(() => {
    const query = shortcutSearchQuery.trim().toLowerCase();
    if (!query) return activeShortcutCategories;
    return activeShortcutCategories.filter((category) =>
      category.name.toLowerCase().includes(query)
    );
  }, [activeShortcutCategories, shortcutSearchQuery]);

  // Refresh data on navigation
  usePageRefresh({
    dataTypes: ['transactions', 'accounts', 'categories', 'settings'],
    filters: {
      accounts: { status: 'Active' },
      categories: { status: 'Active' },
    },
  });

  // Debounce search query with 500ms delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim().toLowerCase());
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // When opened via the quick-add route, open the Add Transaction dialog once
  useEffect(() => {
    if (quickAddExpense && !hasOpenedQuickAddRef.current) {
      hasOpenedQuickAddRef.current = true;
      setAddTransactionOpen(true);
    }
  }, [quickAddExpense]);

  // Keep the search field focused reliably: on mount (covers navigating to
  // Home, including the app being reopened to Home) and whenever the app is
  // resumed. A freshly-resumed PWA often ignores the first focus() (no user
  // gesture yet) and won't restore focus itself if the field was blurred
  // before backgrounding — so we retry a few times and listen on every resume
  // signal (visibilitychange / pageshow / window focus). Skipped while a
  // dialog is open so it doesn't steal focus from a form.
  useEffect(() => {
    const focusSearch = () => {
      if (quickAddExpense) return;
      const input = searchInputRef.current;
      if (!input) return;
      if (document.querySelector('.MuiDialog-root')) return;
      input.focus({ preventScroll: true });
    };

    let timers = [];
    const focusWithRetries = () => {
      timers.forEach(clearTimeout);
      timers = [0, 80, 200, 450].map((d) => setTimeout(focusSearch, d));
    };

    focusWithRetries();

    const onVisible = () => {
      if (document.visibilityState === 'visible') focusWithRetries();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', focusWithRetries);
    window.addEventListener('focus', focusWithRetries);
    return () => {
      timers.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', focusWithRetries);
      window.removeEventListener('focus', focusWithRetries);
    };
  }, [quickAddExpense]);

  // Search transactions by category name and description
  const searchResults = useMemo(() => {
    if (
      !debouncedSearchQuery ||
      !allTransactions ||
      allTransactions.length === 0
    ) {
      return [];
    }

    const query = debouncedSearchQuery;

    return allTransactions.filter((txn) => {
      // Skip deleted or cancelled transactions
      if (txn.deleted_at || txn.status === 'Cancelled') {
        return false;
      }

      // Search by description
      const description = (txn.description || '').toLowerCase();
      if (description.includes(query)) {
        return true;
      }

      // Search by category name using O(1) Map lookup
      const category = categoryMap.get(txn.category_id);
      if (category) {
        const categoryName = (category.name || '').toLowerCase();
        if (categoryName.includes(query)) {
          return true;
        }
      }

      return false;
    });
  }, [debouncedSearchQuery, allTransactions, categoryMap]);

  // Per-currency total of the current search results (shown under the search
  // box; the list header's own summary is suppressed to avoid duplication)
  const searchTotalLabel = useMemo(
    () => getTransactionsTotalLabel(searchResults),
    [searchResults]
  );

  // Recent transactions (5 most recent, excluding deleted/cancelled)
  const recentTransactions = useMemo(() => {
    if (!allTransactions || allTransactions.length === 0) {
      return [];
    }

    return allTransactions
      .filter((txn) => !txn.deleted_at && txn.status !== 'Cancelled')
      .sort((a, b) => {
        // Sort by created_at or date, most recent first
        const dateA = new Date(a.created_at || a.date);
        const dateB = new Date(b.created_at || b.date);
        return dateB - dateA;
      })
      .slice(0, 5);
  }, [allTransactions]);

  // Get date display with time (Today shows time only, Yesterday shows "Yesterday, time", older dates show "Dec 25, time")
  // Now uses the date field which contains full datetime (TIMESTAMPTZ)


  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    // Focus the search input after clearing
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 0);
  }, []);

  // Handle AI parsed data from receipt or natural language
  const handleAiParsed = useCallback((data) => {
    setAiParsedData(data);
    setIsReceiptParsing(data.type === 'receipt');
    setAiReviewOpen(true);
  }, []);

  // Close AI review modal
  const handleAiReviewClose = useCallback(() => {
    setAiReviewOpen(false);
    setAiParsedData(null);
    setIsReceiptParsing(false);
  }, []);

  const handleOpenManageShortcuts = useCallback(() => {
    const availableIds = new Set(activeShortcutCategories.map((cat) => cat.category_id));
    setShortcutDraftIds(
      savedShortcutIds.filter((id) => availableIds.has(id))
    );
    setShortcutSearchQuery('');
    setManageShortcutsOpen(true);
  }, [activeShortcutCategories, savedShortcutIds]);

  const handleToggleShortcutCategory = useCallback((categoryId) => {
    setShortcutDraftIds((prev) => {
      if (prev.includes(categoryId)) {
        return prev.filter((id) => id !== categoryId);
      }
      return [...prev, categoryId];
    });
  }, []);

  const handleSaveShortcuts = useCallback(async () => {
    setIsSavingShortcuts(true);
    try {
      await dispatch(
        updateSetting({
          key: HOME_SHORTCUTS_SETTING_KEY,
          value: JSON.stringify(shortcutDraftIds),
        })
      ).unwrap();
      setManageShortcutsOpen(false);
    } catch (saveError) {
      console.error('Failed to save home category shortcuts:', saveError);
    } finally {
      setIsSavingShortcuts(false);
    }
  }, [dispatch, shortcutDraftIds]);

  const handleShortcutClick = useCallback((category) => {
    setAddTransactionPrefill({
      categoryId: category.category_id,
      type: category.type === 'Income' ? 'Income' : 'Expense',
    });
    setAddTransactionOpen(true);
  }, []);

  const handleCloseAddTransaction = useCallback(() => {
    setAddTransactionOpen(false);
    setAddTransactionPrefill(null);
  }, []);


  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: { xs: 1.5, sm: 2, md: 3 },
        }}
      >
        <Typography
          variant="h4"
          sx={{
            fontSize: { xs: '1.25rem', sm: '1.5rem' },
            fontWeight: 500,
          }}
        >
          Home
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton
            onClick={() => setReceiptCaptureOpen(true)}
            aria-label="Scan receipt"
            sx={{
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              width: 36,
              height: 36,
              '&:hover': {
                backgroundColor: 'primary.dark',
                cursor: 'pointer',
              },
            }}
          >
            <CameraAltIcon
              sx={{
                fontSize: 20,
              }}
            />
          </IconButton>
          <IconButton
            onClick={() => setNaturalLanguageOpen(true)}
            aria-label="Add transactions with text"
            sx={{
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              width: 36,
              height: 36,
              '&:hover': {
                backgroundColor: 'primary.dark',
                cursor: 'pointer',
              },
            }}
          >
            <ChatIcon
              sx={{
                fontSize: 20,
              }}
            />
          </IconButton>
          <IconButton
            onClick={() => setTransferDialogOpen(true)}
            sx={{
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              width: 36,
              height: 36,
              '&:hover': {
                backgroundColor: 'primary.dark',
                cursor: 'pointer',
              },
            }}
          >
            <SwapHorizIcon
              sx={{
                fontSize: 20,
              }}
            />
          </IconButton>
          <IconButton
            onClick={() => setBatchTransactionOpen(true)}
            sx={{
              backgroundColor: 'info.main',
              color: 'info.contrastText',
              width: 36,
              height: 36,
              '&:hover': {
                backgroundColor: 'info.dark',
                cursor: 'pointer',
              },
            }}
          >
            <PlaylistAddIcon
              sx={{
                fontSize: 20,
              }}
            />
          </IconButton>
          <IconButton
            onClick={() => setAddTransactionOpen(true)}
            sx={{
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              width: 36,
              height: 36,
              '&:hover': {
                backgroundColor: 'primary.main',
                cursor: 'pointer',
                '& .add-icon': {
                  transform: 'rotate(90deg)',
                },
              },
            }}
          >
            <AddIcon
              className="add-icon"
              sx={{
                fontSize: 20,
                transition: 'transform 0.2s ease-in-out',
              }}
            />
          </IconButton>
        </Box>
      </Box>

      {error && <ErrorMessage error={error} onClose={() => dispatch(clearError())} />}

      {/* Add Transaction Dialog */}
      <AddTransactionDialog
        open={addTransactionOpen}
        onClose={handleCloseAddTransaction}
        initialValues={addTransactionPrefill}
      />


      {/* Batch Transaction Dialog */}
      <BatchTransactionDialog
        open={batchTransactionOpen}
        onClose={() => setBatchTransactionOpen(false)}
      />

      {/* Add Transfer Dialog */}
      <AddTransferDialog
        open={transferDialogOpen}
        onClose={() => setTransferDialogOpen(false)}
      />

      {/* Receipt Capture Dialog */}
      <ReceiptCaptureDialog
        open={receiptCaptureOpen}
        onClose={() => setReceiptCaptureOpen(false)}
        onParsed={handleAiParsed}
      />

      {/* Natural Language Dialog */}
      <NaturalLanguageDialog
        open={naturalLanguageOpen}
        onClose={() => setNaturalLanguageOpen(false)}
        onParsed={handleAiParsed}
      />

      {/* AI Transactions Review Modal */}
      <AITransactionsReviewModal
        open={aiReviewOpen}
        onClose={handleAiReviewClose}
        parsedData={aiParsedData}
        isReceipt={isReceiptParsing}
      />

      {/* Search Bar */}
      <Box
        sx={{
          mb: { xs: 2, sm: 3 },
          p: { xs: 1.5, sm: 2 },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          backgroundColor: 'background.paper',
        }}
      >
        <TextField
          inputRef={searchInputRef}
          fullWidth
          placeholder="Search transactions by category or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton
                  onClick={handleClearSearch}
                  edge="end"
                  size="small"
                  sx={{ mr: 0.5 }}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: { xs: '0.875rem', sm: '1rem' },
              py: { xs: 0.5, sm: 1 },
            },
          }}
          autoFocus
        />
        {debouncedSearchQuery && (
          <Box
            sx={{
              mt: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap
              sx={{ fontSize: { xs: '0.8125rem', sm: '0.875rem' }, minWidth: 0 }}
            >
              {searchResults.length} transaction
              {searchResults.length !== 1 ? 's' : ''} found
              {searchTotalLabel && (
                <>
                  {' · '}
                  <Box
                    component="span"
                    sx={{ fontWeight: 600, color: 'text.primary' }}
                  >
                    {searchTotalLabel}
                  </Box>
                </>
              )}
            </Typography>
            {searchResults.length > 0 && (
              <IconButton
                size="small"
                aria-label="Select multiple"
                onClick={() => searchSelectRef.current?.enterSelection()}
                sx={{ color: 'text.secondary', flexShrink: 0 }}
              >
                <ChecklistIcon sx={{ fontSize: 18 }} />
              </IconButton>
            )}
          </Box>
        )}
      </Box>

      {/* Hidden entirely when no shortcuts are configured; shortcuts can
          still be managed via the "Manage shortcuts" button below the
          Recent Transactions list */}
      {!debouncedSearchQuery && shortcutCategories.length > 0 && (
        <Box
          sx={{
            mb: { xs: 2, sm: 2.5 },
            p: { xs: 1.5, sm: 2 },
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            backgroundColor: 'background.paper',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 1.5,
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
              Category Shortcuts
            </Typography>
            <Button size="small" onClick={handleOpenManageShortcuts}>
              Manage
            </Button>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            {shortcutCategories.map((category) => (
              <Chip
                key={category.category_id}
                label={category.name}
                onClick={() => handleShortcutClick(category)}
                clickable
                color="primary"
                variant="outlined"
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* Search Results — same look and functionality as the Transactions page */}
      {debouncedSearchQuery && (
        <Box>
          <CategoryTransactionsList
            ref={searchSelectRef}
            transactions={searchResults}
            pageSize={50}
            showSummary={false}
            showRestingHeader={false}
          />
        </Box>
      )}

      {/* Recent Transactions (shown when no search query) */}
      {!debouncedSearchQuery && (
        <Box>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 1.5,
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontSize: { xs: '1rem', sm: '1.125rem' },
                fontWeight: 500,
              }}
            >
              Recent Transactions
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {/* Fallback entry point for shortcut management while the Category
                  Shortcuts section is hidden (no shortcuts configured yet) */}
              {shortcutCategories.length === 0 && (
                <Button
                  size="small"
                  color="inherit"
                  onClick={handleOpenManageShortcuts}
                  sx={{ color: 'text.secondary', textTransform: 'none' }}
                >
                  Manage shortcuts
                </Button>
              )}
              {recentTransactions.length > 0 && (
                <IconButton
                  size="small"
                  aria-label="Select multiple"
                  onClick={() => recentSelectRef.current?.enterSelection()}
                  sx={{ color: 'text.secondary' }}
                >
                  <ChecklistIcon sx={{ fontSize: 18 }} />
                </IconButton>
              )}
            </Box>
          </Box>
          {recentTransactions.length === 0 ? (
            <EmptyState
              icon={<ReceiptIcon />}
              title="No transactions yet"
              subtitle="Add your first transaction to get started"
            />
          ) : (
            <>
              <CategoryTransactionsList
                ref={recentSelectRef}
                transactions={recentTransactions}
                showSummary={false}
                showRestingHeader={false}
              />
              <Button
                fullWidth
                size="small"
                onClick={() => navigate('/transactions')}
                endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
                sx={{ mt: 1, textTransform: 'none', color: 'text.secondary' }}
              >
                View all transactions
              </Button>
            </>
          )}
        </Box>
      )}

      <Dialog
        open={manageShortcutsOpen}
        onClose={() => !isSavingShortcuts && setManageShortcutsOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Manage Category Shortcuts</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Select categories to show as shortcuts.
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Search categories..."
            value={shortcutSearchQuery}
            onChange={(event) => setShortcutSearchQuery(event.target.value)}
            sx={{ mb: 1.5 }}
          />
          <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
            {filteredShortcutOptions.map((category) => {
              const checked = shortcutDraftIds.includes(category.category_id);
              return (
                <FormControlLabel
                  key={category.category_id}
                  sx={{
                    m: 0,
                    px: 1,
                    py: 0.5,
                    width: '100%',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                  labelPlacement="start"
                  control={
                    <Checkbox
                      checked={checked}
                      disabled={isSavingShortcuts}
                      onChange={() => handleToggleShortcutCategory(category.category_id)}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Typography variant="body2">{category.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {category.type}
                      </Typography>
                    </Box>
                  }
                />
              );
            })}
            {filteredShortcutOptions.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 2 }}>
                No categories found.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManageShortcutsOpen(false)} disabled={isSavingShortcuts}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveShortcuts}
            disabled={isSavingShortcuts}
          >
            {isSavingShortcuts ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}

export default Home;
