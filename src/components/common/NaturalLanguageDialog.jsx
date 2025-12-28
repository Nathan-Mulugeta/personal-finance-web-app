import { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  Alert,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { parseNaturalLanguage } from '../../lib/api/aiParsing';

/**
 * Natural Language Transaction Dialog
 * Allows users to enter transaction descriptions in plain text
 * and have them parsed into structured transactions by AI.
 */
function NaturalLanguageDialog({ open, onClose, onParsed }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const inputRef = useRef(null);

  // Get categories from Redux for AI matching
  const { categories } = useSelector((state) => state.categories);

  // State
  const [text, setText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  // Reset state on close
  const handleClose = () => {
    if (!isProcessing) {
      setText('');
      setError(null);
      onClose();
    }
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!text.trim()) {
      setError('Please enter a description');
      return;
    }

    try {
      setError(null);
      setIsProcessing(true);

      // Prepare categories for AI
      const activeCategories = categories
        .filter((cat) => cat.status === 'Active')
        .map((cat) => ({
          category_id: cat.category_id,
          name: cat.name,
          type: cat.type,
          parent_category_id: cat.parent_category_id,
        }));

      // Call AI parsing API
      const result = await parseNaturalLanguage(text.trim(), activeCategories);

      if (result.success) {
        // Pass parsed data to parent
        onParsed({
          ...result,
          type: 'text',
        });
        handleClose();
      } else {
        setError(result.error || 'Failed to parse text');
      }
    } catch (err) {
      console.error('Error parsing text:', err);
      setError(err?.message || 'Failed to parse text. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle enter key
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: isMobile
          ? {
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
            }
          : {},
      }}
    >
      <DialogTitle>Add Transactions</DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box sx={{ py: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Describe your transactions in plain language. For example:
          </Typography>
          
          <Box
            sx={{
              backgroundColor: 'action.hover',
              borderRadius: 1,
              p: 1.5,
              mb: 3,
            }}
          >
            <Typography variant="body2" component="div" sx={{ fontStyle: 'italic' }}>
              • "Spent $50 on groceries and $15 on coffee"<br />
              • "Got paid $2000 salary"<br />
              • "Lunch at restaurant $25, taxi home $10"
            </Typography>
          </Box>

          <TextField
            inputRef={inputRef}
            fullWidth
            multiline
            rows={4}
            placeholder="Enter your transactions..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            sx={{
              '& .MuiInputBase-input': {
                fontSize: '1rem',
              },
            }}
          />

          {isProcessing && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mt: 2,
                color: 'text.secondary',
              }}
            >
              <CircularProgress size={16} />
              <Typography variant="body2">Parsing transactions...</Typography>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button onClick={handleClose} disabled={isProcessing}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isProcessing || !text.trim()}
          startIcon={isProcessing ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
        >
          {isProcessing ? 'Processing...' : 'Parse'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default NaturalLanguageDialog;

