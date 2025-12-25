import { Alert, AlertTitle } from '@mui/material'

function ErrorMessage({ error, title = 'Error' }) {
  if (!error) return null

  return (
    <Alert severity="error" sx={{ mb: 2 }}>
      <AlertTitle>{title}</AlertTitle>
      {typeof error === 'string' ? error : error.message || 'An error occurred'}
    </Alert>
  )
}

export default ErrorMessage

