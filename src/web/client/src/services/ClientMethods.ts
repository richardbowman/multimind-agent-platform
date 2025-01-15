import type { ClientMessage } from '../../../../shared/IPCInterface';
import type { LogParam } from '../../../../llm/LLMLogger';
import type { DataContextMethods } from '../contexts/DataContext';
import { ClientMethods } from '../../../../shared/RPCInterface';
import { ClientTask } from '../../../../shared/types';

export const createClientMethods = (contextMethods: DataContextMethods) => ({
    onMessage: async (messages: ClientMessage[]) => {
        // Check for messages not in current thread
        messages.forEach(message => {
            if (message.channel_id !== contextMethods.currentChannelId || 
                message.thread_id !== contextMethods.currentThreadId) {
                
                const channelName = contextMethods.channels.find(c => c.id === message.channel_id)?.name || 'a channel';
                contextMethods.showSnackbar({
                    message: `New message in ${channelName}`,
                    severity: 'info',
                    persist: true,
                    onClick: () => {
                        // Set both channel and thread first
                        contextMethods.setCurrentChannelId(message.channel_id);
                        contextMethods.setCurrentThreadId(message.thread_id || null);
                        
                        // Then fetch the messages for the new channel/thread
                        contextMethods.setMessages([]); // Clear current messages
                        ipcService.getRPC().getMessages({
                            channelId: message.channel_id, 
                            threadId: message.thread_id
                        }).then(newMessages => {
                            contextMethods.setMessages(newMessages);
                        });
                        
                        // Fetch related tasks and artifacts
                        contextMethods.fetchTasks(message.channel_id, message.thread_id || null);
                        contextMethods.fetchArtifacts(message.channel_id, message.thread_id || null);
                    }
                });
            }
        });

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
    },
} as ClientMethods);
