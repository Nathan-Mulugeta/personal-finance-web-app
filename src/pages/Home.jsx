import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  selectAccountNameGetter,
  selectCategoryNameGetter,
  selectCategoryMap,
} from '../store/selectors';
import {
  Box,
  Fab,
  IconButton,
  InputAdornment,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AddIcon from '@mui/icons-material/Add';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ChatIcon from '@mui/icons-material/Chat';
import AddTransactionDialog from '../components/common/AddTransactionDialog';
import EditTransactionDialog from '../components/common/EditTransactionDialog';
import BatchTransactionDialog from '../components/common/BatchTransactionDialog';
import ReceiptCaptureDialog from '../components/common/ReceiptCaptureDialog';
import NaturalLanguageDialog from '../components/common/NaturalLanguageDialog';
import AITransactionsReviewModal from '../components/common/AITransactionsReviewModal';
import ErrorMessage from '../components/common/ErrorMessage';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { usePageRefresh } from '../hooks/usePageRefresh';

function Home() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const [batchTransactionOpen, setBatchTransactionOpen] = useState(false);
  const [receiptCaptureOpen, setReceiptCaptureOpen] = useState(false);
  const [naturalLanguageOpen, setNaturalLanguageOpen] = useState(false);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  const [aiParsedData, setAiParsedData] = useState(null);
  const [isReceiptParsing, setIsReceiptParsing] = useState(false);
  const searchInputRef = useRef(null);

  // Get data from Redux
  const { allTransactions, error } = useSelector((state) => state.transactions);
  const { categories } = useSelector((state) => state.categories);
  const { accounts } = useSelector((state) => state.accounts);
  
  // Memoized O(1) lookup functions from selectors
  const getAccountName = useSelector(selectAccountNameGetter);
  const getCategoryName = useSelector(selectCategoryNameGetter);
  const categoryMap = useSelector(selectCategoryMap);

  // Refresh data on navigation
  usePageRefresh({
    dataTypes: ['transactions', 'accounts', 'categories', 'settings'],
    filters: {
      accounts: { status: 'Active' },
      categories: { status: 'Active' },
    },
  });

  // Debounce search query with 300ms delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim().toLowerCase());
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  // Recent transactions (10 most recent, excluding deleted/cancelled)
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
      .slice(0, 10);
  }, [allTransactions]);

  // Get date display (Today, Yesterday, or formatted date)
  const getDateDisplay = useCallback((transaction) => {
    const txnDate = parseISO(transaction.date);
    if (isToday(txnDate)) {
      return 'Today';
    } else if (isYesterday(txnDate)) {
      return 'Yesterday';
    }
    return format(txnDate, 'MMM dd, yyyy');
  }, []);

  const handleOpenEditDialog = useCallback((transaction) => {
    setEditingTransaction(transaction);
    setEditDialogOpen(true);
  }, []);

  const handleCloseEditDialog = useCallback(() => {
    setEditDialogOpen(false);
    setEditingTransaction(null);
  }, []);

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

  // Render mobile transaction row
  const renderMobileTransaction = (transaction) => {
    const description = transaction.description || '';
    const dateDisplay = getDateDisplay(transaction);

    return (
      <Box
        key={transaction.transaction_id}
        onClick={() => handleOpenEditDialog(transaction)}
        sx={{
          py: 1,
          px: 0.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          cursor: 'pointer',
          display: 'flex',
          gap: 0.75,
          alignItems: 'flex-start',
          '&:active': { backgroundColor: 'action.hover' },
          overflow: 'hidden',
          width: '100%',
          boxSizing: 'border-box',
          userSelect: 'none',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
              width: '100%',
            }}
          >
            <Typography
              variant="body2"
              component="div"
              sx={{
                fontSize: '0.8125rem',
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                flex: 1,
              }}
            >
              {getCategoryName(transaction.category_id)}
            </Typography>
            <Typography
              variant="body2"
              fontWeight={600}
              sx={{
                fontSize: '0.875rem',
                color:
                  transaction.type === 'Income' ||
                  transaction.type === 'Transfer In'
                    ? '#1e8e3e'
                    : transaction.type === 'Expense' ||
                      transaction.type === 'Transfer Out'
                    ? '#d93025'
                    : 'text.primary',
                flexShrink: 0,
              }}
            >
              {transaction.currency}{' '}
              {new Intl.NumberFormat('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(Math.abs(transaction.amount))}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
              width: '100%',
            }}
          >
            <Typography
              variant="body2"
              component="div"
              sx={{
                fontSize: '0.6875rem',
                color: 'text.secondary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                flex: 1,
              }}
            >
              {getAccountName(transaction.account_id)}
              {description && ` • ${description}`}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontSize: '0.6875rem',
                color: 'text.secondary',
                flexShrink: 0,
              }}
            >
              {dateDisplay}
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  };

  // Render desktop table row
  const renderDesktopTableRow = (transaction) => {
    const dateDisplay = getDateDisplay(transaction);

    return (
      <TableRow
        key={transaction.transaction_id}
        hover
        onClick={() => handleOpenEditDialog(transaction)}
        sx={{
          cursor: 'pointer',
          userSelect: 'none',
          '&:hover': {
            backgroundColor: 'action.hover',
          },
          '& td': {
            borderBottom: '1px solid',
            borderColor: 'divider',
            py: 0.5,
            fontSize: '0.8125rem',
          },
        }}
      >
        <TableCell>
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.8125rem',
              fontWeight: 500,
            }}
          >
            {getCategoryName(transaction.category_id)}
          </Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
            {getAccountName(transaction.account_id)}
          </Typography>
        </TableCell>
        <TableCell>
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.8125rem',
              color: 'text.secondary',
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {transaction.description || '-'}
          </Typography>
        </TableCell>
        <TableCell>
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.8125rem',
              whiteSpace: 'nowrap',
            }}
          >
            {dateDisplay}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 0.5,
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontSize: '0.75rem',
                color: 'text.secondary',
              }}
            >
              {transaction.currency}
            </Typography>
            <Typography
              variant="body2"
              fontWeight={600}
              sx={{
                fontSize: '0.875rem',
                color:
                  transaction.type === 'Income' ||
                  transaction.type === 'Transfer In'
                    ? '#1e8e3e'
                    : transaction.type === 'Expense' ||
                      transaction.type === 'Transfer Out'
                    ? '#d93025'
                    : 'text.primary',
              }}
            >
              {new Intl.NumberFormat('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(Math.abs(transaction.amount))}
            </Typography>
          </Box>
        </TableCell>
      </TableRow>
    );
  };

  // Render transactions list/table
  const renderTransactions = (transactions, title) => {
    if (transactions.length === 0) {
      return (
        <Box
          sx={{
            textAlign: 'center',
            py: { xs: 4, sm: 6 },
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            backgroundColor: 'background.paper',
          }}
        >
          <ReceiptIcon
            sx={{
              fontSize: { xs: 48, sm: 64 },
              color: 'text.secondary',
              mb: { xs: 1.5, sm: 2 },
            }}
          />
          <Typography
            variant="h6"
            color="text.secondary"
            gutterBottom
            sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
          >
            {debouncedSearchQuery ? 'No transactions found' : 'No transactions yet'}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}
          >
            {debouncedSearchQuery
              ? 'Try searching by category name or transaction description'
              : 'Add your first transaction to get started'}
          </Typography>
        </Box>
      );
    }

    return (
      <>
        {/* Mobile View */}
        <Box
          sx={{
            display: { xs: 'block', md: 'none' },
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            backgroundColor: 'background.paper',
            overflow: 'hidden',
          }}
        >
          {transactions.map((txn) => renderMobileTransaction(txn))}
        </Box>

        {/* Desktop Table View */}
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{
            display: { xs: 'none', md: 'block' },
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <Table size="small">
            <TableHead>
              <TableRow
                sx={{
                  backgroundColor: 'background.default',
                  '& th': {
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    py: 0.75,
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  },
                }}
              >
                <TableCell>Category</TableCell>
                <TableCell>Account</TableCell>
                <TableCell>Description</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Date</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.map((txn) => renderDesktopTableRow(txn))}
            </TableBody>
          </Table>
        </TableContainer>
      </>
    );
  };

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
            onClick={() => setBatchTransactionOpen(true)}
            sx={{
              backgroundColor: 'info.main',
              color: 'white',
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
              color: 'white',
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

      {error && <ErrorMessage error={error} />}

      {/* Add Transaction Dialog */}
      <AddTransactionDialog
        open={addTransactionOpen}
        onClose={() => setAddTransactionOpen(false)}
      />

      {/* Edit Transaction Dialog */}
      <EditTransactionDialog
        open={editDialogOpen}
        onClose={handleCloseEditDialog}
        transaction={editingTransaction}
      />

      {/* Batch Transaction Dialog */}
      <BatchTransactionDialog
        open={batchTransactionOpen}
        onClose={() => setBatchTransactionOpen(false)}
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
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1, fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}
          >
            {searchResults.length} transaction
            {searchResults.length !== 1 ? 's' : ''} found
          </Typography>
        )}
      </Box>

      {/* Search Results */}
      {debouncedSearchQuery && (
        <Box>{renderTransactions(searchResults, 'Search Results')}</Box>
      )}

      {/* Recent Transactions (shown when no search query) */}
      {!debouncedSearchQuery && (
        <Box>
          <Typography
            variant="h6"
            sx={{
              mb: 1.5,
              fontSize: { xs: '1rem', sm: '1.125rem' },
              fontWeight: 500,
            }}
          >
            Recent Transactions
          </Typography>
          {renderTransactions(recentTransactions, 'Recent Transactions')}
        </Box>
      )}

      {/* Floating Action Buttons for AI Features */}
      <Box
        sx={{
          position: 'fixed',
          bottom: { xs: 16, sm: 24 },
          right: { xs: 16, sm: 24 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          zIndex: 1000,
        }}
      >
        {/* Natural Language Input FAB */}
        <Fab
          color="secondary"
          size="medium"
          onClick={() => setNaturalLanguageOpen(true)}
          sx={{
            boxShadow: 3,
            '&:hover': {
              boxShadow: 6,
            },
          }}
          aria-label="Add transactions with text"
        >
          <ChatIcon />
        </Fab>

        {/* Receipt Scan FAB */}
        <Fab
          color="primary"
          size="large"
          onClick={() => setReceiptCaptureOpen(true)}
          sx={{
            boxShadow: 4,
            '&:hover': {
              boxShadow: 8,
            },
          }}
          aria-label="Scan receipt"
        >
          <CameraAltIcon />
        </Fab>
      </Box>
    </Box>
  );
}

export default Home;
