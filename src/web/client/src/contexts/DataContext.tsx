import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { LLMLogEntry } from '../../../../llm/LLMLogger';
import { ClientMessage } from '../../../../types/viewTypes';
import { CreateChannelParams } from '../../../../types/channelTypes';
import { useIPCService } from './IPCContext';
import { Artifact } from '../../../../tools/artifact';
import { Settings } from '../../../../tools/settings';
import { ClientError } from '@mattermost/client';
import { LogEntry } from '../../../../types/RPCInterface';
const DataContext = createContext<DataContextMethods | null>(null);

export interface Paths {
  appPath: string;
  modelsPath: string;
}

export interface DataContextMethods {
  pendingFiles: Artifact[];
  logs: LogSet;
  handles: Array<{ id: string, handle: string }>;
  isLoading: boolean;
  needsConfig: boolean | null;
  configError: string | null;
  settings: Settings | null;
  paths: Paths | null;
  setPaths: React.Dispatch<React.SetStateAction<Paths>>;
  sendMessage: (message: Partial<ClientMessage>) => Promise<void>;
  fetchLogs: (logType: 'llm' | 'system', opts: LogSearchOptions) => Promise<void>;
  fetchHandles: () => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<ClientMessage[]>>;
  setLogs: React.Dispatch<React.SetStateAction<{
    system: any[];
  }>>;
  setNeedsConfig: React.Dispatch<React.SetStateAction<boolean>>;
  setConfigError: React.Dispatch<React.SetStateAction<string|null>>;
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<Settings | ClientError>;
  addPendingFiles: (artifacts: Artifact[]) => Promise<void>;
  resetPendingFiles: () => void;
  showFileDialog: () => Promise<void>;
}

export interface LogSearchOptions {
  limit?: number;
  offset?: number;
  filter?: {
    search?: string;
  };
}

export interface LogSet {
  system: {
    logs: any[];
    total: number;
  };
}

export const DataProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {

  const ipcService = useIPCService();

  const [paths, setPaths] = useState<Paths | null>();
  const [settings, setSettings] = useState<Settings | null>();
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [handles, setHandles] = useState<Array<{ id: string, handle: string }>>([]);
  const [allArtifacts, setAllArtifacts] = useState<any[]>([]);
  const [pendingFiles, setPendingFiles] = useState<Artifact[]>([]);
  const [logs, setLogs] = useState<LogSet>({
    system: {
      logs: [],
      total: 0
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [needsConfig, setNeedsConfig] = useState(null);
  const [configError, setConfigError] = useState(null);

  const getSettings = () => ipcService.getRPC().getSettings();

  const fetchSettings = async () => {
    setSettings(await getSettings());
  }

  useEffect(() => {
    if (needsConfig === false) {
      // Trigger initial data fetch when backend is ready
      try {
        fetchHandles();
        fetchSettings();
      } catch (error) {
        console.error(error);
      };
    }
  }, [needsConfig]);

  // Update loading state when messages are received
  useEffect(() => {
    setIsLoading(false);
  }, [messages]);

  const sendMessage = useCallback(async (message: Partial<ClientMessage>) => {
    const result = await ipcService.getRPC().sendMessage(message);
    if (result) {
      setMessages(prev => {
        const newMessages = [result].filter(message =>
          !prev.some(m => m.id === message.id)
        );
        return [...prev, ...newMessages].sort((a, b) => a.create_at - b.create_at);
      });
    }
  }, []);

  const fetchHandles = useCallback(async () => {
    const newHandles = await ipcService.getRPC().getHandles();
    setHandles(newHandles);
  }, []);


  const fetchLogs = useCallback(async (logType: 'system', params?: LogSearchOptions) => {
    const newLogs = await ipcService.getRPC().getLogs(logType, params);

    setLogs(prev => ({
      ...prev,
      [logType]: {
        logs: params?.offset
          ? [...(prev[logType]?.logs || []), ...newLogs.logs]
          : newLogs.logs,
        total: newLogs.total
      }
    }));

    return newLogs;
  }, []);


  const contextMethods = useMemo(() => ({
    messages,
    pendingFiles,
    logs,
    handles,
    isLoading,
    needsConfig,
    configError,
    settings,
    paths,
    setPaths,
    sendMessage,
    fetchLogs,
    fetchHandles,
    setMessages,
    setConfigError,
    setLogs,
    setNeedsConfig,
    getSettings,
    updateSettings: async (settings: Settings) => {
      try {
        const updatedSettings = await ipcService.getRPC().updateSettings(settings);

        if (updatedSettings.settings && !updatedSettings.error) {
          ipcService.disconnect();
          ipcService.connect();
          await Promise.all([fetchHandles(), fetchAllArtifacts()]);
        }

        return updatedSettings;
      } catch (error) {
        console.error('Failed to update settings:', error);
        throw error;
      }
    },
    addPendingFiles: (artifacts: Artifact[]) => {
      setPendingFiles([
        ...pendingFiles,
        ...artifacts
      ]);
      setAllArtifacts([
        ...allArtifacts,
        ...artifacts
      ]);
    },
    resetPendingFiles: () => {
      setPendingFiles([]);
    },
    showFileDialog: async () => {
      ipcService.getRPC().showFileDialog();
    }
  } as DataContextMethods), [
    messages,
    logs,
    handles,
    settings,
    isLoading,
    needsConfig,
    configError,
    pendingFiles,
    sendMessage,
    fetchLogs,
    fetchHandles,
    setSettings,
    setConfigError
  ]);

  return (
    <DataContext.Provider value={contextMethods}>
      {typeof children === 'function'
        ? children({ contextMethods })
        : children}
    </DataContext.Provider>
  );
};

export const useDataContext = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useDataContext must be used within a DataProvider');
  }
  return context;
};

