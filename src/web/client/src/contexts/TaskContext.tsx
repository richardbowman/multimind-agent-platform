import React, { createContext, useContext, useCallback, useMemo, useState, useEffect } from 'react';
import { Task } from '../../../../tools/taskManager';
import { useIPCService } from './IPCContext';
import { UUID } from '../../../../types/uuid';
import { useDataContext } from '../contexts/DataContext';

export interface TaskContextType {
  tasks: Task[];
  isLoading: boolean;
  fetchAllTasks: () => Promise<void>;
  saveTask: (task: Task) => Promise<Task>;
  deleteTask: (taskId: UUID) => Promise<void>;
  markTaskComplete: (taskId: UUID, complete: boolean) => Promise<void>;
  reviseTasksForThread(channel_id: UUID, arg1: any): unknown;
}

const TaskContext = createContext<TaskContextType | null>(null);

export const TaskProvider = ({ children }: { children: React.ReactNode }) => {
  const { needsConfig } = useDataContext();
  const ipcService = useIPCService();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAllTasks = useCallback(async () => {
    if (ipcService.getRPC() && !needsConfig) {
      setIsLoading(true);
      const newTasks = await ipcService.getRPC().getTasks({});
      setTasks(newTasks);
      setIsLoading(false);
    }
  }, [ipcService, needsConfig]);

  const reviseTasksForThread = async function(channelId: UUID, threadId: UUID) {
    const newTasks = await ipcService.getRPC().getTasks({channelId, threadId});
    setTasks()
  }

  useEffect(() => {
    fetchAllTasks();
  }, [needsConfig]);

  const saveTask = useCallback(async (task: Task) => {
    const savedTask = await ipcService.getRPC().saveTask(task);
    setTasks(prev => {
      const existingIndex = prev.findIndex(t => t.id === savedTask.id);
      if (existingIndex >= 0) {
        const newTasks = [...prev];
        newTasks[existingIndex] = savedTask;
        return newTasks;
      }
      return [...prev, savedTask];
    });
    return savedTask;
  }, [ipcService]);

  const deleteTask = useCallback(async (taskId: UUID) => {
    await ipcService.getRPC().deleteTask(taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, [ipcService]);

  const markTaskComplete = useCallback(async (taskId: UUID, complete: boolean) => {
    const updatedTask = await ipcService.getRPC().markTaskComplete(taskId, complete);
    setTasks(prev => prev.map(t =>
      t.id === updatedTask.id ? updatedTask : t
    ));
  }, [ipcService]);

  const value = useMemo(() => ({
    tasks,
    isLoading,
    fetchAllTasks,
    saveTask,
    deleteTask,
    markTaskComplete,
  }), [tasks, isLoading, fetchAllTasks, saveTask, deleteTask, markTaskComplete]);

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
