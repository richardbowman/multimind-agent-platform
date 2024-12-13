import React, { createContext, useContext, useEffect, useState } from 'react';
import webSocketService, { Message } from '../services/WebSocketService';

interface WebSocketContextType {
  messages: Message[];
  sendMessage: (message: Partial<Message>) => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
  messages: [],
  sendMessage: () => {},
});

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    // Connect to WebSocket server when component mounts
    webSocketService.connect();

    // Set up message handler
    const cleanup = webSocketService.onMessage((message) => {
      setMessages(prev => [...prev, message]);
    });

    // Cleanup on unmount
    return () => {
      cleanup();
      webSocketService.disconnect();
    };
  }, []);

  const sendMessage = (message: Partial<Message>) => {
    webSocketService.sendMessage(message);
  };

  return (
    <WebSocketContext.Provider value={{ messages, sendMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);
