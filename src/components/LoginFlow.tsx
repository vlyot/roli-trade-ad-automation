// LoginFlow.tsx
// Responsibility: Orchestrate login and verification steps.

import React, { useState } from 'react';
import Login from './Login';
import Verification from './Verification';

interface RobloxUser {
  id: number;
  name: string;
  display_name: string;
}

interface LoginFlowProps {
  onLoginComplete: () => void;
}

const LoginFlow: React.FC<LoginFlowProps> = ({ onLoginComplete }) => {
  const [selectedUser, setSelectedUser] = useState<RobloxUser | null>(null);

  const handleUserSelected = (user: RobloxUser) => {
    setSelectedUser(user);
  };

  const handleVerified = () => {
    onLoginComplete();
  };

  const handleBack = () => {
    setSelectedUser(null);
  };

  if (selectedUser) {
    return <Verification user={selectedUser} onVerified={handleVerified} onBack={handleBack} />;
  }

  return <Login onUserSelected={handleUserSelected} />;
};

export default LoginFlow;
