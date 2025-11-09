// Verification.tsx
// Responsibility: Display verification code and verify user's Roblox profile.

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Box,
  Button,
  Typography,
  Paper,
  Alert,
  CircularProgress,
  Container,
  Divider,
  IconButton,
  Snackbar,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

interface RobloxUser {
  id: number;
  name: string;
  display_name: string;
}

interface VerificationProps {
  user: RobloxUser;
  onVerified: () => void;
  onBack: () => void;
}

const Verification: React.FC<VerificationProps> = ({ user, onVerified, onBack }) => {
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const { login } = useAuth();

  useEffect(() => {
    generateCode();
  }, []);

  const generateCode = async () => {
    try {
      const code = await invoke<string>('generate_verification_code');
      setVerificationCode(code);
    } catch (err) {
      setError('Failed to generate verification code');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(verificationCode);
    setCopySuccess(true);
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    setError(null);

    try {
      const verified = await invoke<boolean>('verify_user', {
        userId: user.id,
        username: user.name,
        displayName: user.display_name,
        verificationCode,
      });

      if (verified) {
        // Login successful
        login({
          user_id: user.id,
          username: user.name,
          display_name: user.display_name,
          roli_verification: null,
        });
        onVerified();
      } else {
        setError(
          'Verification failed. Please make sure you pasted the code exactly in your Roblox profile description.'
        );
      }
    } catch (err) {
      setError(`Verification failed: ${err}`);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          py: 4,
        }}
      >
        <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
          <Typography variant="h4" gutterBottom align="center" sx={{ mb: 2 }}>
            Verify Your Account
          </Typography>

          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Verifying as: <strong>{user.display_name}</strong> (@{user.name})
            </Typography>
          </Alert>

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" gutterBottom>
            Step 1: Copy Verification Code
          </Typography>

          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 3,
              bgcolor: 'grey.50',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography
              variant="body1"
              sx={{
                fontFamily: 'monospace',
                fontWeight: 'bold',
                wordBreak: 'break-word',
                flex: 1,
                // ensure text color is visible (not white)
                color: 'grey',
              }}
            >
              {verificationCode}
            </Typography>
            <IconButton onClick={handleCopy} color="primary" sx={{ ml: 1 }}>
              <CopyIcon />
            </IconButton>
          </Paper>

          <Typography variant="h6" gutterBottom>
            Step 2: Update Your Roblox Profile
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            1. Go to{' '}
            <a
              href="https://www.roblox.com/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#1976d2' }}
            >
              Roblox Profile Settings
            </a>
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            2. Paste the verification code into your <strong>Description</strong> field
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            3. Click <strong>Save</strong> on Roblox, then click <strong>Verify</strong> below
          </Typography>

          <Divider sx={{ my: 3 }} />

          {error && (
            <Alert severity="error" icon={<ErrorIcon />} sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="outlined" onClick={onBack} fullWidth disabled={isVerifying}>
              Back
            </Button>
            <Button
              variant="contained"
              onClick={handleVerify}
              fullWidth
              disabled={isVerifying}
              startIcon={isVerifying ? <CircularProgress size={20} /> : <CheckIcon />}
            >
              {isVerifying ? 'Verifying...' : 'Verify'}
            </Button>
          </Box>
        </Paper>
      </Box>

      <Snackbar
        open={copySuccess}
        autoHideDuration={2000}
        onClose={() => setCopySuccess(false)}
        message="Verification code copied to clipboard!"
      />
    </Container>
  );
};

export default Verification;
