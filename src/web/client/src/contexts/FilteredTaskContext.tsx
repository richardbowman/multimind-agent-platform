import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { Task } from '../../../../tools/taskManager';
import { useTasks } from './TaskContext';
import { useThreadMessages } from './ThreadMessageContext';
import { UUID } from '../../../../types/uuid';
import { useIPCService } from './IPCContext';

interface FilteredTaskContextType {
  filteredTasks: Task[];
  taskId: UUID | null;
  currentTask: Task | null;
  isLoading: boolean;
  isChannelView: boolean;
  setTaskId: React.Dispatch<React.SetStateAction<UUID | null>>;
}

const FilteredTaskContext = createContext<FilteredTaskContextType | null>(null);

export const FilteredTaskProvider = ({ 
  channelId,
  threadId,
  children 
}: { 
  channelId: UUID | null;
  threadId: UUID | null;
  children: React.ReactNode 
}) => {
  const ipcService = useIPCService();
  const { tasks, isLoading } = useTasks();
  const { threadMessages } = useThreadMessages();
  const [taskId, setTaskId] = useState<UUID | null>(null);
  const [currentTask, setLoadedTask] = useState<Task | null>(null);
  const [isLoadingTask, setIsLoadingTask] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setLoadedTask(null);
      return;
    }

    const loadTask = async () => {
      setIsLoadingTask(true);
      try {
        const task = await ipcService.getRPC().getTask(taskId);
        setLoadedTask(task);
      } catch (error) {
        console.error('Failed to load task:', error);
        setLoadedTask(null);
      } finally {
        setIsLoadingTask(false);
      }
    };

    loadTask();
  }, [taskId]);
  
  // Get task IDs from thread messages
  const threadTaskIds = useMemo(() => {
    const ids = new Set(
      threadMessages
        .flatMap(msg => msg.props?.taskIds || [])
        .filter(Boolean)
    );
    return ids;
  }, [threadMessages]);

  const filteredTasks = useMemo(() => {
    if (!channelId) return [];
    
    // Filter tasks that are referenced in the thread messages
    const list = tasks.filter(task => 
      threadTaskIds.has(task.id)
    );
    return list;
  }, [tasks, threadTaskIds]);

  const value = useMemo(() => ({
    filteredTasks,
    currentTask,
    taskId,
    setTaskId,
    isLoading: isLoading || isLoadingTask,
    isChannelView: !!channelId && !threadId
  }), [filteredTasks, currentTask, isLoading, taskId, setTaskId, channelId, threadId]);

  return (
    <FilteredTaskContext.Provider value={value}>
      {children}
    </FilteredTaskContext.Provider>
  );
};

export const useFilteredTasks = () => {
  const context = useContext(FilteredTaskContext);
  if (!context) {
    throw new Error('useFilteredTasks must be used within a FilteredTaskProvider');
  }
  return context;
};
