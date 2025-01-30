import React, { createContext, useContext, useCallback, useMemo, useState } from 'react';
import { ClientTask } from '../../../../shared/types';
import { useIPCService } from './IPCContext';

interface TaskContextType {
  tasks: ClientTask[];
  fetchTasks: (channelId: string, threadId: string | null) => Promise<void>;
  markTaskComplete: (taskId: string, complete: boolean) => Promise<void>;
  setTasks: React.Dispatch<React.SetStateAction<ClientTask[]>>;
}

const TaskContext = createContext<TaskContextType | null>(null);

export const TaskProvider = ({ children }: { children: React.ReactNode }) => {
  const ipcService = useIPCService();
  const [tasks, setTasks] = useState<ClientTask[]>([]);

  const fetchTasks = useCallback(async (channelId: string, threadId: string | null) => {
    const newTasks = await ipcService.getRPC().getTasks({ channelId, threadId });
    setTasks(newTasks);
  }, [ipcService]);

  const markTaskComplete = useCallback(async (taskId: string, complete: boolean) => {
    const updatedTask = await ipcService.getRPC().markTaskComplete(taskId, complete);
    setTasks(prev => prev.map(t =>
      t.id === updatedTask.id ? updatedTask : t
    ));
  }, [ipcService]);

  const value = useMemo(() => ({
    tasks,
    fetchTasks,
    markTaskComplete,
    setTasks
  }), [tasks, fetchTasks, markTaskComplete]);

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
};

export const useTasks = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
};
