import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { LLMLogEntry } from '../../../../llm/LLMLogger';
import { ClientMessage } from '../../../../shared/types';
import { ChannelData, CreateChannelParams } from '../../../../shared/channelTypes';
import { useSnackbar } from './SnackbarContext';
import { useIPCService } from './IPCContext';
import { useClientMethods } from '../services/ClientMethods';
import { Artifact } from '../../../../tools/artifact';
import { Settings } from '../../../../tools/settings';
import { ClientError } from '@mattermost/client';
import { UUID } from '../../../../types/uuid';
import { Task } from '../../../../tools/taskManager';
const DataContext = createContext<DataContextMethods | null>(null);

export interface Paths {
  appPath: string;
  modelsPath: string;
}

export interface DataContextMethods {
  messages: ClientMessage[];
  channels: ChannelData[];
  tasks: Task[];
  pendingFiles: Artifact[];
  logs: {
    llm: Record<string, LLMLogEntry[]>;
    system: any[];
    api: any[];
  };
  handles: Array<{ id: string, handle: string }>;
  currentChannelId: UUID | null;
  currentThreadId: UUID | null;
  isLoading: boolean;
  needsConfig: boolean | null;
  settings: Settings | null;
  paths: Paths | null;
  setPaths: React.Dispatch<React.SetStateAction<Paths>>;
  sendMessage: (message: Partial<ClientMessage>) => Promise<void>;
  fetchLogs: (logType: 'llm' | 'system' | 'api') => Promise<void>;
  fetchHandles: () => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<ClientMessage[]>>;
  setLogs: React.Dispatch<React.SetStateAction<{
    llm: Record<string, LLMLogEntry[]>;
    system: any[];
    api: any[];
  }>>;
  setNeedsConfig: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentChannelId: React.Dispatch<React.SetStateAction<string | null>>;
  setCurrentThreadId: React.Dispatch<React.SetStateAction<string | null>>;
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<Settings|ClientError>;
  createChannel: (params: CreateChannelParams) => Promise<string>;
  deleteChannel: (channelId: string) => Promise<void>;
  addPendingFiles: (artifacts: Artifact[]) => Promise<void>;
  resetPendingFiles: () => void;
  showFileDialog: () => Promise<void>;
}

export const DataProvider: React.FC<{ 
  children: React.ReactNode;
}> = ({ children }) => {

  const ipcService = useIPCService();
  const { showSnackbar } = useSnackbar();

  const [paths, setPaths] = useState<Paths|null>();
  const [settings, setSettings] = useState<Settings|null>();
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [handles, setHandles] = useState<Array<{ id: string, handle: string }>>([]);
  const [currentChannelId, _setCurrentChannelId] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);


  
  const setCurrentChannelId = useCallback((channelId: string | null) => {
    if (channelId) {
      localStorage.setItem('lastChannelId', channelId);
    } else {
      localStorage.removeItem('lastChannelId');
    }
    _setCurrentChannelId(channelId);
  }, []);
  const [currentThreadArtifacts, setCurrentThreadArtifacts] = useState<any[]>([]);
  const [allArtifacts, setAllArtifacts] = useState<any[]>([]);
  const [pendingFiles, setPendingFiles] = useState<Artifact[]>([]);
  const [logs, setLogs] = useState<{
    llm: Record<string, LLMLogEntry[]>;
    system: {
      logs: any[];
      total: number;
    };
    api: {
      logs: any[];
      total: number;
    };
  }>({
    llm: {},
    system: {
      logs: [],
      total: 0
    },
    api: {
      logs: [],
      total: 0
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [needsConfig, setNeedsConfig] = useState(null);

  const getSettings = () => ipcService.getRPC().getSettings();

  const fetchSettings = async () => {
    setSettings(await getSettings());
  }

  useEffect(() => {
    if (needsConfig === false) {
        // Trigger initial data fetch when backend is ready
        try {
            const lastChannel = localStorage.getItem('lastChannelId');
            setCurrentChannelId(lastChannel);

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

  const isElectron = !!(window as any).electron;

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


  const fetchLogs = useCallback(async (logType: 'llm' | 'system' | 'api', params?: {
    limit?: number;
    offset?: number;
    filter?: {
      search?: string;
    };
  }) => {
    const newLogs = await ipcService.getRPC().getLogs(logType, params);
    
    if (logType === 'llm') {
      setLogs(prev => ({
        ...prev,
        llm: newLogs
      }));
    } else {
      setLogs(prev => ({
        ...prev,
        [logType]: {
          logs: params?.offset 
            ? [...(prev[logType]?.logs || []), ...newLogs.logs]
            : newLogs.logs,
          total: newLogs.total
        }
      }));
    }
    
    return newLogs;
  }, []);


  const contextMethods = useMemo(() => ({
    messages,
    channels,
    pendingFiles,
    logs,
    handles,
    currentChannelId,
    currentThreadId,
    isLoading,
    needsConfig,
    settings,
    paths: paths,
    setPaths,
    sendMessage,
    fetchLogs,
    fetchHandles,
    setMessages,
    setLogs,
    setNeedsConfig,
    setCurrentChannelId,
    setCurrentThreadId,
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
    channels,
    logs,
    handles,
    settings,
    currentChannelId,
    currentThreadId,
    isLoading,
    needsConfig,
    pendingFiles,
    sendMessage,
    fetchLogs,
    fetchHandles,
    setCurrentChannelId,
    setCurrentThreadId,
    setSettings,
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

