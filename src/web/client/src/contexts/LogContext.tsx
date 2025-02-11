import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { ClientLogger } from '../services/ClientLogger';
import { useIPCService } from './IPCContext';
import { useDataContext } from './DataContext';
import { useMessages } from './MessageContext';
import { useArtifacts } from './ArtifactContext';
import { useClientMethods } from '../services/ClientMethods';
import { useSnackbar } from './SnackbarContext';
import { useChannels } from './ChannelContext';
import { useTasks } from './TaskContext';

interface LogContextType {
    logger: ClientLogger;
}

const LogContext = createContext<LogContextType | null>(null);

export const LogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const ipcService = useIPCService();

    //TODO SHOULD REALLY BE IN ITS OWN CONTEXT
    const clientMethods = useClientMethods(ipcService, useSnackbar(), useDataContext(), useMessages(), useArtifacts(), useChannels(), useTasks());  

    useEffect(() => {
      if (ipcService && clientMethods) {
        ipcService.setupRPC(clientMethods);
      }
    }, [ipcService, clientMethods]);
  

    const logger = useMemo(() => {
        const logger = new ClientLogger((level, message, details) => {
            if (level !== "debug") {
                return ipcService.getRPC().logClientEvent(level, message, details);
            }
        });
        return logger;
    }, []);

    useEffect(() => {
        // Setup console interception and error handlers once
        logger.interceptConsole();
        logger.setupGlobalErrorHandlers();
        
        // Cleanup on unmount
        return () => {
            logger.cleanup();
        };
    }, [logger]);

    return (
        <LogContext.Provider value={{ logger }}>
            {children}
        </LogContext.Provider>
    );
};

export const useLogger = () => {
    const context = useContext(LogContext);
    if (!context) {
        throw new Error('useLogger must be used within a LogProvider');
    }
    return context.logger;
};
