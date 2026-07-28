import { useState, useRef, useMemo } from 'react';
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
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import RefreshIcon from '@mui/icons-material/Refresh';
import { parseReceipt, isAIConfigured } from '../../lib/api/aiParsing';
import { compressImage } from '../../utils/imageCompression';

/**
 * Receipt Capture Dialog
 * A compact modal to add a receipt photo (camera or gallery), downscale it, and
 * send it to the AI for parsing. The captured image is kept, so a scan can be
 * retried or cancelled without re-uploading. Returns structured transaction
 * data via onParsed.
 */
function ReceiptCaptureDialog({ open, onClose, onParsed }) {
  const { categories } = useSelector((state) => state.categories);
  const { settings } = useSelector((state) => state.settings);

  const aiApiKey = useMemo(() => {
    const groqSetting = settings.find((s) => s.setting_key === 'GroqAPIKey');
    const legacySetting = settings.find((s) => s.setting_key === 'GeminiAPIKey');
    return groqSetting?.setting_value || legacySetting?.setting_value || '';
  }, [settings]);

  // Categories the AI is allowed to choose from
  const activeCategories = useMemo(
    () =>
      categories
        .filter((cat) => cat.status === 'Active')
        .map((cat) => ({
          category_id: cat.category_id,
          name: cat.name,
          type: cat.type,
          parent_category_id: cat.parent_category_id,
        })),
    [categories],
  );

  // The captured image is held (as a data URL) so a failed/cancelled scan can be
  // retried without re-uploading.
  const [capturedImage, setCapturedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const abortRef = useRef(null);

  const runScan = async (image) => {
    if (!isAIConfigured(aiApiKey)) {
      setError('AI API key not configured. Please add your API key in Settings.');
      return;
    }
    setError(null);
    setIsProcessing(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await parseReceipt(
        image,
        activeCategories,
        aiApiKey,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (result.success) {
        onParsed({ ...result, type: 'receipt' });
        reset();
        onClose();
      } else {
        setError(result.error || 'Failed to parse receipt');
      }
    } catch (err) {
      // A cancel isn't a failure — just fall back to the retry view.
      if (err?.name === 'AbortError' || controller.signal.aborted) return;
      console.error('Error processing receipt:', err);
      setError(err?.message || 'Failed to process receipt. Please try again.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsProcessing(false);
    }
  };

  const handleImageSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = ''; // let the same file be picked again

    if (!isAIConfigured(aiApiKey)) {
      setError('AI API key not configured. Please add your API key in Settings.');
      return;
    }

    try {
      const dataUrl = await compressImage(file);
      setCapturedImage(dataUrl);
      runScan(dataUrl);
    } catch {
      setError('Could not read that image. Please try another.');
    }
  };

  const reset = () => {
    setCapturedImage(null);
    setError(null);
    setIsProcessing(false);
  };

  const cancelScan = () => {
    abortRef.current?.abort();
  };

  const chooseDifferent = () => {
    abortRef.current?.abort();
    reset();
  };

  const handleClose = () => {
    abortRef.current?.abort();
    reset();
    onClose();
  };

  const options = [
    {
      key: 'camera',
      icon: CameraAltIcon,
      label: 'Take Photo',
      onClick: () => cameraInputRef.current?.click(),
    },
    {
      key: 'gallery',
      icon: PhotoLibraryIcon,
      label: 'Gallery',
      onClick: () => galleryInputRef.current?.click(),
    },
  ];

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>Scan Receipt</DialogTitle>

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

        {isProcessing ? (
          /* Analyzing */
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              py: 3,
            }}
          >
            {capturedImage && (
              <Box
                component="img"
                src={capturedImage}
                alt="Receipt preview"
                sx={{
                  maxWidth: '100%',
                  maxHeight: 180,
                  objectFit: 'contain',
                  borderRadius: 2,
                  mb: 2,
                  opacity: 0.7,
                }}
              />
            )}
            <CircularProgress size={36} sx={{ mb: 2 }} />
            <Typography color="text.secondary">Analyzing receipt…</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              This may take a few seconds
            </Typography>
          </Box>
        ) : capturedImage ? (
          /* Scan finished without success (failed or cancelled) — offer retry */
          <Box sx={{ pt: 1 }}>
            <Box
              component="img"
              src={capturedImage}
              alt="Receipt preview"
              sx={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: 200,
                objectFit: 'contain',
                borderRadius: 2,
                mx: 'auto',
                mb: 2,
              }}
            />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Button
                variant="contained"
                startIcon={<RefreshIcon />}
                onClick={() => runScan(capturedImage)}
                sx={{ py: 1.25, textTransform: 'none' }}
              >
                Retry scan
              </Button>
              <Button
                variant="text"
                onClick={chooseDifferent}
                sx={{ textTransform: 'none' }}
              >
                Choose a different photo
              </Button>
            </Box>
          </Box>
        ) : (
          /* Capture options — two modern tiles */
          <Box sx={{ pt: 1 }}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2, textAlign: 'center' }}
            >
              Add a receipt to pull out its transactions automatically
            </Typography>

            <Box sx={{ display: 'flex', gap: 1.5 }}>
              {options.map(({ key, icon: Icon, label, onClick }) => (
                <Box
                  key={key}
                  onClick={onClick}
                  role="button"
                  tabIndex={0}
                  sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1.25,
                    py: 2.5,
                    px: 1,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    cursor: 'pointer',
                    textAlign: 'center',
                    WebkitTapHighlightColor: 'transparent',
                    transition:
                      'border-color 0.15s ease, background-color 0.15s ease',
                    '@media (hover: hover)': {
                      '&:hover': {
                        borderColor: 'primary.main',
                        backgroundColor: 'action.hover',
                      },
                    },
                    '&:active': { backgroundColor: 'action.selected' },
                  }}
                >
                  <Box
                    sx={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'primary.main',
                      bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
                    }}
                  >
                    <Icon />
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions
        sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}
      >
        {isProcessing ? (
          <Button onClick={cancelScan} sx={{ textTransform: 'none' }}>
            Cancel scan
          </Button>
        ) : (
          <Button onClick={handleClose} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default ReceiptCaptureDialog;
