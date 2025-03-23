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
  unreadChildren: Set<string> | null;
  sendMessage: (message: Partial<ClientMessage>) => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<ClientMessage[]>>;
  setCurrentChannelId: (channelId: UUID | null) => void;
  setCurrentThreadId: React.Dispatch<React.SetStateAction<UUID | null>>;
  setUnreadChildren: React.Dispatch<React.SetStateAction<Set<string> | null>>;
  markMessageRead: (messageId: string) => void;
}

const MessageContext = createContext<MessageContextType | null>(null);

export const MessageProvider = ({ children }: { children: React.ReactNode }) => {
  const ipcService = useIPCService();
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const { currentChannelId, setCurrentChannelId } = useChannels();
  const [currentThreadId, setCurrentThreadId] = useState<UUID | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadChildren, setUnreadChildren] = useState<Set<string>>(new Set());

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
      
      // Mark sent messages as read
      setUnreadChildren(prev => {
        const newSet = new Set(prev);
        newSet.delete(result.id);
        return newSet;
      });
    }
  }, [ipcService]);

  // Fetch messages whenever channel or thread changes
  useEffect(() => {
    if (currentChannelId) {
      fetchMessages(currentChannelId, currentThreadId);
    }
  }, [currentChannelId, currentThreadId, fetchMessages]);

  const markMessageRead = useCallback((messageId: string) => {
    setUnreadChildren(prev => {
      const newSet = new Set(prev);
      newSet.delete(messageId);
      return newSet;
    });
  }, []);

  const value = useMemo(() => ({
    messages,
    currentChannelId,
    currentThreadId,
    isLoading,
    unreadChildren,
    sendMessage,
    setMessages,
    setCurrentChannelId,
    setCurrentThreadId,
    setUnreadChildren,
    markMessageRead
  }), [messages, currentChannelId, currentThreadId, isLoading, sendMessage, unreadChildren, setUnreadChildren, markMessageRead]);

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
