import { useState, useEffect } from 'react';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, Typography } from '@mui/material';
import { InstallDesktop } from '@mui/icons-material';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    }
    
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Optionally store dismissal in localStorage to not show again
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  // Don't show if already dismissed or already installed
  if (!showPrompt || localStorage.getItem('pwa-install-dismissed')) {
    return null;
  }

  return (
    <Dialog open={showPrompt} onClose={handleDismiss}>
      <DialogTitle>Install App</DialogTitle>
      <DialogContent>
        <Typography>
          Install this app on your device for a better experience. It will work offline and load faster!
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleDismiss}>Not Now</Button>
        <Button 
          onClick={handleInstall} 
          variant="contained" 
          startIcon={<InstallDesktop />}
        >
          Install
        </Button>
      </DialogActions>
    </Dialog>
  );
}

