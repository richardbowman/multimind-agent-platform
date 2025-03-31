import { ConfigurableAgent } from './configurableAgent';
import { AgentConstructorParams } from "./interfaces/AgentConstructorParams";
import { ArtifactItem, ArtifactMetadata, ArtifactType } from "src/tools/artifact";
import { ConfigurationError } from "src/errors/ConfigurationError";
import { getExecutorMetadata } from './decorators/executorDecorator';
import { TaskManager } from 'src/tools/taskManager';
import Logger from 'src/helpers/logger';
import { createChatHandle, isChatHandle } from 'src/types/chatHandle';
import path from 'path';
import { ExecutorConfig } from 'src/tools/AgentConfig';
import { StringUtils } from 'src/utils/StringUtils';

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
        await this.applyMarkdownConfig(artifact.metadata, markdownConfig);

        // Continue with normal initialization
        await super.initialize();
    }

    private async parseMarkdownConfig(content: string): Promise<Record<string, any>> {
        const config: Record<string, any> = {};

        // Parse the rest of the markdown content
        const { marked } = await import('marked');
        const tokens = marked.lexer(content);

        let currentSection: string | null = null;

        for (const token of tokens) {
            try {
                if (token.type === 'heading') {
                    // Convert heading text to section key
                    currentSection = token.text.toLowerCase().replace(/\s+/g, '_');
                    continue;
                }

                if (token.type === 'paragraph' && currentSection) {
                    // Handle plain text sections
                    if (!config[currentSection]) {
                        config[currentSection] = '';
                    }
                    config[currentSection] += token.text.trim() + '\n';
                }
                else if (token.type === 'list' && currentSection) {
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
                                if (StringUtils.isString(config[currentSection])) {
                                    config[currentSection] += "\n - " + itemText;
                                } else {
                                    // Add simple checklist items to array
                                    config[currentSection].push(itemText);
                                }
                            }
                        } else {
                            if (StringUtils.isString(config[currentSection])) {
                                config[currentSection] += "\n - " + text;
                            } else {
                                // Add simple checklist items to array
                                config[currentSection].push(text);
                            }
                        }
                    }
                }
            } catch (error) {
                Logger.error(error);
            }
        }

        return config;
    }


    private async applyMarkdownConfig(metadata: ArtifactMetadata, config: Record<string, any>) {
        // Apply basic agent configuration from frontmatter
        if (metadata.name) {
            this.agentName = metadata.name;
        }
        if (metadata.description) {
            this.description = metadata.description;
        }
        if (metadata.supportsDelegation) {
            this.supportsDelegation = metadata.supportsDelegation;
        }

        if (!config.purpose) {
            Logger.warn(`Agent ${this.agentName} missing purpose`);
        }

        // Map executors from frontmatter
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
        this.setPurpose(config.purpose, config.finalInstructions);
        this.agentConfig = {
            ...this.agentConfig,
            purpose: config.purpose,
            plannerType: metadata.plannerType,
            supportsDelegation: metadata.supportsDelegation,
            executors: config.executors
        };
    }

    private async loadExecutorClass(executorKey: string): Promise<ExecutorConfig> {
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
                    // Extract just the filename without extension
                    const fileName = path.basename(modulePath, '.ts');
                    return {
                        className: fileName,
                        config: {}
                    };
                }
            }
        }

        throw new Error(`Could not find executor class with key ${executorKey}`);
    }
}
