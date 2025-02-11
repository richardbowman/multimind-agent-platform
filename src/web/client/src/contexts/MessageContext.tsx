import React, { createContext, useContext, useCallback, useMemo, useState, useEffect } from 'react';
import { ClientMessage } from '../../../../shared/types';
import { useIPCService } from './IPCContext';
import { asUUID, UUID } from '../../../../types/uuid';
import { useChannels } from './ChannelContext';

export interface MessageContextType {
  messages: ClientMessage[];
  currentChannelId: UUID | null;
  currentThreadId: UUID | null;
  isLoading: boolean;
  sendMessage: (message: Partial<ClientMessage>) => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<ClientMessage[]>>;
  setCurrentChannelId: (channelId: UUID | null) => void;
  setCurrentThreadId: React.Dispatch<React.SetStateAction<UUID | null>>;
}

const MessageContext = createContext<MessageContextType | null>(null);

export const MessageProvider = ({ children }: { children: React.ReactNode }) => {
  const ipcService = useIPCService();
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const { currentChannelId, setCurrentChannelId } = useChannels();
  const [currentThreadId, setCurrentThreadId] = useState<UUID | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMessages = useCallback(async (channelId: UUID | null, threadId: UUID | null) => {
    if (!channelId) return;

    setIsLoading(true);

    const newMessages = await ipcService.getRPC().getMessages({ channelId, threadId });
    setMessages(newMessages);
    setIsLoading(false);
  }, [ipcService]);

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

  // Fetch messages whenever channel or thread changes
  useEffect(() => {
    if (currentChannelId) {
      fetchMessages(currentChannelId, currentThreadId);
    }
  }, [currentChannelId, currentThreadId, fetchMessages]);

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
