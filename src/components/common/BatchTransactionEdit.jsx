import { useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  DialogTitle,
  DialogContent,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Typography,
  Chip,
  Divider,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ReceiptIcon from '@mui/icons-material/Receipt';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { formatCurrency } from '../../utils/currencyConversion';

/**
 * Batch Transaction Edit Component
 * List view of all queued transactions allowing edit/delete operations.
 * Has Cancel, Add, and Submit buttons.
 */
function BatchTransactionEdit({
  transactions,
  onEdit,
  onRemove,
  onAdd,
  onCancel,
  onSubmit,
  onBack,
  isSubmitting,
  error,
  onErrorClose,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { accounts } = useSelector((state) => state.accounts);
  const { categories } = useSelector((state) => state.categories);

  // Get category name helper
  const getCategoryName = (categoryId) => {
    const category = categories.find((cat) => cat.category_id === categoryId);
    return category?.name || 'Unknown';
  };

  // Get account name helper
  const getAccountName = (accountId) => {
    const account = accounts.find((acc) => acc.account_id === accountId);
    return account?.name || 'Unknown';
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <DialogTitle sx={{ flexShrink: 0, pb: { xs: 1, sm: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Edit Transactions</span>
          <Typography variant="body2" color="text.secondary">
            {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ flexGrow: 1, overflow: 'auto', pt: { xs: 1, sm: 2 }, px: 0 }}>
        {error && (
          <Alert severity="error" sx={{ mx: 2, mb: 2 }} onClose={onErrorClose}>
            {error}
          </Alert>
        )}

        {transactions.length === 0 ? (
          <Box
            sx={{
              textAlign: 'center',
              py: { xs: 4, sm: 6 },
              px: 2,
            }}
          >
            <ReceiptIcon
              sx={{
                fontSize: { xs: 48, sm: 64 },
                color: 'text.secondary',
                mb: 2,
              }}
            />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No transactions in queue
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Add transactions to get started
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onAdd}
              sx={{ textTransform: 'none' }}
            >
              Add Transaction
            </Button>
          </Box>
        ) : (
          <List disablePadding>
            {transactions.map((txn, index) => (
              <Box key={txn.tempId}>
                <ListItemButton
                  onClick={() => onEdit(txn)}
                  sx={{ py: { xs: 1.5, sm: 2 }, px: { xs: 2, sm: 3 } }}
                >
                  <ListItemIcon sx={{ minWidth: { xs: 40, sm: 48 } }}>
                    <ReceiptIcon
                      color={txn.type === 'Income' ? 'success' : 'error'}
                      sx={{ fontSize: { xs: 20, sm: 24 } }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box
                        component="span"
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.75,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Typography
                          component="span"
                          variant="body1"
                          fontWeight="medium"
                          sx={{
                            fontSize: { xs: '0.875rem', sm: '1rem' },
                            pr: { xs: 4, sm: 6 },
                          }}
                        >
                          {txn.description || 'No description'}
                        </Typography>
                        <Chip
                          label={txn.type}
                          size="small"
                          color={txn.type === 'Income' ? 'success' : 'error'}
                          sx={{ height: 20, fontSize: '0.6875rem' }}
                        />
                      </Box>
                    }
                    secondary={
                      <Box component="span">
                        <Typography
                          component="span"
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            fontSize: { xs: '0.75rem', sm: '0.8125rem' },
                            display: 'block',
                          }}
                        >
                          {getCategoryName(txn.categoryId)} • {getAccountName(txn.accountId)}
                        </Typography>
                        <Typography
                          component="span"
                          variant="body2"
                          sx={{
                            fontSize: { xs: '0.75rem', sm: '0.8125rem' },
                            display: 'block',
                            fontWeight: 'medium',
                            color: txn.type === 'Income' ? 'success.main' : 'error.main',
                          }}
                        >
                          {txn.type === 'Income' ? '+' : '-'}
                          {formatCurrency(Math.abs(Number(txn.amount)), txn.currency)}
                          {' • '}
                          <Typography component="span" color="text.secondary">
                            {txn.date}
                          </Typography>
                        </Typography>
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(txn.tempId);
                      }}
                      size="small"
                      color="error"
                      sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItemButton>
                {index < transactions.length - 1 && <Divider />}
              </Box>
            ))}
          </List>
        )}

        {/* Add Transaction Button */}
        {transactions.length > 0 && (
          <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={onAdd}
              sx={{ textTransform: 'none' }}
            >
              Add Another Transaction
            </Button>
          </Box>
        )}
      </DialogContent>

      {/* Action Buttons */}
      <Box
        sx={{
          flexShrink: 0,
          p: { xs: 1.5, sm: 2 },
          borderTop: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Button
          onClick={onCancel}
          disabled={isSubmitting}
          size={isMobile ? 'medium' : 'medium'}
          sx={{
            textTransform: 'none',
            flex: 1,
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={onBack}
          variant="outlined"
          disabled={isSubmitting}
          size={isMobile ? 'medium' : 'medium'}
          sx={{
            textTransform: 'none',
            flex: 1,
          }}
        >
          Back
        </Button>
        <Button
          onClick={onSubmit}
          variant="contained"
          disabled={isSubmitting || transactions.length === 0}
          size={isMobile ? 'medium' : 'medium'}
          startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{
            textTransform: 'none',
            flex: 1,
          }}
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </Button>
      </Box>
    </Box>
  );
}

export default BatchTransactionEdit;

