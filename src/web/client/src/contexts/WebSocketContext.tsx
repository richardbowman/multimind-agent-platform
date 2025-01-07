import React, { createContext, useContext, useEffect, useState } from 'react';
import { IIPCService, ClientMessage, ClientChannel } from '../../../../shared/IPCInterface';
import WebSocketService from '../services/WebSocketService';
import { ElectronIPCService } from '../services/ElectronIPCService';
import { Artifact } from '../../../../tools/artifact';
import type { LLMLogEntry } from '../../../../llm/LLMLogger';

// Create service instance based on environment
const ipcService: IIPCService = (window as any).electron 
    ? new ElectronIPCService()
    : new WebSocketService();

interface WebSocketContextType {
  messages: ClientMessage[];
  channels: ClientChannel[];
  tasks: any[];
  artifacts: Artifact[];
  handles: Array<{id: string, handle: string}>;
  isLoading: boolean;
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
  getSettings: (callback: (settings: any) => void) => void;
  updateSettings: (settings: any) => void;
  fetchTasks: (channelId: string, threadId: string | null) => void;
  fetchArtifacts: (channelId: string, threadId: string | null) => void;
  fetchAllArtifacts: () => void;
  fetchHandles: () => void;
  fetchLogs: (logType: 'llm' | 'system' | 'api') => void;
  deleteArtifact: (artifactId: string) => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
  messages: [],
  channels: [],
  handles: [],
  sendMessage: () => { },
  fetchChannels: () => { },
  fetchHandles: () => { },
  updateSettings: () => { },
  getSettings: () => { },
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
});

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [channels, setChannels] = useState<ClientChannel[]>([]);
  const [handles, setHandles] = useState<Array<{id: string, handle: string}>>([]);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
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

  useEffect(() => {
    ipcService.connect();

    const handlesCleanup = ipcService.onHandles((newHandles: any) => {
      console.log('WebSocketContext: Received handles:', newHandles);
      setHandles(newHandles);
    });

    const messageCleanup = ipcService.onMessage((messages: ClientMessage[], isLive: boolean) => {
      setMessages(prev => {
        if (!isLive) {
          // For historical messages, replace the entire list
          return messages;
        }
        
        // For live messages, append only new ones
        const newMessages = messages.filter(message => 
          !prev.some(m => m.id === message.id)
        );
        
        // Update messages array, handling both new messages and reply count updates
        return prev.map(existingMsg => {
          // If this is a parent message that just got a new reply
          if (newMessages.some(newMsg => newMsg.props?.['root-id'] === existingMsg.id)) {
            return {
              ...existingMsg,
              reply_count: (existingMsg.reply_count || 0) + 1
            };
          }
          return existingMsg;
        }).concat(newMessages)
        .sort((a, b) => a.create_at - b.create_at);
      });
    });

    const channelCleanup = ipcService.onChannels((newChannels) => {
          setChannels(newChannels);
        });

    const taskCleanup = ipcService.onTasks((newTasks) => {
          setTasks(newTasks);
        });

    const artifactCleanup = ipcService.onArtifacts((newArtifacts) => {
          setArtifacts(newArtifacts);
        });

    const logsCleanup = ipcService.onLogs((newLogs: any) => {
      console.log('WebSocketContext: Received logs:', newLogs);
      if (!newLogs?.type || !['llm', 'system', 'api'].includes(newLogs.type)) {
        console.warn('WebSocketContext: Received invalid log type:', newLogs?.type);
        return;
      }
      setLogs(prev => ({
        ...prev,
        [newLogs.type]: newLogs.data || []
      }));
    });

    return () => {    
      messageCleanup();
      channelCleanup();
      taskCleanup();
      artifactCleanup();
      handlesCleanup();
      logsCleanup();
      ipcService.disconnect();
    };
  }, []);

  // Fetch messages whenever channel or thread changes
  useEffect(() => {
    if (currentChannelId) {
      setIsLoading(true);
      setMessages([]); // Clear messages before loading new ones
      ipcService.getMessages(currentChannelId, currentThreadId || '');
      // Also fetch related data
      fetchTasks(currentChannelId, currentThreadId);
      fetchArtifacts(currentChannelId, currentThreadId);
    }
  }, [currentChannelId, currentThreadId]);

  // Update loading state when messages are received
  useEffect(() => {
    setIsLoading(false);
  }, [messages]);

  const isElectron = !!(window as any).electron;

  const sendMessage = (message: Partial<ClientMessage>) => {
    ipcService.sendMessage(message);
  };

  const fetchChannels = () => {
    ipcService.getChannels();
  };

  const fetchHandles = () => {
    ipcService.getHandles();
  };

  const fetchTasks = (channelId: string, threadId: string | null) => {
    ipcService.getTasks(channelId, threadId);
  };

  const fetchArtifacts = (channelId: string, threadId: string | null) => {
    ipcService.getArtifacts(channelId, threadId);
  };

  const fetchAllArtifacts = () => {
    ipcService.getAllArtifacts();
  };

  const deleteArtifact = (artifactId: string) => {
    ipcService.deleteArtifact(artifactId);
  };

  const fetchLogs = (logType: 'llm' | 'system' | 'api') => {
    ipcService.getLogs(logType);
  };

  return (
    <WebSocketContext.Provider value={{ 
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
      getSettings: isElectron 
        ? (window as any).electron.getSettings
        : ipcService.getSettings.bind(ipcService),
      updateSettings: isElectron
        ? (window as any).electron.updateSettings
        : ipcService.updateSettings.bind(ipcService)
    }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);
