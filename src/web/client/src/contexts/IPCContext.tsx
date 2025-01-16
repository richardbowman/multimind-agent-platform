import React, { createContext, useContext, useMemo } from 'react';
import WebSocketService from '../services/WebSocketService';
import { ElectronIPCService } from '../services/ElectronIPCService';
import { BaseRPCService } from '../../../../shared/BaseRPCService';
import { createClientMethods } from '../services/ClientMethods';
import { DataContextMethods } from './DataContext';
import { useSnackbar } from './SnackbarContext';

const IPCContext = createContext<BaseRPCService | null>(null);

export const IPCProvider: React.FC<{
  children: React.ReactNode;
  contextMethods: DataContextMethods;
}> = ({ children, contextMethods }) => {
  const { showSnackbar } = useSnackbar();
  
  const clientMethods = useMemo(() => 
    createClientMethods(contextMethods, showSnackbar),
    [contextMethods, showSnackbar]
  );

  const ipcService = useMemo(() => {
    const service = (window as any).electron
      ? new ElectronIPCService(clientMethods)
      : new WebSocketService(clientMethods);
      
    // Ensure context methods are properly bound
    service.setupRPC();
    return service;
  }, [clientMethods]);

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
