import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { LLMLogEntry } from '../../../../llm/LLMLogger';
import { ClientChannel, ClientMessage, ClientTask } from '../../../../shared/types';
import { CreateChannelParams } from '../../../../shared/channelTypes';
import { useSnackbar } from './SnackbarContext';
import { useIPCService } from './IPCContext';
import { useClientMethods } from '../services/ClientMethods';
const DataContext = createContext<DataContextMethods | null>(null);


export interface DataContextMethods {
  messages: ClientMessage[];
  channels: ClientChannel[];
  tasks: ClientTask[];
  artifacts: any[];
  logs: {
    llm: Record<string, LLMLogEntry[]>;
    system: any[];
    api: any[];
  };
  handles: Array<{ id: string, handle: string }>;
  currentChannelId: string | null;
  currentThreadId: string | null;
  isLoading: boolean;
  needsConfig: boolean;
  sendMessage: (message: Partial<ClientMessage>) => Promise<void>;
  fetchChannels: () => Promise<void>;
  fetchTasks: (channelId: string, threadId: string | null) => Promise<void>;
  fetchArtifacts: (channelId: string, threadId: string | null) => Promise<void>;
  fetchAllArtifacts: () => Promise<void>;
  fetchLogs: (logType: 'llm' | 'system' | 'api') => Promise<void>;
  fetchHandles: () => Promise<void>;
  deleteArtifact: (artifactId: string) => Promise<void>;
  addArtifactToChannel: (channelId: string, artifactId: string) => Promise<void>;
  removeArtifactFromChannel: (channelId: string, artifactId: string) => Promise<void>;
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
  updateSettings: (settings: any) => Promise<any>;
  createChannel: (params: CreateChannelParams) => Promise<string>;
  setTasks: React.Dispatch<React.SetStateAction<ClientTask[]>>;
  markTaskComplete: (taskId: string, complete: boolean) => Promise<void>;
}

