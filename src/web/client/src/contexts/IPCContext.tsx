import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import WebSocketService from '../services/WebSocketService';
import { ElectronIPCService } from '../services/ElectronIPCService';
import { BaseRPCService } from '../../../../shared/BaseRPCService';
import { useSnackbar } from './SnackbarContext';

const IPCContext = createContext<BaseRPCService | null>(null);

export const IPCProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [ipcService, setIpcService] = useState<BaseRPCService>((window as any).electron
  ? new ElectronIPCService()
  : new WebSocketService());
  const { showSnackbar } = useSnackbar();

  // Initialize IPC service
  useEffect(() => {
    ipcService.setupRPC();
  }, []);

  if (!ipcService) {
    return null; // Or loading spinner
  }

  return (
    <IPCContext.Provider value={ipcService}>
      {children}
    </IPCContext.Provider>
  );
};

export const useIPCService = () => {
  const context = useContext(IPCContext);
  if (!context) {
    throw new Error('useIPCService must be used within an IPCProvider');
  }
  return context;
};
