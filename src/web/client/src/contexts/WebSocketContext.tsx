import React, { createContext, useContext, useEffect, useState } from 'react';
import webSocketService, { Message, Channel, Thread } from '../services/WebSocketService';

interface WebSocketContextType {
  messages: Message[];
  channels: Channel[];
  threads: Record<string, Thread[]>; // Keyed by channel_id
  sendMessage: (message: Partial<Message>) => void;
  fetchChannels: () => void;
  fetchThreads: (channelId: string) => void;
  fetchThread: (channelId: string, rootId: string) => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
  messages: [],
  channels: [],
  threads: {},
  sendMessage: () => {},
  fetchChannels: () => {},
  fetchThreads: () => {},
});

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [threads, setThreads] = useState<Record<string, Thread[]>>({});

  useEffect(() => {
    webSocketService.connect();

    const messageCleanup = webSocketService.onMessage((message) => {
      setMessages(prev => {
        // Check if message already exists to prevent duplicates
        if (!prev.some(m => m.id === message.id)) {
          return [...prev, message];
        }
        return prev;
      });
    });

    const channelCleanup = webSocketService.onChannels((newChannels) => {
      setChannels(newChannels);
    });

    const threadCleanup = webSocketService.onThreads((newThreads) => {
      if (newThreads.length > 0) {
        const channelId = newThreads[0].rootMessage.channel_id;
        setThreads(prev => ({
          ...prev,
          [channelId]: newThreads
        }));
      }
    });

    return () => {
      messageCleanup();
      channelCleanup();
      threadCleanup();
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
    webSocketService.fetchThreads(channelId);
  };

  const fetchThread = (channelId: string, rootId: string) => {
    webSocketService.fetchThread(channelId, rootId);
  };

  return (
    <WebSocketContext.Provider value={{ 
      messages, 
      channels, 
      threads, 
      sendMessage, 
      fetchChannels, 
      fetchThreads,
      fetchThread
    }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);
