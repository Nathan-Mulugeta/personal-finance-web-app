import { Alert, AlertTitle } from '@mui/material';

function ErrorMessage({ error, title = 'Error', onClose }) {
  if (!error) return null;

  return (
    <Alert severity="error" sx={{ mb: 2 }} onClose={onClose}>
      <AlertTitle>{title}</AlertTitle>
      {typeof error === 'string' ? error : error.message || 'An error occurred'}
    </Alert>
  );
}

export default ErrorMessage;
