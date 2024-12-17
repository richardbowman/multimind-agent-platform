import React, { createContext, useContext, useEffect, useState } from 'react';
import webSocketService, { Message, Channel, Thread } from '../services/WebSocketService';
import { Artifact } from '../../../../tools/artifact';
import type { LLMLogEntry } from '../../../../llm/LLMLogger';

interface WebSocketContextType {
  messages: Message[];
  channels: Channel[];
  threads: Record<string, Thread[]>; // Keyed by channel_id
  tasks: any[];
  artifacts: Artifact[];
  logs: {
    llm: Record<string, LLMLogEntry[]>;
    system: any[];
    api: any[];
  };
  sendMessage: (message: Partial<Message>) => void;
  fetchChannels: () => void;
  fetchThreads: (channelId: string) => void;
  fetchTasks: (channelId: string, threadId: string | null) => void;
  fetchArtifacts: (channelId: string, threadId: string | null) => void;
  fetchAllArtifacts: () => void;
  fetchLogs: () => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
  messages: [],
  channels: [],
  threads: {},
  sendMessage: () => { },
  fetchChannels: () => { },
  fetchThreads: () => { },
  tasks: [],
  artifacts: [],
  fetchTasks: function (channelId: string, threadId: string | null): void {
    throw new Error('Function not implemented.');
  },
  fetchArtifacts: function (channelId: string, threadId: string | null): void {
    throw new Error('Function not implemented.');
  },
  fetchAllArtifacts: function (): void {
    throw new Error('Function not implemented.');
  },
  logs: {
    llm: {},
    system: [],
    api: []
  },
  fetchLogs: function (): void {
    throw new Error('Function not implemented.');
  }
});

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [threads, setThreads] = useState<Record<string, Thread[]>>({});
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

  useEffect(() => {
    webSocketService.connect();

    // Handle both bulk and individual messages
    const messageCleanup = webSocketService.onMessage((messages, isLive) => {
      setMessages(prev => {
        if (!isLive) {
          // For historical messages, replace the entire list
          return messages;
        }
        
        // For live messages, append only new ones
        const newMessages = messages.filter(message => 
          !prev.some(m => m.id === message.id)
        );
        
        // Only fetch threads once per channel
        const uniqueChannels = new Set(
          newMessages
            .filter(message => message.thread_id)
            .map(message => message.channel_id)
        );
        
        uniqueChannels.forEach(channelId => {
          if (channelId) webSocketService.fetchThreads(channelId);
        });
        
        return [...prev, ...newMessages].sort((a, b) => a.create_at - b.create_at);
      });
    });

    const channelCleanup = webSocketService.onChannels((newChannels) => {
      setChannels(newChannels);
    });

    const threadCleanup = webSocketService.onThreads((newThreads) => {
      if (newThreads.length > 0) {
        const channelId = newThreads[0].rootMessage.channel_id;
        setThreads(prev => {
          // Only update if the threads have actually changed
          const currentThreads = prev[channelId] || [];
          const hasChanges = newThreads.length !== currentThreads.length || 
            newThreads.some((thread, i) => thread.rootMessage.id !== currentThreads[i]?.rootMessage.id);
            
          return hasChanges ? {
            ...prev,
            [channelId]: newThreads
          } : prev;
        });
      }
    });

    const taskCleanup = webSocketService.onTasks((newTasks) => {
      setTasks(newTasks);
    });

    const artifactCleanup = webSocketService.onArtifacts((newArtifacts) => {
      setArtifacts(newArtifacts);
    });

    webSocketService.socket?.on('logs', (newLogs: { type: string, data: any }) => {
      console.log('Received logs:', newLogs);
      setLogs(prev => {
        const updated = {
          ...prev,
          [newLogs.type]: newLogs.data
        };
        console.log('Updated logs state:', updated);
        return updated;
      });
    });

    return () => {
      messageCleanup();
      channelCleanup();
      threadCleanup();
      taskCleanup();
      artifactCleanup();
      webSocketService.disconnect();
    };
  }, []);

  const sendMessage = (message: Partial<Message>) => {
    webSocketService.sendMessage(message);
  };

  const fetchChannels = () => {
    webSocketService.fetchChannels();
  };

  const fetchThreads = (channelId: string) => {
    if (!threads[channelId]) {
      webSocketService.fetchThreads(channelId);
    }
  };


  const fetchTasks = (channelId: string, threadId: string | null) => {
    webSocketService.fetchTasks(channelId, threadId);
  };

  const fetchArtifacts = (channelId: string, threadId: string | null) => {
    webSocketService.fetchArtifacts(channelId, threadId);
  };

  const fetchAllArtifacts = () => {
    webSocketService.fetchAllArtifacts();
  };

  const fetchLogs = (logType: string) => {
    webSocketService.fetchLogs(logType);
  };

  return (
    <WebSocketContext.Provider value={{ 
      messages, 
      channels, 
      threads,
      tasks,
      artifacts, 
      sendMessage, 
      fetchChannels, 
      fetchThreads,
      fetchTasks,
      fetchArtifacts,
      fetchAllArtifacts,
      logs,
      fetchLogs
    }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);
