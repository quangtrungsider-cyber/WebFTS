import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { useAuth } from '../../auth/AuthProvider';

export const UnauthorizedPage: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Box 
      sx={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5'
      }}
    >
      <Card sx={{ maxWidth: 500, width: '100%', p: 3, textAlign: 'center', boxShadow: 3 }}>
        <CardContent>
          <i className="fa-solid fa-circle-exclamation" style={{ fontSize: '64px', color: '#d32f2f', marginBottom: '16px' }}></i>
          <Typography variant="h5" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
            Access Denied / Không có quyền truy cập
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            You do not have permission to access this page or perform this action.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Bạn không có quyền truy cập trang hoặc thao tác này.
          </Typography>
          
          <Box sx={{ mt: 4, display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button variant="contained" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </Button>
            <Button variant="outlined" color="error" onClick={handleLogout}>
              Logout
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
