import React, { createContext, useContext, useCallback, useMemo, useState } from 'react';
import { ClientMessage } from '../../../../shared/types';
import { useIPCService } from './IPCContext';

interface MessageContextType {
  messages: ClientMessage[];
  currentChannelId: string | null;
  currentThreadId: string | null;
  isLoading: boolean;
  sendMessage: (message: Partial<ClientMessage>) => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<ClientMessage[]>>;
  setCurrentChannelId: (channelId: string | null) => void;
  setCurrentThreadId: React.Dispatch<React.SetStateAction<string | null>>;
}

const MessageContext = createContext<MessageContextType | null>(null);

export const MessageProvider = ({ children }: { children: React.ReactNode }) => {
  const ipcService = useIPCService();
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
  }, [ipcService]);

  const value = useMemo(() => ({
    messages,
    currentChannelId,
    currentThreadId,
    isLoading,
    sendMessage,
    setMessages,
    setCurrentChannelId,
    setCurrentThreadId
  }), [messages, currentChannelId, currentThreadId, isLoading, sendMessage]);

  return (
    <MessageContext.Provider value={value}>
      {children}
    </MessageContext.Provider>
  );
};

export const useMessages = () => {
  const context = useContext(MessageContext);
  if (!context) {
    throw new Error('useMessages must be used within a MessageProvider');
  }
  return context;
};
