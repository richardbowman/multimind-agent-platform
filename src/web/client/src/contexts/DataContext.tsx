import React, { createContext, useContext, useEffect, useState } from 'react';
import { IIPCService, ClientMessage, ClientChannel } from '../shared/IPCInterface';
import WebSocketService from '../services/WebSocketService';
import { ElectronIPCService } from '../services/ElectronIPCService';
import { Artifact } from '../../../../tools/artifact';
import type { LLMLogEntry } from '../../../../llm/LLMLogger';
import { BaseRPCService } from '../shared/BaseRPCService';
import { ClientTask } from '../shared/types';
import { CreateChannelParams } from '../../../../shared/channelTypes';

// Create service instance based on environment
const ipcService: BaseRPCService = (window as any).electron 
    ? new ElectronIPCService()
    : new WebSocketService();

interface DataContextType {
  messages: ClientMessage[];
  channels: ClientChannel[];
  tasks: ClientTask[];
  artifacts: Artifact[];
  handles: Array<{id: string, handle: string}>;
  isLoading: boolean;
  needsConfig: boolean;
  currentChannelId: string | null;
  setCurrentChannelId: (channelId: string | null) => void;
  currentThreadId: string | null;
  setCurrentThreadId: (threadId: string | null) => void;
  logs: {
    llm: Record<string, LLMLogEntry[]>;
    system: any[];
    api: any[];
  };
  sendMessage: (message: Partial<ClientMessage>) => void;
  fetchChannels: () => void;
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<any>;
  fetchTasks: (channelId: string, threadId: string | null) => void;
  fetchArtifacts: (channelId: string, threadId: string | null) => void;
  fetchAllArtifacts: () => void;
  fetchHandles: () => void;
  fetchLogs: (logType: 'llm' | 'system' | 'api') => void;
  deleteArtifact: (artifactId: string) => void;
  createChannel: (params: CreateChannelParams) => Promise<string>;
}

const DataContext = createContext<DataContextType>({
  messages: [],
  channels: [],
  handles: [],
  sendMessage: () => { },
  fetchChannels: () => { },
  fetchHandles: () => { },
  updateSettings: async (settings: any) => ({}),
  getSettings: async () => ({}),
  tasks: [],
  artifacts: [],
  fetchTasks: (channelId: string, threadId: string | null) => { },
  fetchArtifacts: (channelId: string, threadId: string | null) => { },
  fetchAllArtifacts: () => { },
  deleteArtifact: (artifactId: string) => { },
  logs: {
    llm: {},
    system: [],
    api: []
  },
  fetchLogs: (logType: 'llm' | 'system' | 'api') => { },
  currentChannelId: null,
  setCurrentChannelId: () => { },
  currentThreadId: null,
  setCurrentThreadId: () => { },
  isLoading: true,
  needsConfig: true,
  createChannel: async (params: CreateChannelParams) => ""
});

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

    // Set up message and log update handlers
    ipcService.on('onMessage', (messages: ClientMessage[]) => {
      setMessages(prev => {
        const newMessages = messages.filter((message: ClientMessage) => 
          !prev.some(m => m.id === message.id)
        );
        return [...prev, ...newMessages].sort((a, b) => a.create_at - b.create_at);
      });
    });

    ipcService.on('onLogUpdate', (update) => {
      if (update.type === 'llm') {
        setLogs(prev => ({
          ...prev,
          llm: {
            ...prev.llm,
            [update.entry.service]: [
              ...(prev.llm[update.entry.service] || []),
              update.entry
            ]
          }
        }));
      }
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
          ipcService.getMessages(currentChannelId, currentThreadId || ''),
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

  const sendMessage = async (message: Partial<ClientMessage>) => {
    const result = await ipcService.sendMessage(message);
    if (result) {
      setMessages(prev => {
        const newMessages = [result].filter(message => 
          !prev.some(m => m.id === message.id)
        );
        return [...prev, ...newMessages].sort((a, b) => a.create_at - b.create_at);
      });
    }
  };

  const fetchChannels = async () => {
    const newChannels = await ipcService.getChannels();
    setChannels(newChannels);
  };

  const fetchHandles = async () => {
    const newHandles = await ipcService.getHandles();
    setHandles(newHandles);
  };

  const fetchTasks = async (channelId: string, threadId: string | null) => {
    const newTasks = await ipcService.getTasks(channelId, threadId);
    setTasks(newTasks);
  };

  const fetchArtifacts = async (channelId: string, threadId: string | null) => {
    const newArtifacts = await ipcService.getArtifacts(channelId, threadId);
    setArtifacts(newArtifacts);
  };

  const fetchAllArtifacts = async () => {
    const newArtifacts = await ipcService.getAllArtifacts();
    setArtifacts(newArtifacts);
  };

  const deleteArtifact = async (artifactId: string) => {
    const remainingArtifacts = await ipcService.deleteArtifact(artifactId);
    setArtifacts(remainingArtifacts);
  };

  const fetchLogs = async (logType: 'llm' | 'system' | 'api') => {
    const newLogs = await ipcService.getLogs(logType);
    setLogs(prev => ({
      ...prev,
      [logType]: newLogs
    }));
  };
  
  return (
    <DataContext.Provider value={{ 
      messages, 
      channels, 
      tasks,
      artifacts, 
      sendMessage, 
      fetchChannels, 
      fetchTasks,
      fetchArtifacts,
      fetchAllArtifacts,
      logs,
      fetchLogs,
      handles,
      fetchHandles,
      deleteArtifact,
      currentChannelId,
      setCurrentChannelId,
      currentThreadId,
      setCurrentThreadId,
      isLoading,
      needsConfig,
      getSettings: () => ipcService.getSettings(),
      updateSettings: async (settings: any) => {
        try {
          // Update settings on server
          const updatedSettings = await ipcService.updateSettings(settings);
          
          // If connection-related settings changed, reconnect
          if (settings.host !== undefined || 
              settings.port !== undefined || 
              settings.protocol !== undefined) {
            // Disconnect and reconnect with new settings
            ipcService.disconnect();
            await ipcService.connect();
            
            // Refresh data after reconnect
            await Promise.all([
              fetchChannels(),
              fetchHandles()
            ]);
          }
          
          return updatedSettings;
        } catch (error) {
          console.error('Failed to update settings:', error);
          throw error; // Re-throw to let UI handle error display
        }
      },
      createChannel: (params: CreateChannelParams) => ipcService.createChannel(params)
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useWebSocket = () => useContext(DataContext);