export const DataProvider: React.FC<{ 
  children: React.ReactNode;
}> = ({ children }) => {

  const ipcService = useIPCService();
  const { showSnackbar } = useSnackbar();

  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [channels, setChannels] = useState<ClientChannel[]>([]);
  const [handles, setHandles] = useState<Array<{ id: string, handle: string }>>([]);
  const [currentChannelId, _setCurrentChannelId] = useState<string | null>(() => {
    // Try to get last used channel from localStorage
    const lastChannel = localStorage.getItem('lastChannelId');
    return lastChannel || null;
  });
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);


  
  const setCurrentChannelId = useCallback((channelId: string | null) => {
    if (channelId) {
      localStorage.setItem('lastChannelId', channelId);
    } else {
      localStorage.removeItem('lastChannelId');
    }
    _setCurrentChannelId(channelId);
  }, []);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [artifacts, setArtifacts] = useState<any[]>([]);
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
  const [needsConfig, setNeedsConfig] = useState(true);

  // Fetch messages whenever channel or thread changes
  useEffect(() => {
    const loadChannelData = async () => {
      if (currentChannelId) {
        setIsLoading(true);
        setMessages([]); // Clear messages before loading new ones

        const [newMessages] = await Promise.all([
          ipcService.getRPC().getMessages({ channelId: currentChannelId, threadId: currentThreadId }),
          fetchTasks(currentChannelId, currentThreadId),
          fetchArtifacts(currentChannelId, currentThreadId)
        ]);

        setMessages(newMessages);
        setIsLoading(false);
      }
    };

    loadChannelData();
  }, [currentChannelId, currentThreadId]);

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

  const fetchChannels = useCallback(async () => {
    const newChannels = await ipcService.getRPC().getChannels();
    setChannels(newChannels);
  }, []);

  const fetchHandles = useCallback(async () => {
    const newHandles = await ipcService.getRPC().getHandles();
    setHandles(newHandles);
  }, []);

  const fetchTasks = useCallback(async (channelId: string, threadId: string | null) => {
    const newTasks = await ipcService.getRPC().getTasks({ channelId, threadId });
    setTasks(newTasks);
  }, []);

  const fetchArtifacts = useCallback(async (channelId: string, threadId: string | null) => {
    // Only fetch if we have a valid channel ID
    if (!channelId) return;
    
    // Debounce artifact fetching
    const newArtifacts = await ipcService.getRPC().getArtifacts({ channelId, threadId });
    
    // Only update state if artifacts have actually changed
    setArtifacts(prev => {
      const prevIds = new Set(prev.map(a => a.id));
      const newIds = new Set(newArtifacts.map(a => a.id));
      
      // If sets are equal, return previous artifacts to prevent re-render
      if (prevIds.size === newIds.size && 
          [...prevIds].every(id => newIds.has(id))) {
        return prev;
      }
      
      return newArtifacts;
    });
  }, []);

  const fetchAllArtifacts = useCallback(async () => {
    const newArtifacts = await ipcService.getRPC().getAllArtifacts();
    setArtifacts(newArtifacts);
  }, []);

  const deleteArtifact = useCallback(async (artifactId: string) => {
    const remainingArtifacts = await ipcService.getRPC().deleteArtifact(artifactId);
    setArtifacts(remainingArtifacts);
  }, []);

  const addArtifactToChannel = useCallback(async (channelId: string, artifactId: string) => {
    await ipcService.getRPC().addArtifactToChannel(channelId, artifactId);
    // Refresh artifacts after adding
    await fetchArtifacts(channelId, currentThreadId);
  }, [currentThreadId]);

  const removeArtifactFromChannel = useCallback(async (channelId: string, artifactId: string) => {
    await ipcService.getRPC().removeArtifactFromChannel(channelId, artifactId);
    // Refresh artifacts after removing
    await fetchArtifacts(channelId, currentThreadId);
  }, [currentThreadId]);

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
    tasks,
    artifacts,
    logs,
    handles,
    currentChannelId,
    currentThreadId,
    isLoading,
    needsConfig,
    sendMessage,
    fetchChannels,
    fetchTasks,
    fetchArtifacts,
    fetchAllArtifacts,
    fetchLogs,
    fetchHandles,
    deleteArtifact,
    addArtifactToChannel,
    removeArtifactFromChannel,
    setMessages,
    setLogs,
    setNeedsConfig,
    setCurrentChannelId,
    setCurrentThreadId,
    setTasks,
    getSettings: () => ipcService.getRPC().getSettings(),
    updateSettings: async (settings: any) => {
      try {
        const updatedSettings = await ipcService.getRPC().updateSettings(settings);

        if (settings.host !== undefined ||
          settings.port !== undefined ||
          settings.protocol !== undefined) {
          ipcService.disconnect();
          await ipcService.connect();
          await Promise.all([fetchChannels(), fetchHandles()]);
        }

        return updatedSettings;
      } catch (error) {
        console.error('Failed to update settings:', error);
        throw error;
      }
    },
    createChannel: (params: CreateChannelParams) => ipcService.getRPC().createChannel(params),
    markTaskComplete: async (taskId: string, complete: boolean) => {
      const updatedTask = await ipcService.getRPC().markTaskComplete(taskId, complete);
      setTasks(prev => prev.map(t =>
        t.id === updatedTask.id ? updatedTask : t
      ));
    }
  }), [
    messages,
    channels,
    tasks,
    artifacts,
    logs,
    handles,
    currentChannelId,
    currentThreadId,
    isLoading,
    needsConfig,
    sendMessage,
    fetchChannels,
    fetchTasks,
    fetchArtifacts,
    fetchAllArtifacts,
    fetchLogs,
    fetchHandles,
    deleteArtifact,
    setCurrentChannelId,
    setCurrentThreadId,
    setTasks
  ]);

  const clientMethods = useClientMethods(showSnackbar, contextMethods);

  useEffect(() => {
    if (ipcService && clientMethods) {
      ipcService.setupRPC(clientMethods);
    }
  }, [ipcService, clientMethods]);

  
  return (
    <DataContext.Provider value={contextMethods}>
      {typeof children === 'function' 
        ? children({ contextMethods }) 
        : children}
    </DataContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a DataProvider');
  }
  return context;
};

