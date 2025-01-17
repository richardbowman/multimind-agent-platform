import React, { createContext, useContext, useState } from 'react';
import WebSocketService from '../services/WebSocketService';
import { ElectronIPCService } from '../services/ElectronIPCService';
import { BaseRPCService } from '../../../../shared/BaseRPCService';

const IPCContext = createContext<BaseRPCService | null>(null);

const _ipcService = (window as any).electron
? new ElectronIPCService()
: new WebSocketService();


export const IPCProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {

  const [ipcService] = useState<BaseRPCService>(_ipcService);
  
  console.log('IPC service initializing');
  if (!ipcService) {
    return null; // Or loading spinner
  }

  return (
    <IPCContext.Provider value={_ipcService}>
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
