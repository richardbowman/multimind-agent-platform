import React, { createContext, useContext, useEffect, useState } from 'react';
import webSocketService, { Message, Channel, Thread } from '../services/WebSocketService';
import { Artifact } from '../../../../tools/artifact';

interface WebSocketContextType {
  messages: Message[];
  channels: Channel[];
  threads: Record<string, Thread[]>; // Keyed by channel_id
  tasks: any[];
  artifacts: Artifact[];
  logs: any[];
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
  logs: [],
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
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    webSocketService.connect();

    // Handle bulk messages from server
    const messagesHandler = (newMessages: Message[]) => {
      console.log('Received messages from server:', newMessages);
      setMessages(newMessages);
    };

    webSocketService.socket?.on('messages', messagesHandler);

    // Handle individual real-time messages
    const messageCleanup = webSocketService.onMessage((messages) => {
      setMessages(prev => {
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

    webSocketService.socket?.on('logs', (newLogs: any[]) => {
      setLogs(newLogs);
    });

    return () => {
      messageCleanup();
      channelCleanup();
      threadCleanup();
      taskCleanup();
      artifactCleanup();
      webSocketService.socket?.off('messages', messagesHandler);
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

  const fetchLogs = () => {
    webSocketService.fetchLogs();
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
