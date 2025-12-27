import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Alert,
  IconButton,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { fetchCategories } from '../store/slices/categoriesSlice';
import { fetchAccounts } from '../store/slices/accountsSlice';
import { fetchSettings } from '../store/slices/settingsSlice';
import { createTransaction } from '../store/slices/transactionsSlice';
import { flattenCategoryTree } from '../utils/categoryHierarchy';

function QuickAdd() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Get category from URL params
  const categoryFromUrl = searchParams.get('category');
  
  // Redux state
  const { categories, isInitialized: categoriesInitialized } = useSelector(
    (state) => state.categories
  );
  const { accounts, isInitialized: accountsInitialized } = useSelector(
    (state) => state.accounts
  );
  const { settings, isInitialized: settingsInitialized } = useSelector(
    (state) => state.settings
  );
  
  // Local state
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  // Load data on mount
  useEffect(() => {
    if (!categoriesInitialized) {
      dispatch(fetchCategories({ status: 'Active' }));
    }
    if (!accountsInitialized) {
      dispatch(fetchAccounts());
    }
    if (!settingsInitialized) {
      dispatch(fetchSettings());
    }
  }, [dispatch, categoriesInitialized, accountsInitialized, settingsInitialized]);
  
  // Set category from URL when categories are loaded
  useEffect(() => {
    if (categoryFromUrl && categories.length > 0) {
      const foundCategory = categories.find(
        (cat) => cat.category_id === categoryFromUrl
      );
      if (foundCategory) {
        setCategoryId(categoryFromUrl);
      }
    }
  }, [categoryFromUrl, categories]);
  
  // Get quick-add default account from settings
  const defaultAccountId = useMemo(() => {
    const setting = settings.find(
      (s) => s.setting_key === 'QuickAddDefaultAccountId'
    );
    return setting?.setting_value || '';
  }, [settings]);
  
  // Get the default account object
  const defaultAccount = useMemo(() => {
    if (!defaultAccountId) return null;
    return accounts.find(
      (acc) => acc.account_id === defaultAccountId && acc.status === 'Active'
    );
  }, [defaultAccountId, accounts]);
  
  // Get active expense categories with hierarchy
  const expenseCategories = useMemo(() => {
    const activeCategories = categories.filter(
      (cat) => cat.type === 'Expense' && cat.status === 'Active'
    );
    return flattenCategoryTree(activeCategories);
  }, [categories]);
  
  // Check if we're ready to show the form
  const isLoading = !categoriesInitialized || !accountsInitialized || !settingsInitialized;
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    if (!categoryId) {
      setError('Please select a category');
      return;
    }
    
    if (!defaultAccount) {
      setError('No default account configured. Please set one in Settings.');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      await dispatch(
        createTransaction({
          accountId: defaultAccount.account_id,
          categoryId,
          amount: -Math.abs(parseFloat(amount)), // Negative for expenses
          currency: defaultAccount.currency,
          description: description.trim(),
          type: 'Expense',
          status: 'Cleared',
          date: new Date().toISOString().split('T')[0],
        })
      ).unwrap();
      
      setSuccess(true);
      
      // Reset form after brief delay
      setTimeout(() => {
        setAmount('');
        setDescription('');
        setShowDescription(false);
        setSuccess(false);
      }, 1500);
    } catch (err) {
      console.error('Error creating transaction:', err);
      setError(err?.message || 'Failed to add expense. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle "Add Another" after success
  const handleAddAnother = () => {
    setSuccess(false);
    setAmount('');
    setDescription('');
    setShowDescription(false);
  };
  
  // Get category name for display
  const getCategoryName = (catId) => {
    const category = categories.find((cat) => cat.category_id === catId);
    return category?.name || '';
  };
  
  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'background.default',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }
  
  // Success state
  if (success) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'background.default',
          p: 3,
          gap: 3,
        }}
      >
        <CheckCircleIcon sx={{ fontSize: 80, color: 'success.main' }} />
        <Typography variant="h5" fontWeight={600} textAlign="center">
          Expense Added!
        </Typography>
        <Typography variant="body1" color="text.secondary" textAlign="center">
          {defaultAccount?.currency} {Math.abs(parseFloat(amount)).toFixed(2)} - {getCategoryName(categoryId)}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddAnother}
            size="large"
          >
            Add Another
          </Button>
          <Button
            variant="outlined"
            startIcon={<CloseIcon />}
            onClick={() => window.close()}
            size="large"
          >
            Close
          </Button>
        </Box>
      </Box>
    );
  }
  
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.default',
        p: 2,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
        }}
      >
        <Typography variant="h5" fontWeight={600}>
          Quick Add Expense
        </Typography>
        <IconButton onClick={() => navigate('/home')} size="small">
          <CloseIcon />
        </IconButton>
      </Box>
      
      {/* Error message */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      {/* No default account warning */}
      {!defaultAccount && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No default account configured for quick-add.{' '}
          <Button
            size="small"
            onClick={() => navigate('/settings')}
            sx={{ ml: 1 }}
          >
            Configure in Settings
          </Button>
        </Alert>
      )}
      
      <form onSubmit={handleSubmit}>
        {/* Amount Input - Large and prominent */}
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            label="Amount"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoFocus
            InputProps={{
              startAdornment: defaultAccount ? (
                <Typography
                  variant="h6"
                  color="text.secondary"
                  sx={{ mr: 1, fontWeight: 500 }}
                >
                  {defaultAccount.currency}
                </Typography>
              ) : null,
              sx: {
                fontSize: '2rem',
                fontWeight: 600,
                '& input': {
                  textAlign: 'right',
                  fontSize: '2rem',
                  fontWeight: 600,
                  py: 2,
                },
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />
        </Box>
        
        {/* Category Dropdown */}
        <Box sx={{ mb: 3 }}>
          <FormControl fullWidth>
            <InputLabel>Category</InputLabel>
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              label="Category"
              sx={{
                borderRadius: 2,
                '& .MuiSelect-select': {
                  py: 1.5,
                },
              }}
            >
              {expenseCategories.map((category) => (
                <MenuItem
                  key={category.category_id}
                  value={category.category_id}
                  sx={{ pl: category.level ? category.level * 2 + 2 : 2 }}
                >
                  {category.level > 0 && '└ '}
                  {category.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        
        {/* Description toggle and field */}
        <Box sx={{ mb: 3 }}>
          <Button
            variant="text"
            onClick={() => setShowDescription(!showDescription)}
            endIcon={showDescription ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            sx={{ mb: 1, textTransform: 'none' }}
          >
            {showDescription ? 'Hide description' : 'Add description (optional)'}
          </Button>
          <Collapse in={showDescription}>
            <TextField
              fullWidth
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this expense for?"
              multiline
              rows={2}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />
          </Collapse>
        </Box>
        
        {/* Submit button */}
        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          disabled={isSubmitting || !defaultAccount}
          sx={{
            py: 2,
            fontSize: '1.125rem',
            fontWeight: 600,
            borderRadius: 2,
          }}
        >
          {isSubmitting ? (
            <CircularProgress size={24} color="inherit" />
          ) : (
            'Add Expense'
          )}
        </Button>
      </form>
      
      {/* Account info */}
      {defaultAccount && (
        <Typography
          variant="body2"
          color="text.secondary"
          textAlign="center"
          sx={{ mt: 2 }}
        >
          Adding to: {defaultAccount.name} ({defaultAccount.currency})
        </Typography>
      )}
    </Box>
  );
}

export default QuickAdd;

