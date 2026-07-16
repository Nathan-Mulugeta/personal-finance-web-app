import { useNavigate, useLocation } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AssessmentIcon from '@mui/icons-material/Assessment';
import MenuIcon from '@mui/icons-material/Menu';

const NAV_ITEMS = [
  { label: 'Home', icon: <HomeIcon />, path: '/home' },
  { label: 'Transactions', icon: <ReceiptIcon />, path: '/transactions' },
  { label: 'Budgets', icon: <AccountBalanceWalletIcon />, path: '/budgets' },
  { label: 'Reports', icon: <AssessmentIcon />, path: '/reports' },
];

const MORE_VALUE = '__more__';

function BottomNav({ onMoreClick }) {
  const navigate = useNavigate();
  const location = useLocation();

  const currentValue = NAV_ITEMS.some((item) => item.path === location.pathname)
    ? location.pathname
    : false;

  const handleChange = (event, newValue) => {
    if (newValue === MORE_VALUE) {
      onMoreClick();
      return;
    }
    navigate(newValue);
  };

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
        {NAV_ITEMS.map((item) => (
          <BottomNavigationAction
            key={item.path}
            label={item.label}
            value={item.path}
            icon={item.icon}
            sx={{ minWidth: 'auto', px: 0.5 }}
          />
        ))}
        <BottomNavigationAction
          label="More"
          value={MORE_VALUE}
          icon={<MenuIcon />}
          sx={{ minWidth: 'auto', px: 0.5 }}
        />
      </BottomNavigation>
    </Paper>
  );
}

export default BottomNav;
