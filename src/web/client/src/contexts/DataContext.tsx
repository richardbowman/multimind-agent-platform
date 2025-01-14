import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { ClientMessage, ClientChannel } from '../shared/IPCInterface';
import WebSocketService from '../services/WebSocketService';
import { ElectronIPCService } from '../services/ElectronIPCService';
import type { LLMLogEntry } from '../../../../llm/LLMLogger';
import { BaseRPCService } from '../shared/BaseRPCService';
import { ClientTask } from '../shared/types';
import { CreateChannelParams } from '../../../../shared/channelTypes';

// Create service instance based on environment
export const ipcService: BaseRPCService = (window as any).electron 
    ? new ElectronIPCService(contextMethods)
    : new WebSocketService();

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
  handles: Array<{id: string, handle: string}>;
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
}

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [channels, setChannels] = useState<ClientChannel[]>([]);
  const [handles, setHandles] = useState<Array<{id: string, handle: string}>>([]);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [logs, setLogs] = useState<{
    llm: Record<string, LLMLogEntry[]>;
    system: any[];
    api: any[];
  }>({
    llm: {},
    system: [],
    api: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [needsConfig, setNeedsConfig] = useState(true);

  useEffect(() => {
    console.debug('WebSocketContext stable mount - connecting');
    
    // Listen for connected event before fetching data
    ipcService.on('connected', () => {
      console.debug('WebSocketContext: received connected event');
      setNeedsConfig(false);
      Promise.all([
        fetchChannels(),
        fetchHandles()
      ]).catch(error => {
        console.error('Error fetching initial data:', error);
      });
    });

    ipcService.on('needsConfig', ({ needsConfig }) => {
      setNeedsConfig(needsConfig);
    });

    ipcService.connect();

    return () => {
      console.debug('WebSocketContext unmounting');
      ipcService.disconnect();
    };
  }, []);

  // Fetch messages whenever channel or thread changes
  useEffect(() => {
    const loadChannelData = async () => {
      if (currentChannelId) {
        setIsLoading(true);
        setMessages([]); // Clear messages before loading new ones
        
        const [newMessages] = await Promise.all([
          ipcService.getRPC().getMessages({channelId: currentChannelId, threadId: currentThreadId}),
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
    const newArtifacts = await ipcService.getRPC().getArtifacts({ channelId, threadId });
    setArtifacts(newArtifacts);
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

  const fetchLogs = useCallback(async (logType: 'llm' | 'system' | 'api') => {
    const newLogs = await ipcService.getRPC().getLogs(logType);
    setLogs(prev => ({
      ...prev,
      [logType]: newLogs
    }));
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
    createChannel: (params: CreateChannelParams) => ipcService.getRPC().createChannel(params)
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
    setCurrentThreadId
  ]);

  return (
    <DataContext.Provider value={contextMethods}>
      {children}
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
