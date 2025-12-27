import { useNavigate, useLocation } from 'react-router-dom';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CategoryIcon from '@mui/icons-material/Category';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PeopleIcon from '@mui/icons-material/People';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SettingsIcon from '@mui/icons-material/Settings';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';

const menuItems = [
  { text: 'Home', icon: <HomeIcon />, path: '/home' },
  { text: 'Transactions', icon: <ReceiptIcon />, path: '/transactions' },
  { text: 'Accounts', icon: <AccountBalanceIcon />, path: '/accounts' },
  { text: 'Categories', icon: <CategoryIcon />, path: '/categories' },
  { text: 'Budgets', icon: <AccountBalanceWalletIcon />, path: '/budgets' },
  {
    text: 'Borrowings/Lendings',
    icon: <PeopleIcon />,
    path: '/borrowings-lendings',
  },
  { text: 'Reports', icon: <AssessmentIcon />, path: '/reports' },
  {
    text: 'Exchange Rates',
    icon: <CurrencyExchangeIcon />,
    path: '/exchange-rates',
  },
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

function Sidebar({ onClose }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = (path) => {
    navigate(path);
    if (onClose) {
      onClose();
    }
  };

  return (
    <div>
      <Toolbar />
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => handleNavigation(item.path)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </div>
  );
}

export default Sidebar;
