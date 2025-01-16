import React, { createContext, useContext, useMemo } from 'react';
import { ClientLogger } from '../services/ClientLogger';
import { useIPCService } from './DataContext';

interface LogContextType {
    logger: ClientLogger;
}

const LogContext = createContext<LogContextType | null>(null);

export const LogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const ipcService = useIPCService();
    
    const logger = useMemo(() => {
        const logger = new ClientLogger((level, message, details) => {
            return ipcService.getRPC().logClientEvent(level, message, details);
        });
        return logger;
    }, []);

    useEffect(() => {
        // Setup console interception and error handlers once
        logger.interceptConsole();
        logger.setupGlobalErrorHandlers();
        
        // Cleanup on unmount
        return () => {
            logger.restoreConsole();
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
