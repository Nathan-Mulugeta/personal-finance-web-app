import { useState, useRef } from 'react';
import { useSelector } from 'react-redux';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Alert,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import { parseReceipt } from '../../lib/api/aiParsing';

/**
 * Receipt Capture Dialog
 * Allows users to capture a receipt photo via camera or select from gallery.
 * Sends the image to AI for parsing and returns structured transaction data.
 */
function ReceiptCaptureDialog({ open, onClose, onParsed }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Get categories from Redux for AI matching
  const { categories } = useSelector((state) => state.categories);

  // State
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  // Refs
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // Reset state on close
  const handleClose = () => {
    if (!isProcessing) {
      setPreviewImage(null);
      setError(null);
      onClose();
    }
  };

  // Convert file to base64
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  // Handle image selection
  const handleImageSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be selected again
    event.target.value = '';

    try {
      setError(null);
      setIsProcessing(true);

      // Convert to base64 for preview and API
      const base64 = await fileToBase64(file);
      setPreviewImage(base64);

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
      const result = await parseReceipt(base64, activeCategories);

      if (result.success) {
        // Pass parsed data to parent
        onParsed({
          ...result,
          type: 'receipt',
        });
        handleClose();
      } else {
        setError(result.error || 'Failed to parse receipt');
      }
    } catch (err) {
      console.error('Error processing receipt:', err);
      setError(err?.message || 'Failed to process receipt. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Open camera
  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  // Open gallery
  const handleGalleryClick = () => {
    galleryInputRef.current?.click();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
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
      <DialogTitle>Scan Receipt</DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Hidden file inputs */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={cameraInputRef}
          onChange={handleImageSelected}
          style={{ display: 'none' }}
        />
        <input
          type="file"
          accept="image/*"
          ref={galleryInputRef}
          onChange={handleImageSelected}
          style={{ display: 'none' }}
        />

        {/* Processing state */}
        {isProcessing ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              py: 4,
            }}
          >
            {previewImage && (
              <Box
                component="img"
                src={previewImage}
                alt="Receipt preview"
                sx={{
                  maxWidth: '100%',
                  maxHeight: 200,
                  objectFit: 'contain',
                  borderRadius: 1,
                  mb: 2,
                  opacity: 0.7,
                }}
              />
            )}
            <CircularProgress size={40} sx={{ mb: 2 }} />
            <Typography color="text.secondary">
              Analyzing receipt...
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              This may take a few seconds
            </Typography>
          </Box>
        ) : (
          /* Capture options */
          <Box sx={{ py: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
              Take a photo of your receipt or select an image from your device
            </Typography>

            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <Button
                variant="contained"
                size="large"
                startIcon={<CameraAltIcon />}
                onClick={handleCameraClick}
                sx={{
                  py: 2,
                  fontSize: '1rem',
                }}
              >
                Take Photo
              </Button>

              <Button
                variant="outlined"
                size="large"
                startIcon={<PhotoLibraryIcon />}
                onClick={handleGalleryClick}
                sx={{
                  py: 2,
                  fontSize: '1rem',
                }}
              >
                Choose from Gallery
              </Button>
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button onClick={handleClose} disabled={isProcessing}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ReceiptCaptureDialog;

