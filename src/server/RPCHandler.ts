import { BackendServices, BackendServicesConfigNeeded, BackendServicesWithWindows } from "../types/BackendServices";
import { ClientMethods, ServerMethods } from "../shared/RPCInterface";
import Logger from "../helpers/logger";
import { ChatPost } from "../chat/chatClient";
import { ClientMessage, ClientTask } from "src/shared/types";
import { ClientChannel } from "src/shared/types";
import { ClientThread } from "src/shared/types";
import { LLMCallLogger } from "../llm/LLMLogger";
import { reinitializeBackend } from "../main.electron";
import { CreateChannelParams } from "src/shared/channelTypes";
import { GoalTemplates } from "src/schemas/goalTemplateSchema";
import { Settings } from "src/tools/settings";
import { getClientSettingsMetadata } from "src/tools/settingsDecorators";
import { LLMServiceFactory } from "src/llm/LLMServiceFactory";
import { ModelInfo } from "src/llm/types";
import { EmbedderModelInfo } from "src/llm/ILLMService";
import { ClientProject } from "src/shared/types";
import { TaskType } from "src/tools/taskManager";

export class ServerRPCHandler implements ServerMethods {
    createWrapper(): ServerMethods {
        const handler = this;
        return new Proxy({} as ServerMethods, {
            get(target, prop) {
                if (typeof handler[prop as keyof ServerMethods] === 'function') {
                    return async (...args: any[]) => {
                        try {
                            const result = await (handler[prop as keyof ServerMethods] as Function).apply(handler, args);
                            return result;
                        } catch (error) {
                            Logger.error(`Error in wrapped handler method ${String(prop)}:`, error);
                            throw error;
                        }
                    };
                }
                return undefined;
            }
        });
    }

    async getSettings(): Promise<Settings> {
        const settings = this.services.settingsManager.getSettings();

        // test getting defaults
        // const defaults = new Settings();
        // const clientSettings = getClientSettingsMetadata(defaults);

        return settings;
    }

    async getAvailableModels(provider: string): Promise<ModelInfo[]> {
        const service = LLMServiceFactory.createServiceByName(provider, this.services.settingsManager.getSettings());
        return service.getAvailableModels();
    }

    async getAvailableEmbedders(provider: string): Promise<EmbedderModelInfo[]> {
        const service = LLMServiceFactory.createServiceByName(provider, this.services.settingsManager.getSettings());
        return service.getAvailableEmbedders();
    }

    async markTaskComplete(taskId: string, complete: boolean): Promise<ClientTask> {
        const task = await this.services.taskManager.completeTask(taskId);
        return {
            id: task.id,
            projectId: task.projectId,
            description: task.description,
            type: task.type,
            assignee: task.assignee,
            inProgress: task.inProgress || false,
            complete: task.complete || false,
            threadId: task.props?.threadId || null,
            createdAt: task.props?.createdAt,
            updatedAt: task.props?.updatedAt,
            dependsOn: task.dependsOn,
            props: task.props
        };
    }

    async getProject(projectId: string): Promise<ClientProject> {
        const project = this.services.taskManager.getProject(projectId);
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }
        
