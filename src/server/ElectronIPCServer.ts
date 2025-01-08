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
    private rpc: ReturnType<typeof createBirpc<ClientMethods, ServerMethods>>|undefined;

    constructor(private services: BackendServices, private mainWindow: BrowserWindow) {
        this.handler = new MessageHandler(services);
        this.setupRPC();
    }

    private setupRPC() {
        const safeHandlers = createSafeServerRPCHandlers();

        this.rpc = createBirpc<ClientMethods, ServerMethods>(
            this.handler.createWrapper(),
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
            if (this.rpc) this.rpc.onMessage([rpcMessage]);
        });

        // Set up log update notifications
        this.services.llmLogger.on("log", (logEntry) => {
            if (this.rpc) this.rpc.onLogUpdate({
                type: 'llm',
                entry: logEntry
            });
        });
    }

    cleanup() {
        // Remove all IPC handlers
        if (this.rpc) this.rpc.$close();
    }
}
