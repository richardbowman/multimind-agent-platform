import React, { createContext, useContext, useMemo } from 'react';
import { ClientMessage } from '../../../../shared/types';
import { useMessages } from './MessageContext';
import { UUID } from '../../../../types/uuid';

interface ThreadMessageContextType {
  threadMessages: ClientMessage[];
  rootMessage: ClientMessage | null;
  isLoading: boolean;
}

const ThreadMessageContext = createContext<ThreadMessageContextType | null>(null);

export const ThreadMessageProvider = ({ 
  threadId,
  children 
}: { 
  threadId: UUID | null;
  children: React.ReactNode 
}) => {
  const { messages, isLoading } = useMessages();

  const threadMessages = useMemo(() => {
    if (!threadId) return [];
    return messages.filter(msg => 
      msg.id === threadId || msg.props?.['root-id'] === threadId
    );
  }, [messages, threadId]);

  const rootMessage = useMemo(() => {
    if (!threadId) return null;
    return messages.find(msg => msg.id === threadId) || null;
  }, [messages, threadId]);

  const value = useMemo(() => ({
    threadMessages,
    rootMessage,
    isLoading
  }), [threadMessages, rootMessage, isLoading]);

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
