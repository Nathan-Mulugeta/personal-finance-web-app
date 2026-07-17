import { useNavigate, useLocation } from 'react-router-dom';
import {
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Paper,
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AddIcon from '@mui/icons-material/Add';

const LEFT_ITEMS = [
  { label: 'Home', icon: <HomeIcon />, path: '/home' },
  { label: 'Transactions', icon: <ReceiptIcon />, path: '/transactions' },
];
const RIGHT_ITEMS = [
  { label: 'Accounts', icon: <AccountBalanceIcon />, path: '/accounts' },
  { label: 'Reports', icon: <AssessmentIcon />, path: '/reports' },
];
const NAV_PATHS = [...LEFT_ITEMS, ...RIGHT_ITEMS].map((item) => item.path);

const ADD_VALUE = '__add__';

function BottomNav({ onQuickAdd }) {
  const navigate = useNavigate();
  const location = useLocation();

  const currentValue = NAV_PATHS.includes(location.pathname)
    ? location.pathname
    : false;

  const handleChange = (event, newValue) => {
    if (newValue === ADD_VALUE) {
      onQuickAdd();
      return;
    }
    navigate(newValue);
  };

  const navAction = (item) => (
    <BottomNavigationAction
      key={item.path}
      label={item.label}
      value={item.path}
      icon={item.icon}
      sx={{ minWidth: 'auto', px: 0.5 }}
    />
  );

  return (
    <Paper
      elevation={8}
      square
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        display: { xs: 'block', md: 'none' },
        zIndex: (theme) => theme.zIndex.appBar,
        pb: 'env(safe-area-inset-bottom)',
      }}
    >
      <BottomNavigation value={currentValue} onChange={handleChange} showLabels={false}>
        {LEFT_ITEMS.map(navAction)}
        {/* Global quick-add: one tap to a new transaction from any page */}
        <BottomNavigationAction
          aria-label="Add transaction"
          value={ADD_VALUE}
          icon={
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: 'primary.main',
                color: 'primary.contrastText',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AddIcon sx={{ fontSize: 24 }} />
            </Box>
          }
          sx={{ minWidth: 'auto', px: 0.5 }}
        />
        {RIGHT_ITEMS.map(navAction)}
      </BottomNavigation>
    </Paper>
  );
}

export default BottomNav;
