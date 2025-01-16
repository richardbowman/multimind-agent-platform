import type { LogParam } from '../../../../llm/LLMLogger';
import type { DataContextMethods } from '../contexts/DataContext';
import { ClientMessage, ClientTask } from '../../../../shared/types';

export const useClientMethods = () => {
  const contextMethods = useWebSocket();
  const { showSnackbar } = useSnackbar();
  
  return useMemo(() => ({
    return {
        onClientLogProcessed: async (success, message) => {
            return
        },

        onMessage: async (messages: ClientMessage[]) => {
            // Find the latest message not in current thread
            const latestMessage = messages
                .filter(message =>
                    message.channel_id !== contextMethods.currentChannelId &&
                    message.thread_id !== contextMethods.currentThreadId
                )
                .sort((a, b) => b.create_at - a.create_at)[0];

            if (latestMessage) {
                const channelName = contextMethods.channels.find(c => c.id === latestMessage.channel_id)?.name || 'a channel';
                showSnackbar({
                    message: `New message in ${channelName}`,
                    severity: 'info',
                    persist: true,
                    onClick: () => {
                        // Set both channel and thread first
                        contextMethods.setCurrentChannelId(latestMessage.channel_id);
                        contextMethods.setCurrentThreadId(latestMessage.thread_id || null);

                        // Fetch related tasks and artifacts
                        contextMethods.fetchChannels();
                        contextMethods.fetchTasks(latestMessage.channel_id, latestMessage.thread_id || null);
                        contextMethods.fetchArtifacts(latestMessage.channel_id, latestMessage.thread_id || null);
                    }
                });
            };

            // Update messages directly in context
            contextMethods.setMessages(prev => {
                const filteredPrev = prev.filter(prevMessage =>
                    !messages.some(newMessage => newMessage.id === prevMessage.id)
                );
                return [...filteredPrev, ...messages].sort((a, b) => a.create_at - b.create_at);
            });

            // Check for artifact references
            const hasArtifactLinks = messages.some(message =>
                message.message?.includes('artifact:') ||
                message.props?.artifactIds?.length > 0
            );

            // Only refresh artifacts if messages contain artifact references
            if (hasArtifactLinks && contextMethods.currentChannelId) {
                await contextMethods.fetchArtifacts(
                    contextMethods.currentChannelId,
                    contextMethods.currentThreadId
                );
            }
        },

        onLogUpdate: (update: LogParam) => {
            if (update.type === 'llm') {
                contextMethods.setLogs(prev => ({
                    ...prev,
                    llm: {
                        ...prev.llm,
                        [update.entry.service]: [
                            ...(prev.llm[update.entry.service] || []),
                            update.entry
                        ]
                    }
                }));
            } else if (update.type === 'system') {
                contextMethods.setLogs(prev => ({
                    ...prev,
                    system: {
                        logs: [
                            ...(prev.system.logs || []),
                            update.entry
                        ],
                        total: (prev.system.total || 0) + 1
                    }
                }));
            }
        },

        onBackendStatus: (status: { configured: boolean; ready: boolean; message?: string }) => {
            contextMethods.setNeedsConfig(!status.configured);
            if (status.configured) {
                // Trigger initial data fetch when backend is ready
                Promise.all([
                    contextMethods.fetchChannels(),
                    contextMethods.fetchHandles()
                ]).catch(console.error);
            }
        },

        onTaskUpdate: (task: ClientTask) => {
            contextMethods.setTasks(prevTasks => {
                // Find and replace the updated task
                const existingIndex = prevTasks.findIndex(t => t.id === task.id);
                if (existingIndex >= 0) {
                    const newTasks = [...prevTasks];
                    newTasks[existingIndex] = task;
                    return newTasks;
                }
                // If it's a new task, add it to the list
                return [...prevTasks, task];
            });
        },

        onProjectUpdate(project) {
            console.log('project update not handled yet');
        }
    }
}
