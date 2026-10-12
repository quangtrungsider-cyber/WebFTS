import React, { useState, useEffect } from 'react';
import { Box, Button, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip } from '@mui/material';
import { useAuth } from '../../auth/AuthProvider';

interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: string;
}

export const UserManagementTab: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { hasPermission } = useAuth();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error('Failed to fetch users', e);
    } finally {
      setLoading(false);
    }
  };

  const getRoleColor = (role: string) => {
    switch(role) {
      case 'admin': return 'error';
      case 'analyst': return 'primary';
      case 'reviewer': return 'secondary';
      case 'viewer': return 'default';
      case 'demo': return 'warning';
      default: return 'default';
    }
  };

  if (!hasPermission('users.read')) {
    return <Typography color="error">You do not have permission to view users.</Typography>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h6">User Management</Typography>
        {hasPermission('users.create') && (
          <Button variant="contained" color="primary">Add User</Button>
        )}
      </Box>

      <TableContainer component={Paper} sx={{ backgroundColor: '#1e1e1e', border: '1px solid #333' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#aaa', borderColor: '#333' }}>Username</TableCell>
              <TableCell sx={{ color: '#aaa', borderColor: '#333' }}>Display Name</TableCell>
              <TableCell sx={{ color: '#aaa', borderColor: '#333' }}>Email</TableCell>
              <TableCell sx={{ color: '#aaa', borderColor: '#333' }}>Role</TableCell>
              <TableCell sx={{ color: '#aaa', borderColor: '#333' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ color: '#fff', borderColor: '#333' }}>Loading...</TableCell>
              </TableRow>
            ) : users.map((u) => (
              <TableRow key={u.id}>
                <TableCell sx={{ color: '#fff', borderColor: '#333' }}>{u.username}</TableCell>
                <TableCell sx={{ color: '#fff', borderColor: '#333' }}>{u.displayName}</TableCell>
                <TableCell sx={{ color: '#fff', borderColor: '#333' }}>{u.email}</TableCell>
                <TableCell sx={{ borderColor: '#333' }}>
                  <Chip label={u.role} color={getRoleColor(u.role) as any} size="small" />
                </TableCell>
                <TableCell sx={{ borderColor: '#333' }}>
                  {hasPermission('users.update') && (
                    <Button size="small" variant="outlined" sx={{ mr: 1 }}>Edit</Button>
                  )}
                  {hasPermission('users.delete') && u.username !== 'admin' && (
                    <Button size="small" variant="outlined" color="error">Delete</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
