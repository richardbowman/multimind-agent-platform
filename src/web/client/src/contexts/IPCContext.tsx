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
}> = ({ children }) => {
  const [ipcService, setIpcService] = useState<BaseRPCService | null>(null);
  const { showSnackbar } = useSnackbar();

  // Initialize IPC service
  useEffect(() => {
    const initializeService = async () => {
      const service = (window as any).electron
        ? new ElectronIPCService()
        : new WebSocketService();
      
      // Setup RPC but don't connect yet
      service.setupRPC();
      setIpcService(service);
    };

    initializeService();
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
