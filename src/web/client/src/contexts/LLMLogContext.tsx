import React, { createContext, useContext, useState, useCallback } from 'react';
import { useIPCService } from './IPCContext';
import { LLMLogEntry } from '../../../../llm/LLMLogModel';

export interface LLMLogContextType {
    logs: LLMLogEntry[];
    hasMore: boolean;
    isLoading: boolean;
    error: Error | null;
    loadMoreLogs: () => Promise<void>;
    refreshLogs: () => Promise<void>;
    addLogEntry: (entry: LLMLogEntry) => void;
}

const LLMLogContext = createContext<LLMLogContextType>({
    logs: [],
    hasMore: false,
    isLoading: false,
    error: null,
    addLogEntry: (entry: LLMLogEntry) => {},
    loadMoreLogs: async () => {},
    refreshLogs: async () => {}
});

export const useLLMLogs = () => useContext(LLMLogContext);

export const LLMLogProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
    const [logs, setLogs] = useState<LLMLogEntry[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [page, setPage] = useState(0);
    const pageSize = 50;
    const ipcService = useIPCService();

    const fetchLogs = useCallback(async (offset: number, limit: number) => {
        try {
            setIsLoading(true);
            const data = await ipcService.getRPC().getLLMLogsPaginated({ offset, limit });
            return data;
        } catch (error) {
            setError(error as Error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, [ipcService]);

    const loadMoreLogs = useCallback(async () => {
        try {
            const newLogs = await fetchLogs(page * pageSize, pageSize);
            if (newLogs.length > 0) {
                setLogs(prev => [...prev, ...newLogs]);
                setPage(prev => prev + 1);
            }
            setHasMore(newLogs.length === pageSize);
        } catch (error) {
            console.error('Error loading more logs:', error);
        }
    }, [fetchLogs, page, pageSize]);

    const refreshLogs = useCallback(async () => {
        try {
            const newLogs = await fetchLogs(0, pageSize);
            setLogs(newLogs);
            setPage(1);
            setHasMore(newLogs.length === pageSize);
        } catch (error) {
            console.error('Error refreshing LLM logs:', error);
        }
    }, [fetchLogs, pageSize]);

    const addLogEntry = useCallback((entry: LLMLogEntry) => {
        setLogs(prev => [entry, ...prev]);
    }, []);

    return (
        <LLMLogContext.Provider value={{
            logs,
            hasMore,
            isLoading,
            error,
            loadMoreLogs,
            refreshLogs,
            addLogEntry
        }}>
            {children}
        </LLMLogContext.Provider>
    );
};
