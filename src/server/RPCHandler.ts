import { BackendServicesWithWindows } from "../types/BackendServices";
import crypto from 'crypto';
import { dialog } from 'electron';
import { ClientMethods, ServerMethods } from "../shared/RPCInterface";
import fs from 'fs';
import path from 'path';
import mime from 'mime';
import Logger from "../helpers/logger";
import { ChatClient, ChatPost } from "../chat/chatClient";
import { ClientMessage, ClientTask } from "src/shared/types";
import { ClientChannel } from "src/shared/types";
import { ClientThread } from "src/shared/types";
import { CreateChannelHandlerParams, CreateChannelParams } from "src/shared/channelTypes";
import { GoalTemplates } from "src/schemas/goalTemplateSchema";
import { ClientProject } from "src/shared/types";
import { TaskManager, TaskType } from "src/tools/taskManager";
import { LimitedRPCHandler } from "./LimitedRPCHandler";
import { AppUpdater } from "electron-updater";
import { createUUID, UUID } from "src/types/uuid";
import { ChatHandle, createChatHandle, isChatHandle } from "src/types/chatHandle";

export class ServerRPCHandler extends LimitedRPCHandler implements ServerMethods {
    constructor(private services: BackendServicesWithWindows) {
        super(services);
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

    setupClientEvents(rpc: ClientMethods, autoUpdater: AppUpdater) {
        super.setupClientEvents(rpc, autoUpdater);

        // Set up log update notifications
        this.services.llmLogger.on("log", (logEntry) => {
            rpc.onLogUpdate({
                type: 'llm',
                entry: logEntry
            });
        })

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

        // Set up message receiving for the user client
        // Set up channel creation notifications
        this.services.chatClient.onAddedToChannel(async (channelId, params) => {
            const channel = await this.services.chatClient.getChannelData(channelId);
            rpc.onChannelCreated({
                id: channel.id,
                name: channel.name,
                members: channel.members || [],
                projectId: channel.projectId
            });
        });

        // Set up message receiving
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
                props: {
                    ...post.props,
                    attachments: post.attachments?.map(attachment => ({
                        ...attachment,
                        url: `/artifacts/${attachment.id}` // Ensure proper URL
                    }))
                },
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


    public setServices(services) {
        this.services = services;
    }

    async sendMessage(message: Partial<ClientMessage>): Promise<ClientMessage> {
        // Handle file uploads if present
        if (message.files && message.files.length > 0) {
            const uploadedAttachments: Attachment[] = [];
            
            for (const file of message.files) {
                // Convert file to base64
                const buffer = await file.arrayBuffer();
                const base64 = Buffer.from(buffer).toString('base64');
                
                // Create artifact
                const artifact = {
                    id: crypto.randomUUID(),
                    type: 'image',
                    content: base64,
                    metadata: {
                        title: file.name,
                        mimeType: file.type,
                        size: file.size,
                        binary: true
                    }
                };
                
                // Save artifact
                const savedArtifact = await this.services.artifactManager.saveArtifact(artifact);
                uploadedAttachments.push({
                    id: savedArtifact.id,
                    type: 'image',
                    url: `/artifacts/${savedArtifact.id}`,
                    name: file.name,
                    size: file.size
                });
                
                // Add to channel if needed
                if (message.channel_id) {
                    await this.services.chatClient.addArtifactToChannel(
                        message.channel_id,
                        savedArtifact.id
                    );
                }
            }
            
            // Add attachments to message props
            message.props = message.props || {};
            message.props.attachments = [
                ...(message.props.attachments || []),
                ...uploadedAttachments
            ];
        }

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

    async saveArtifact(artifact: Artifact): Promise<any> {
        // Convert base64 content back to Buffer if needed
        if (artifact.metadata?.binary && typeof artifact.content === 'string') {
            artifact.content = Buffer.from(artifact.content, 'base64');
        }
        
        await this.services.artifactManager.saveArtifact(artifact);
        return this.processArtifactContent(artifact);
    }

    async addArtifactToChannel(channelId: string, artifactId: string): Promise<void> {
        await this.services.chatClient.addArtifactToChannel(channelId, artifactId);
    }

    async removeArtifactFromChannel(channelId: string, artifactId: string): Promise<void> {
        await this.services.chatClient.removeArtifactFromChannel(channelId, artifactId);
    }

    async getHandles(): Promise<Array<{id: string; handle: string}>> {
        const handleSet = await this.services.chatClient.getHandles();
        const handles = Object.entries(handleSet).map(([id, name]) => ({
            id,
            handle: name
        }));
        return handles;
    }

    private static async mapHandles(chatClient: ChatClient, agentList: (UUID|ChatHandle)[]) : Promise<UUID[]> {
        const ids : UUID[] = [];
        const handles = await chatClient.getHandles();
        if (!handles) {
            throw new Error(`Could not get handles map`);
        }

        for(const agentRef of agentList) {
            if (isChatHandle(agentRef)) {
                // Find the agent ID that matches this handle
                const idx = Object.values(handles).findIndex((handle, index) => handle === agentRef);
                if (idx == -1) {
                    throw new Error(`Agent with handle @${handle} not found`);
                }
                ids.push(createUUID(Object.keys(handles)[idx]));
            } else {
                ids.push(agentRef)
            }
        } 
        
        return ids;
    }

    public static async createChannelHelper(chatClient: ChatClient, taskManager: TaskManager, params: CreateChannelHandlerParams) : Promise<CreateChannelParams> {
        // Always include the RouterAgent in the channel members
        const router = createChatHandle('@router');

        let members = [...(params.members || []), router];
        // Use the selected default responder or fallback to router-agent
        const defaultResponder = params.defaultResponderId || router;

        // If a goal template is specified, create a project with its tasks
        let projectId;
        if (params.goalTemplate) {
            const template = GoalTemplates.find(t => t.id === params.goalTemplate);
            if (template) {
                // Resolve agent handles to IDs
                const resolvedAgents = await this.mapHandles(chatClient, template.supportingAgents);

                // Create project with resolved agent IDs
                const project = await taskManager.createProject({
                    name: params.name,
                    tasks: template.initialTasks.map((task, i) => ({
                        description: task.description,
                        type: TaskType.Goal,
                        category: task.type,
                        assignee: task.metadata?.agent ? resolvedAgents[i] : undefined
                    })),
                    metadata: {
                        description: params.description || '',
                        tags: template.tags
                    }
                });
                projectId = project.id;

                // Add supporting agents to channel members if not already present
                const existingMembers = new Set(params.members || []);
                resolvedAgents.forEach(agentId => {
                    if (!existingMembers.has(agentId)) {
                        members.push(agentId);
                    }
                });
            }
        }

        const defaultResponderId = (await this.mapHandles(chatClient, [defaultResponder]))[0];
        const memberIds = [...new Set(await this.mapHandles(chatClient, members))];

        return {
            name: params.name,
            artifactIds: params.artifactIds,
            defaultResponderId: defaultResponderId,
            projectId: projectId,
            description: params.description,
            goalTemplate: params.goalTemplate,
            isPrivate: params.isPrivate,
            members: memberIds,
        }
    }

    async createChannel(params: CreateChannelHandlerParams): Promise<string> {
        const mappedParams = await ServerRPCHandler.createChannelHelper(this.services.chatClient, this.services.taskManager, params);
        return await this.services.chatClient.createChannel(mappedParams);
    }

    async deleteChannel(channelId: UUID): Promise<void> {
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

    async showFileDialog(): Promise<void> {
        const mainWindow = this.services.mainWindow.getWindow();
        
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: 'Images', extensions: ['jpg', 'png', 'gif', 'webp'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (!result.canceled && result.filePaths.length > 0) {
            // Convert file paths to File objects
            const files = await Promise.all(result.filePaths.map(async (filePath) => {
                const fileData = await fs.promises.readFile(filePath);
                return new File([fileData], path.basename(filePath), {
                    type: mime.getType(filePath) || 'application/octet-stream'
                });
            }));

            // Send files back to client via callback
            this.services.clientMethods?.onFilesSelected(files);
        }
    }

    async openDevTools(): Promise<void> {
        if (process.env.NODE_ENV === 'development') {
            const mainWindow = this.services.mainWindow.getWindow();
            mainWindow.webContents.openDevTools();
        }
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
