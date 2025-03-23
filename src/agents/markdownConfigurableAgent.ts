import { ConfigurableAgent } from './configurableAgent';
import { AgentConstructorParams } from "./interfaces/AgentConstructorParams";
import { ArtifactItem, ArtifactType } from "src/tools/artifact";
import { UUID } from "src/types/uuid";
import { ConfigurationError } from "src/errors/ConfigurationError";
import { getExecutorMetadata } from './decorators/executorDecorator';
import { ModelType } from "src/llm/types/ModelType";
import { MultiStepPlanner } from './planners/multiStepPlanner';
import { TaskManager } from 'src/tools/taskManager';
import Logger from 'src/helpers/logger';
import { createChatHandle, isChatHandle } from 'src/types/chatHandle';

export interface MarkdownAgentConstructorParams extends AgentConstructorParams {
    configArtifact: ArtifactItem;
}

export class MarkdownConfigurableAgent extends ConfigurableAgent {
    private configArtifact?: ArtifactItem;
    private taskManager: TaskManager;

    constructor(params: MarkdownAgentConstructorParams) { 
        if (isChatHandle(params.configArtifact.metadata?.chatHandle)) {
            params.messagingHandle = createChatHandle(params.configArtifact.metadata?.chatHandle);
        } else {
            throw new Error("Invalid chat handle metadata, can't begin configuring agent");
        }
        super(params);
        this.configArtifact = params.configArtifact;
        this.taskManager = params.taskManager;
    }

    async initialize() {
        if (!this.configArtifact) {
            throw new ConfigurationError('No config artifact provided');
        }

        // Load and parse the markdown config
        const artifact = await this.artifactManager.loadArtifact(this.configArtifact.id);
        if (!artifact || artifact.type !== ArtifactType.Document) {
            throw new ConfigurationError('Config artifact must be a document type');
        }

        const markdownConfig = await this.parseMarkdownConfig(artifact.content.toString());
        await this.applyMarkdownConfig(markdownConfig);

        // Continue with normal initialization
        await super.initialize();
    }

    private async parseMarkdownConfig(content: string): Promise<Record<string, any>> {
        const config: Record<string, any> = {};
        const { marked } = await import('marked');
        const tokens = marked.lexer(content);

        let currentSection: string | null = null;

        for (const token of tokens) {
            if (token.type === 'heading') {
                // Convert heading text to section key
                currentSection = token.text.toLowerCase().replace(/\s+/g, '_');
                continue;
            }

            if (token.type === 'list' && currentSection) {
                // Initialize section as array if it's a list
                if (!config[currentSection]) {
                    config[currentSection] = [];
                }

                for (const item of token.items) {
                    const text = item.text.trim();
                    
                    // Handle checklist items (starts with [ ] or [x])
                    const checklistMatch = text.match(/^\[(x|\s)\]\s*(.+)/);
                    if (checklistMatch) {
                        const isChecked = checklistMatch[1] === 'x';
                        const itemText = checklistMatch[2].trim();
                        
                        // For executors section, only include checked items
                        if (currentSection === 'executors' && !isChecked) {
                            continue;
                        }
                        
                        // Handle key-value pairs in checklist items
                        const kvMatch = itemText.match(/^(.+?):\s*(.+)/);
                        if (kvMatch) {
                            const key = kvMatch[1].trim();
                            const value = kvMatch[2].trim();
                            
                            // Convert section to object if we find key-value pairs
                            if (Array.isArray(config[currentSection])) {
                                config[currentSection] = {};
                            }

                            // Try to parse numbers/booleans
                            if (/^\d+$/.test(value)) {
                                config[currentSection][key] = parseInt(value, 10);
                            } else if (/^\d+\.\d+$/.test(value)) {
                                config[currentSection][key] = parseFloat(value);
                            } else if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
                                config[currentSection][key] = value.toLowerCase() === 'true';
                            } else {
                                config[currentSection][key] = value;
                            }
                        } else {
                            // Add simple checklist items to array
                            config[currentSection].push(itemText);
                        }
                    } else {
                        // Handle regular list items
                        const kvMatch = text.match(/^(.+?):\s*(.+)/);
                        if (kvMatch) {
                            const key = kvMatch[1].trim();
                            const value = kvMatch[2].trim();
                            
                            // Convert section to object if we find key-value pairs
                            if (Array.isArray(config[currentSection])) {
                                config[currentSection] = {};
                            }

                            // Try to parse numbers/booleans
                            if (/^\d+$/.test(value)) {
                                config[currentSection][key] = parseInt(value, 10);
                            } else if (/^\d+\.\d+$/.test(value)) {
                                config[currentSection][key] = parseFloat(value);
                            } else if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
                                config[currentSection][key] = value.toLowerCase() === 'true';
                            } else {
                                config[currentSection][key] = value;
                            }
                        } else {
                            // Add simple list items to array
                            config[currentSection].push(text);
                        }
                    }
                }
            }
        }

        return config;
    }

    private async applyMarkdownConfig(config: Record<string, any>) {
        // Apply basic agent configuration
        if (config.agent) {
            this.agentName = config.agent.name;
        }

        if (!config.purpose) {
            Logger.warn(`Agent ${this.agentName} missing purpose`);
        }

        // Map executors action types back to class names for ConfigurableAgent to load
        if (config.executors) {
            let executors: string[] = [];
            // Handle both list and object formats
            if (Array.isArray(config.executors)) {
                executors = config.executors;
            } else if (typeof config.executors === 'object') {
                executors = Object.keys(config.executors);
            }

            config.executors = await Promise.all(executors.map(async executorKey => {
                try {
                    return await this.loadExecutorClass(executorKey);
                } catch (error) {
                    Logger.error(`Failed to register executor ${executorKey}:`, error);
                }
            }));
        }

        // Apply any additional configuration from the markdown
        this.agentConfig = {
            ...this.agentConfig,
            plannerType: config.agent.plannerType,
            supportsDelegation: config.agent.supportsDelegation,
            ...config
        };
    }

    private async loadExecutorClass(executorKey: string): Promise<string> {
        // Create require context for executors directory
        const executorContext = (require as any).context('./executors', true, /\.ts$/);
        
        // Search through all executors for a match
        for (const modulePath of executorContext.keys()) {
            const module = executorContext(modulePath);
            const executorClass = module.default || Object.values(module).find(
                (exp: any) => typeof exp === 'function'
            );
            
            if (executorClass) {
                const metadata = getExecutorMetadata(executorClass);
                if (metadata && metadata.key === executorKey) {
                    return modulePath;
                }
            }
        }


        throw new Error(`Could not find executor class with key ${executorKey}`);
    }
}