        // Convert to client-friendly format
        return {
            id: project.id,
            name: project.name,
            props: project.props,
            tasks: Object.values(project.tasks).map(task => ({
                id: task.id,
                description: task.description,
                projectId: task.projectId,
                type: task.type,
                assignee: task.assignee,
                inProgress: task.inProgress || false,
                complete: task.complete || false,
                threadId: task.props?.threadId || null,
                createdAt: task.props?.createdAt,
                updatedAt: task.props?.updatedAt,
                dependsOn: task.dependsOn,
                props: task.props
            })),
            metadata: project.metadata
        };
    }

    async rebuildVectorDB(): Promise<void> {
        Logger.info('Rebuilding VectorDB...');

        const _s = await this.getSettings();

        Logger.info(`Reindexing collection: ${_s.chromaCollection}`);
        await this.services.vectorDB.reindexCollection(_s.chromaCollection);

        await this.services.artifactManager.indexArtifacts(true);
        
        Logger.info('VectorDB rebuild complete');
    }
    
    async updateSettings(settings: Partial<Settings>): Promise<Settings> {
        Logger.info('Update settings called');
        
        this.services.settingsManager.updateSettings(settings);

        // Reinitialize backend services
        try {
            await reinitializeBackend();
        } catch (err) {
            console.log(err);
        }

        return this.services.settingsManager.getSettings();
    }

    setupClientEvents(rpc: ClientMethods) {
        if (this.services?.taskManager) {
            // Set up project update notifications
            this.services.taskManager.on('projectUpdated', ({project : Project}) => {
                const clientProject = {
                    id: project.id,
                    name: project.name,
                    props: project.props,
                    tasks: Object.values(project.tasks).map(task => ({
                        id: task.id,
                        description: task.description,
                        projectId: task.projectId,
                        type: task.type,
                        assignee: task.assignee,
                        inProgress: task.inProgress || false,
                        complete: task.complete || false,
                        threadId: task.props?.threadId || null,
                        createdAt: task.props?.createdAt,
                        updatedAt: task.props?.updatedAt,
                        dependsOn: task.dependsOn,
                        props: task.props
                    })),
                    metadata: project.metadata
                };
                rpc.onProjectUpdate(clientProject);
            });

            // Set up task update notifications
            this.services.taskManager.on('taskUpdated', ({task}) => {
                rpc.onTaskUpdate({
                    id: task.id,
                    projectId: task.projectId,
                    description: task.description,
                    type: task.type,
                    assignee: task.assignee,
                    inProgress: task.inProgress || false,
                    complete: task.complete || false,
                    threadId: task.metadata?.threadId || null,
                    createdAt: task.metadata?.createdAt,
                    updatedAt: task.metadata?.updatedAt,
                    dependsOn: task.dependsOn,
                    props: task.props
                });
            });
        }

        // Set up message receiving for the user client
        if (this.services?.chatClient) {
            this.services.chatClient.receiveMessages(async (post: ChatPost) => {
                // Get all messages to calculate reply count
                const messages = await this.services.chatClient.fetchPreviousMessages(post.channel_id, 1000);
                
                // Create the new message
                const rpcMessage = {
                    id: post.id,
                    channel_id: post.channel_id,
                    message: post.message,
                    user_id: post.user_id,
                    create_at: post.create_at,
                    directed_at: post.directed_at,
                    props: post.props,
                    thread_id: post.getRootId(),
                    reply_count: 0 // New messages start with 0 replies
                };

                // If this is a reply, get and update the parent message
                const parentId = post.getRootId();
                if (parentId) {
                    const parentMessage = messages.find(p => p.id === parentId);
                    if (parentMessage) {
                        const parentReplyCount = messages.filter(p => p.getRootId() === parentId).length;
                        const parentRpcMessage = {
                            id: parentMessage.id,
                            channel_id: parentMessage.channel_id,
                            message: parentMessage.message,
                            user_id: parentMessage.user_id,
                            create_at: parentMessage.create_at,
                            directed_at: parentMessage.directed_at,
                            props: parentMessage.props,
                            thread_id: parentMessage.getRootId(),
                            reply_count: parentReplyCount
                        };
                        // Send both the new message and updated parent
                        rpc.onMessage([rpcMessage, parentRpcMessage]);
                        return;
                    }
                }
                
                // If not a reply, just send the new message
                rpc.onMessage([rpcMessage]);
            });
        }

        if (this.services?.llmLogger) {
            // Set up log update notifications
            this.services.llmLogger.on("log", (logEntry) => {
                rpc.onLogUpdate({
                    type: 'llm',
                    entry: logEntry
                });
            });
        }

        // Listen for configuration errors
        // this.services.settings.on("configurationError", (error) => {
        //     rpc.onBackendStatus({ 
        //         configured: false, 
        //         ready: false,
        //         message: error.message 
        //     });
        // });
    }
    
    constructor(private services: BackendServicesConfigNeeded|BackendServicesWithWindows) {
    }

    public setServices(services) {
        this.services = services;
    }

    async sendMessage(message: Partial<ClientMessage>): Promise<ClientMessage> {
        if (message.thread_id) {
            return await this.services.chatClient.postReply(
                message.thread_id,
                message.channel_id!,
                message.message!,
                message.props
            );
        } else {
            return await this.services.chatClient.postInChannel(
                message.channel_id!,
                message.message!,
                message.props
            );
        }
    }

    async getMessages({ channelId, threadId, limit }: { channelId: string; threadId: string | null; limit?: number }): Promise<ClientMessage[]> {
        const messages = await this.services.chatClient.fetchPreviousMessages(channelId, 1000);

        let channelMessages = messages
            .filter(post => post.channel_id === channelId)
            .map(post => {
                // Count replies for this message
                const replyCount = messages.filter(p => p.getRootId() === post.id).length;

                return {
                    id: post.id,
                    channel_id: post.channel_id,
                    message: post.message,
                    user_id: post.user_id,
                    create_at: post.create_at,
                    directed_at: post.directed_at,
                    props: post.props,
                    thread_id: post.getRootId(),
                    reply_count: replyCount
                };
            })
            .slice(-(limit||100));
        return channelMessages;
    }

    async getThreads({ channelId }: { channelId: string }): Promise<ClientThread[]> {
        const posts = await this.services.chatClient.fetchPreviousMessages(channelId);
        const threadMap = new Map<string, any>();

        posts.forEach(post => {
            const rootId = post.getRootId();
            if (rootId) {
                // This is a reply - add to existing thread
                if (threadMap.has(rootId)) {
                    threadMap.get(rootId).replies.push({
                        id: post.id,
                        channel_id: post.channel_id,
                        message: post.message,
                        user_id: post.user_id,
                        create_at: post.create_at,
                        directed_at: post.directed_at,
                        props: post.props
                    });
                    // Update last_message_at if this reply is newer
                    if (post.create_at > threadMap.get(rootId).last_message_at) {
                        threadMap.get(rootId).last_message_at = post.create_at;
                    }
                }
            } else {
                // This is a root message - create new thread
                threadMap.set(post.id, {
                    rootMessage: {
                        id: post.id,
                        channel_id: post.channel_id,
                        message: post.message,
                        user_id: post.user_id,
                        create_at: post.create_at,
                        directed_at: post.directed_at,
                        props: post.props
                    },
                    replies: [],
                    last_message_at: post.create_at,
                    channel_id: post.channel_id
                });
            }
        });

        // Convert map to array and sort by last_message_at
        return Array.from(threadMap.values())
            .sort((a, b) => b.last_message_at - a.last_message_at);
    }

    async getChannels(): Promise<ClientChannel[]> {
        if (!this.services?.chatClient) {
            throw new Error('Chat client is not initialized');
        }
        const channels = await this.services.chatClient.getChannels();
        return channels.map(channel => ({
            id: channel.id,
            name: channel.name.replace('#', ''),
            description: channel.description,
            members: channel.members || [],
            projectId: channel.projectId
        }));
    }

    async getTasks({ channelId, threadId }: { channelId: string; threadId: string | null }): Promise<any[]> {
        // Get all posts for this channel/thread
        const posts = (await this.services.chatClient.fetchPreviousMessages(channelId, 500)).filter(post => {
            if (threadId) {
                return post.getRootId() === threadId || post.id === threadId;
            }
            return true;
        });

        const channelData = await this.services.chatClient.getChannelData(channelId);

        // Extract project IDs from posts
        const projectIds = [
            ...new Set(posts.map(p => p.props["project-id"])),
            channelData.projectId
        ].filter(id => id != undefined);
        
        // Get tasks from storage that match these project IDs and convert to ClientTask format
        const tasks = projectIds.flatMap(projectId => {
            const project = this.services.taskManager.getProject(projectId);
            if (!project) return [];
            
            return Object.values(project.tasks).map(task => ({
                id: task.id,
                description: task.description,
                projectId: task.projectId,
                type: task.type,
                assignee: task.assignee,
                inProgress: task.inProgress || false,
                complete: task.complete || false,
                threadId: task.props?.threadId || null,
                createdAt: task.props?.createdAt,
                updatedAt: task.props?.updatedAt,
                dependsOn: task.dependsOn,
                props: task.props
            }));
        });

        return tasks;
    }

    async getArtifacts({ channelId, threadId }: { channelId: string; threadId: string | null }): Promise<any[]> {
        // Get all messages for this channel/thread
        const messages = await this.services.chatClient.fetchPreviousMessages(channelId, 1000);
        const filteredMessages = messages.filter(message => {
            if (threadId) {
                return message.getRootId() === threadId || message.id === threadId;
            }
            return true;
        });

        // Collect all artifact IDs from message metadata
        const artifactIds = filteredMessages
            .flatMap(message => message.props['artifact-ids'] || [])
            .filter((id): id is string => !!id); // Filter out undefined/null

        // Get the actual artifacts
        const allArtifacts = await this.services.artifactManager.listArtifacts();
        const artifacts = allArtifacts.filter(artifact => 
            artifactIds.includes(artifact.id)
        );

        return artifacts.map(artifact => this.processArtifactContent(artifact));
    }

    async getAllArtifacts(): Promise<any[]> {
        return (await this.services.artifactManager.listArtifacts())
            .map(artifact => this.processArtifactContent(artifact));
    }

    async deleteArtifact(artifactId: string): Promise<any[]> {
        await this.services.artifactManager.deleteArtifact(artifactId);
        return this.getAllArtifacts();
    }

    async addArtifactToChannel(channelId: string, artifactId: string): Promise<void> {
        await this.services.chatClient.addArtifactToChannel(channelId, artifactId);
    }

    async removeArtifactFromChannel(channelId: string, artifactId: string): Promise<void> {
        await this.services.chatClient.removeArtifactFromChannel(channelId, artifactId);
    }

    async getSystemLogs(params: {
        limit?: number;
        offset?: number;
        filter?: {
            level?: string[];
            search?: string;
            startTime?: number;
            endTime?: number;
        };
    }): Promise<{
        logs: LogEntry[];
        total: number;
    }> {
        return this.services.logReader.getLogs(params || {});
    }

    async getLogs(logType: 'llm' | 'system' | 'api', params?: {
        limit?: number;
        offset?: number;
        filter?: {
            level?: string[];
            search?: string;
            startTime?: number;
            endTime?: number;
        };
    }): Promise<any> {
        switch (logType) {
            case 'llm':
                return await LLMCallLogger.getAllLogs();
            case 'system':
                return this.getSystemLogs(params || {});
            case 'api':
                return { logs: [], total: 0 }; // TODO: Implement API logs
            default:
                return { logs: [], total: 0 };
        }
    }

    async logClientEvent(level: string, message: string, details?: Record<string, any>): Promise<void> {
        try {
            // Log to both the main logger and LLM logger
            Logger.log(level, `[CLIENT] ${message}`, details);
        } catch (error) {
            Logger.error('Failed to process client log event:', error);
        }
    }

    async getHandles(): Promise<Array<{id: string; handle: string}>> {
        const handleSet = await this.services.chatClient.getHandles();
        const handles = Object.entries(handleSet).map(([id, name]) => ({
            id,
            handle: name
        }));
        return handles;
    }

    async createChannel(params: CreateChannelParams): Promise<string> {
        if (!this.services?.chatClient) {
            throw new Error('Chat client is not initialized');
        }

        // Always include the RouterAgent in the channel members
        params.members = [...(params.members || []), 'router-agent'];
        // Use the selected default responder or fallback to router-agent
        params.defaultResponderId = params.defaultResponderId || 'router-agent';

        // If a goal template is specified, create a project with its tasks
        if (params.goalTemplate) {
            const template = GoalTemplates.find(t => t.id === params.goalTemplate);
            if (template) {
                // Resolve agent handles to IDs
                const resolvedAgents = await Promise.all(
                    template.supportingAgents.map(async (agentRef) => {
                        if (agentRef.startsWith('@')) {
                            // Lookup agent by handle
                            const handles = await this.services.chatClient?.getHandles();
                            if (!handles) {
                                throw new Error(`Could not get handles map`);
                            }
                            // Find the agent ID that matches this handle
                            const agentEntry = Object.entries(handles).find(([id, name]) => name === agentRef);
                            if (!agentEntry) {
                                throw new Error(`Agent with handle @${handle} not found`);
                            }
                            return agentEntry[0]; // Return the ID
                        }
                        // Assume it's already an ID
                        return agentRef;
                    })
                );

                // Create project with resolved agent IDs
                const project = await this.services.taskManager.createProject({
                    name: params.name,
                    tasks: template.initialTasks.map((task, i) => ({
                        description: task.description,
                        type: TaskType.Goal,
                        category: task.type,
                        assignee: task.metadata?.agent ? resolvedAgents[i] : undefined
                    })),
                    metadata: {
                        description: params.description || '',
                        tags: template.tags,
                        supportingAgents: resolvedAgents
                    }
                });
                const projectId = project.id;

                // Associate the project with the channel
                params.projectId = projectId;
                
                // Add supporting agents to channel members if not already present
                const existingMembers = new Set(params.members || []);
                resolvedAgents.forEach(agentId => {
                    if (!existingMembers.has(agentId)) {
                        params.members = [...(params.members || []), agentId];
                    }
                });
            }
        }

        return await this.services.chatClient.createChannel(params);
    }

    async deleteChannel(channelId: string): Promise<void> {
        if (!this.services?.chatClient) {
            throw new Error('Chat client is not initialized');
        }
        await this.services.chatClient.deleteChannel(channelId);
    }

    async minimizeWindow(): Promise<void> {
        const mainWindow = this.services.mainWindow.getWindow();
        mainWindow.minimize();
    }

    async maximizeWindow(): Promise<void> {
        const mainWindow = this.services.mainWindow.getWindow();
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }

    async closeWindow(): Promise<void> {
        const mainWindow = this.services.mainWindow.getWindow();
        mainWindow.close();
    }

    async getWindowState(): Promise<'maximized' | 'normal'> {
        const mainWindow = this.services.mainWindow.getWindow();
        return mainWindow.isMaximized() ? 'maximized' : 'normal';
    }

    processArtifactContent(artifact: any) {
        const content = Buffer.isBuffer(artifact.content)
            ? artifact.metadata?.binary
                ? artifact.content.toString('base64')
                : artifact.content.toString('utf8')
            : artifact.content.toString();
        return { ...artifact, content };
    }
}
