import { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { Box, Drawer, useMediaQuery, useTheme } from '@mui/material';
import Sidebar from './Sidebar';
import Header from './Header';
import { useDataRefresh } from '../../hooks/useDataRefresh';

const DRAWER_WIDTH = 240;
const SWIPE_THRESHOLD = 50; // Minimum distance in pixels to trigger swipe
const SWIPE_VELOCITY_THRESHOLD = 0.3; // Minimum velocity to trigger swipe

function AppLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const touchStartRef = useRef(null);
  const touchEndRef = useRef(null);

  // Handle data refresh (focus, periodic, reactive)
  useDataRefresh();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  // Swipe gesture handlers
  useEffect(() => {
    if (!isMobile) return;

    const handleTouchStart = (e) => {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    };

    const handleTouchMove = (e) => {
      touchEndRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    };

    const handleTouchEnd = () => {
      if (!touchStartRef.current || !touchEndRef.current) return;

      const start = touchStartRef.current;
      const end = touchEndRef.current;

      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const deltaTime = end.time - start.time;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const velocity = distance / deltaTime;

      // Check if it's a horizontal swipe (more horizontal than vertical)
      const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);

      // Swipe right: positive deltaX, sufficient distance, horizontal, from anywhere on screen
      if (
        isHorizontalSwipe &&
        deltaX > SWIPE_THRESHOLD &&
        velocity > SWIPE_VELOCITY_THRESHOLD &&
        !mobileOpen
      ) {
        setMobileOpen(true);
      }

      // Reset touch refs
      touchStartRef.current = null;
      touchEndRef.current = null;
    };

    const mainContent = document.querySelector('[data-main-content]');
    if (mainContent) {
      mainContent.addEventListener('touchstart', handleTouchStart, {
        passive: true,
      });
      mainContent.addEventListener('touchmove', handleTouchMove, {
        passive: true,
      });
      mainContent.addEventListener('touchend', handleTouchEnd, {
        passive: true,
      });
    }

    return () => {
      if (mainContent) {
        mainContent.removeEventListener('touchstart', handleTouchStart);
        mainContent.removeEventListener('touchmove', handleTouchMove);
        mainContent.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [isMobile, mobileOpen]);

  return (
    <Box sx={{ display: 'flex' }}>
      <Header onMenuClick={handleDrawerToggle} />
      <Box
        component="nav"
        sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
            },
          }}
        >
          <Sidebar onClose={handleDrawerToggle} />
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
            },
          }}
          open
        >
          <Sidebar />
        </Drawer>
      </Box>
      <Box
        component="main"
        data-main-content
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, sm: 2, md: 3 },
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          minHeight: '100vh',
          backgroundColor: theme.palette.background.default,
          mt: { xs: '56px', sm: '64px' }, // Account for fixed AppBar height (56px on mobile, 64px on desktop)
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}

export default AppLayout;
