import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  TextField,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { keyframes } from '@emotion/react';
import { useAuth } from '../../auth/AuthProvider';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const blipPulse = keyframes`
  0% { transform: scale(0.6); opacity: 0.9; }
  70% { transform: scale(2.4); opacity: 0; }
  100% { transform: scale(2.4); opacity: 0; }
`;

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

interface Blip {
  top: string;
  left: string;
  delay: string;
}

const BLIPS: Blip[] = [
  { top: '30%', left: '62%', delay: '0s' },
  { top: '58%', left: '38%', delay: '1.3s' },
  { top: '68%', left: '70%', delay: '2.6s' },
  { top: '22%', left: '35%', delay: '3.4s' },
];

const DEMO_ACCOUNTS = [
  { role: 'Admin', username: 'admin', password: 'admin123' },
  { role: 'Analyst', username: 'analyst', password: 'analyst123' },
  { role: 'Demo', username: 'demo', password: 'demo123' },
];

const FEATURES = ['Real-time VATM engine', 'AIXM 5.1 procedures', 'KPI & capacity analysis'];

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isDemoEnv = true; // Always show demo credentials for now

  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as any)?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Invalid username or password');
        setIsLoading(false);
        return;
      }

      login(data.token, data.user, rememberMe);
      const from = (location.state as any)?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      setError('A network error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  const fillDemo = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  const darkFieldSx = {
    '& .MuiInputLabel-root': { color: '#8a8f98' },
    '& .MuiInputLabel-root.Mui-focused': { color: '#64b5f6' },
    '& .MuiOutlinedInput-root': {
      color: '#fff',
      backgroundColor: '#20242c',
      borderRadius: 1.5,
      '& fieldset': { borderColor: '#3a4049' },
      '&:hover fieldset': { borderColor: '#6b7280' },
      '&.Mui-focused fieldset': { borderColor: '#1976d2' },
      '& input:-webkit-autofill': {
        WebkitBoxShadow: '0 0 0 1000px #20242c inset !important',
        WebkitTextFillColor: '#fff !important',
        caretColor: '#fff !important',
        borderRadius: 'inherit',
      },
    },
    '& .MuiInputBase-input': {
      color: '#fff',
    }
  };

  return (
    <Box sx={{ height: '100vh', width: '100vw', display: 'flex', overflow: 'hidden', bgcolor: '#101318' }}>
      {/* LEFT — simulation / radar visual */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flex: '1 1 56%',
          position: 'relative',
          overflow: 'hidden',
          background: 'radial-gradient(circle at 30% 20%, #0f2b4a 0%, #071a2f 55%, #050e1a 100%)',
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: 6,
        }}
      >
        {/* subtle grid overlay */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(100,181,246,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(100,181,246,0.06) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            pointerEvents: 'none',
          }}
        />

        {/* Header brand */}
        <Box sx={{ display: 'flex', alignItems: 'center', zIndex: 2 }}>
          <i
            className="fa-solid fa-plane-departure"
            style={{ fontSize: 28, color: '#64b5f6', marginRight: 12 }}
          />
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700, letterSpacing: 0.5 }}>
            WebFTS
          </Typography>
        </Box>

        {/* Radar visualization */}
        <Box sx={{ position: 'relative', alignSelf: 'center', width: 380, height: 380, zIndex: 1 }}>
          <svg viewBox="0 0 400 400" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
            {[180, 140, 100, 60].map((r) => (
              <circle
                key={r}
                cx={200}
                cy={200}
                r={r}
                fill="none"
                stroke="rgba(100,181,246,0.18)"
                strokeWidth={1}
              />
            ))}
            <line x1={200} y1={20} x2={200} y2={380} stroke="rgba(100,181,246,0.12)" strokeWidth={1} />
            <line x1={20} y1={200} x2={380} y2={200} stroke="rgba(100,181,246,0.12)" strokeWidth={1} />

            {/* flight paths */}
            <path
              id="loginPath1"
              d="M 60 300 C 140 180, 260 220, 350 90"
              fill="none"
              stroke="rgba(100,181,246,0.25)"
              strokeWidth={1.2}
              strokeDasharray="4 5"
            />
            <path
              id="loginPath2"
              d="M 40 120 C 130 240, 250 160, 360 260"
              fill="none"
              stroke="rgba(100,181,246,0.25)"
              strokeWidth={1.2}
              strokeDasharray="4 5"
            />

            <circle r={4} fill="#64b5f6">
              <animateMotion dur="7s" repeatCount="indefinite" rotate="auto">
                <mpath xlinkHref="#loginPath1" />
              </animateMotion>
            </circle>
            <circle r={4} fill="#90caf9">
              <animateMotion dur="9s" repeatCount="indefinite" rotate="auto">
                <mpath xlinkHref="#loginPath2" />
              </animateMotion>
            </circle>
          </svg>

          {/* rotating radar sweep */}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'conic-gradient(from 0deg, rgba(100,181,246,0.4), transparent 70deg)',
              animation: `${spin} 4s linear infinite`,
            }}
          />

          {/* blips */}
          {BLIPS.map((b, i) => (
            <Box key={i} sx={{ position: 'absolute', top: b.top, left: b.left }}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: '#64b5f6',
                  boxShadow: '0 0 8px 2px rgba(100,181,246,0.8)',
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  top: -3,
                  left: -3,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: '1px solid rgba(100,181,246,0.8)',
                  animation: `${blipPulse} 2.6s ease-out infinite`,
                  animationDelay: b.delay,
                }}
              />
            </Box>
          ))}
        </Box>

        {/* Footer copy */}
        <Box sx={{ zIndex: 2 }}>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600, mb: 1, maxWidth: 420 }}>
            Fast-time simulation for Vietnam's airspace.
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', maxWidth: 420 }}>
            Powered by the VATM engine, WebFTS models traffic demand, AIXM procedures, sector
            workload and airspace capacity to support data-driven operational planning.
          </Typography>
          <Box sx={{ display: 'flex', gap: 3, mt: 3, flexWrap: 'wrap' }}>
            {FEATURES.map((t) => (
              <Box key={t} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <i className="fa-solid fa-circle-check" style={{ color: '#64b5f6', fontSize: 12 }} />
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)' }}>
                  {t}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* RIGHT — login form */}
      <Box
        sx={{
          flex: { xs: '1 1 100%', md: '1 1 44%' },
          display: 'flex',
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'center',
          bgcolor: '#161a20',
          p: 3,
          overflowY: 'auto',
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 400,
            mt: { xs: 4, md: 0 },
            p: { xs: 3, sm: 4 },
            borderRadius: 3,
            bgcolor: { xs: '#1c2027', md: 'transparent' },
            border: { xs: '1px solid #2a2f38', md: 'none' },
            animation: `${fadeInUp} 0.5s ease-out`,
          }}
        >
          <Box
            sx={{
              display: { xs: 'flex', md: 'none' },
              alignItems: 'center',
              justifyContent: 'center',
              mb: 3,
            }}
          >
            <i
              className="fa-solid fa-plane-departure"
              style={{ fontSize: 32, color: '#1976d2', marginRight: 10 }}
            />
            <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700 }}>
              WebFTS
            </Typography>
          </Box>

          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700, mb: 0.5 }}>
            Welcome back
          </Typography>
          <Typography variant="body2" sx={{ color: '#8a8f98', mb: 4 }}>
            Sign in to the VATM Fast-Time Simulation Platform
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Username"
              variant="outlined"
              margin="normal"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              sx={darkFieldSx}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <i className="fa-solid fa-user" style={{ fontSize: 14, color: '#8a8f98' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              variant="outlined"
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              sx={darkFieldSx}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <i className="fa-solid fa-lock" style={{ fontSize: 14, color: '#8a8f98' }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((s) => !s)}
                        edge="end"
                        size="small"
                        sx={{ color: '#8a8f98' }}
                      >
                        <i
                          className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}
                          style={{ fontSize: 14 }}
                        />
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  sx={{ color: '#8a8f98', '&.Mui-checked': { color: '#1976d2' } }}
                />
              }
              label={
                <Typography variant="body2" sx={{ color: '#c5c9d1' }}>
                  Remember me
                </Typography>
              }
              sx={{ mt: 1, mb: 1 }}
            />

            <Button
              fullWidth
              type="submit"
              variant="contained"
              size="large"
              disabled={isLoading}
              sx={{
                py: 1.4,
                mt: 1,
                fontWeight: 700,
                borderRadius: 2,
                textTransform: 'none',
                fontSize: '1rem',
                bgcolor: '#1976d2',
                '&:hover': { bgcolor: '#1565c0' },
              }}
            >
              {isLoading ? 'Signing in…' : 'Sign in to WebFTS'}
            </Button>
          </form>

          {isDemoEnv && (
            <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid #2a2f38' }}>
              <Typography variant="caption" sx={{ color: '#6b7280', display: 'block', mb: 1.5 }}>
                Quick demo sign-in
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {DEMO_ACCOUNTS.map((acc) => (
                  <Button
                    key={acc.role}
                    onClick={() => fillDemo(acc.username, acc.password)}
                    size="small"
                    variant="outlined"
                    sx={{
                      flex: 1,
                      textTransform: 'none',
                      color: '#c5c9d1',
                      borderColor: '#2a2f38',
                      '&:hover': { borderColor: '#1976d2', bgcolor: 'rgba(25,118,210,0.08)' },
                    }}
                  >
                    {acc.role}
                  </Button>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
