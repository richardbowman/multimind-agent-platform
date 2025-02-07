import React, { createContext, useContext, useMemo } from 'react';
import { ClientMessage } from '../../../../shared/types';
import { useMessages } from './MessageContext';
import { UUID } from '../../../../types/uuid';

interface ThreadMessageContextType {
  messages: ClientMessage[];
  rootMessage: ClientMessage | null;
  isLoading: boolean;
  isThread: boolean;
}

const ThreadMessageContext = createContext<ThreadMessageContextType | null>(null);

export const ThreadMessageProvider = ({ 
  threadId,
  children 
}: { 
  threadId: UUID | null;
  children: React.ReactNode 
}) => {
  const { messages, isLoading, currentChannelId } = useMessages();

  const messages = useMemo(() => {
    if (!threadId) {
      // Main channel messages - messages without a thread
      return messages.filter(msg => 
        !msg.props?.['root-id'] && msg.channel_id === currentChannelId
      );
    }
    // Thread messages - root message and its replies
    return messages.filter(msg => 
      msg.id === threadId || msg.props?.['root-id'] === threadId
    );
  }, [messages, threadId, currentChannelId]);

  const rootMessage = useMemo(() => {
    if (!threadId) return null;
    return messages.find(msg => msg.id === threadId) || null;
  }, [messages, threadId]);

  const value = useMemo(() => ({
    messages,
    rootMessage,
    isLoading,
    isThread: !!threadId
  }), [messages, rootMessage, isLoading, threadId]);

  return (
    <ThreadMessageContext.Provider value={value}>
      {children}
    </ThreadMessageContext.Provider>
  );
};

export const useThreadMessages = () => {
  const context = useContext(ThreadMessageContext);
  if (!context) {
    throw new Error('useThreadMessages must be used within a ThreadMessageProvider');
  }
  return context;
};
