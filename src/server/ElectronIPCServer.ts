import { ipcMain, BrowserWindow } from 'electron';
import { createBirpc } from 'birpc';
import { BackendServices } from '../types/BackendServices';
import { MessageHandler } from './MessageHandler';
import { createSafeServerRPCHandlers } from './rpcUtils';
import { ClientMethods, ServerMethods } from '../web/client/src/shared/RPCInterface';
import { trackPromise } from '../helpers/errorHandler';
import Logger from '../helpers/logger';

export class ElectronIPCServer {
    private handler: MessageHandler;
    private rpc: ReturnType<typeof createBirpc<ClientMethods, ServerMethods>>;

    constructor(private services: BackendServices, private mainWindow: BrowserWindow) {
        this.handler = new MessageHandler(services);
        this.setupRPC();
    }

    private setupRPC() {
        const safeHandlers = createSafeServerRPCHandlers();

        this.rpc = createBirpc<ClientMethods, ServerMethods>(
            {
                // Implement all ServerMethods
                sendMessage: async (message) => {
                    try {
                        return await trackPromise(this.handler.handleSendMessage(message));
                    } catch (error) {
                        Logger.error('Error in sendMessage:', error);
                        throw error;
                    }
                },
                getMessages: async ({ channelId, threadId, limit }) => {
                    try {
                        return await this.handler.handleGetMessages({
                            channelId,
                            threadId,
                            limit
                        });
                    } catch (error) {
                        Logger.error('Error in getMessages:', error);
                        throw error;
                    }
                },
                getChannels: async () => {
                    try {
                        return await this.handler.handleGetChannels();
                    } catch (error) {
                        Logger.error('Error in getChannels:', error);
                        throw error;
                    }
                },
                getTasks: async ({ channelId, threadId }) => {
                    try {
                        return await this.handler.handleGetTasks({
                            channelId,
                            threadId
                        });
                    } catch (error) {
                        Logger.error('Error in getTasks:', error);
                        throw error;
                    }
                },
                getArtifacts: async ({ channelId, threadId }) => {
                    try {
                        return await this.handler.handleGetArtifacts({
                            channelId,
                            threadId
                        });
                    } catch (error) {
                        Logger.error('Error in getArtifacts:', error);
                        throw error;
                    }
                },
                getAllArtifacts: async () => {
                    try {
                        return await this.handler.handleGetAllArtifacts();
                    } catch (error) {
                        Logger.error('Error in getAllArtifacts:', error);
                        throw error;
                    }
                },
                deleteArtifact: async (artifactId) => {
                    try {
                        return await this.handler.handleDeleteArtifact(artifactId);
                    } catch (error) {
                        Logger.error('Error in deleteArtifact:', error);
                        throw error;
                    }
                },
                getLogs: async (logType) => {
                    try {
                        return await this.handler.handleGetLogs(logType);
                    } catch (error) {
                        Logger.error('Error in getLogs:', error);
                        throw error;
                    }
                },
                getHandles: async () => {
                    try {
                        return await this.handler.handleGetHandles();
                    } catch (error) {
                        Logger.error('Error in getHandles:', error);
                        throw error;
                    }
                },
                getSettings: async () => {
                    try {
                        return await this.handler.handleGetSettings();
                    } catch (error) {
                        Logger.error('Error in getSettings:', error);
                        throw error;
                    }
                },
                updateSettings: async (settings) => {
                    try {
                        return await this.handler.handleUpdateSettings(settings);
                    } catch (error) {
                        Logger.error('Error in updateSettings:', error);
                        throw error;
                    }
                }
            },
            {
                ...safeHandlers,
                post: (data) => this.mainWindow.webContents.send('birpc', data),
                on: (handler) => {
                    ipcMain.on('birpc', (_, data) => handler(data));
                    return () => ipcMain.removeListener('birpc', handler);
                }
            }
        );

        // Set up message receiving for the user client
        this.services.chatClient.receiveMessages((post) => {
            const rpcMessage = {
                id: post.id,
                channel_id: post.channel_id,
                message: post.message,
                user_id: post.user_id,
                create_at: post.create_at,
                directed_at: post.directed_at,
                props: post.props,
                thread_id: post.getRootId()
            };
            this.rpc.onMessage([rpcMessage]);
        });

        // Set up log update notifications
        this.services.llmLogger.on("log", (logEntry) => {
            this.rpc.onLogUpdate({
                type: 'llm',
                entry: logEntry
            });
        });
    }

    cleanup() {
        // Remove all IPC handlers
        ipcMain.removeAllListeners('birpc');
    }
}
