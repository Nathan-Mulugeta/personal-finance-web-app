import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import App from './App.jsx'
import store, { persistor } from './store'
import LoadingSpinner from './components/common/LoadingSpinner'
import './index.css'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1a73e8', // Google Blue
    },
    secondary: {
      main: '#5f6368', // Google Gray
    },
    success: {
      main: '#1e8e3e', // Google Green
      light: '#e6f4ea', // Google Green background
    },
    error: {
      main: '#d93025', // Google Red
      light: '#fce8e6', // Google Red background
    },
    warning: {
      main: '#e37400', // Google Yellow/Amber
      light: '#fef7e0', // Google Yellow background
    },
    info: {
      main: '#1a73e8', // Google Blue
      light: '#e8f0fe', // Google Blue background
    },
    // Custom Google-style colors for the app
    google: {
      green: '#1e8e3e',
      greenBg: '#e6f4ea',
      red: '#d93025',
      redBg: '#fce8e6',
      yellow: '#e37400',
      yellowBg: '#fef7e0',
      blue: '#1a73e8',
      blueBg: '#e8f0fe',
      gray: '#5f6368',
      grayBg: '#f1f3f4',
      grayLight: '#f8f9fa',
    },
    // Legacy aliases for backwards compatibility
    softRed: {
      main: '#d93025', // Google Red
    },
    softGreen: {
      main: '#1e8e3e', // Google Green
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={<LoadingSpinner fullScreen />} persistor={persistor}>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <App />
          </ThemeProvider>
        </BrowserRouter>
      </PersistGate>
    </Provider>
  </React.StrictMode>,
)

