import React, { createContext, useContext, useRef } from 'react';
import WebSocketService from '../services/WebSocketService';
import { ElectronIPCService } from '../services/ElectronIPCService';
import { BaseRPCService } from '../../../../shared/BaseRPCService';

const IPCContext = createContext<BaseRPCService | null>(null);

export const IPCProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const ipcService = useRef<BaseRPCService | null>(null);

  if (!ipcService.current) {
    ipcService.current = (window as any).electron
      ? new ElectronIPCService() :
      (window as any).appContainer ? null : 
      new WebSocketService();
    console.log('IPC service initializing');
  }

  return (
    <IPCContext.Provider value={ipcService.current}>
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
