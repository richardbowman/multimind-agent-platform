import { ConfigurableAgent } from './configurableAgent';
import { AgentConstructorParams } from "./interfaces/AgentConstructorParams";
import { ArtifactManager } from "src/tools/artifact";
import { ArtifactType } from "src/tools/artifact";
import { UUID } from "src/types/uuid";
import { ConfigurationError } from "src/errors/ConfigurationError";

export class MarkdownConfigurableAgent extends ConfigurableAgent {
    private configArtifactId?: UUID;

    constructor(params: AgentConstructorParams) {
        super(params);
        this.configArtifactId = params.config?.configArtifactId;
    }

    async initialize() {
        if (!this.configArtifactId) {
            throw new ConfigurationError('No config artifact ID provided');
        }

        // Load and parse the markdown config
        const artifact = await this.artifactManager.getArtifact(this.configArtifactId);
        if (artifact.type !== ArtifactType.Document) {
            throw new ConfigurationError('Config artifact must be a document type');
        }

        const markdownConfig = await this.parseMarkdownConfig(artifact.content);
        await this.applyMarkdownConfig(markdownConfig);

        // Continue with normal initialization
        await super.initialize();
    }

    private async parseMarkdownConfig(content: string): Promise<Record<string, any>> {
        const config: Record<string, any> = {};
        const lines = content.split('\n');

        let currentSection: string | null = null;
        
        for (const line of lines) {
            // Parse section headers
            const sectionMatch = line.match(/^#+\s*(.+)/);
            if (sectionMatch) {
                currentSection = sectionMatch[1].toLowerCase().replace(/\s+/g, '_');
                continue;
            }

            // Parse key-value pairs
            const kvMatch = line.match(/^\s*-\s*(.+?):\s*(.+)/);
            if (kvMatch && currentSection) {
                const key = kvMatch[1].trim();
                const value = kvMatch[2].trim();
                
                if (!config[currentSection]) {
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
            }
        }

        return config;
    }

    private async applyMarkdownConfig(config: Record<string, any>) {
        // Apply basic agent configuration
        if (config.agent) {
            this.agentName = config.agent.name || this.agentName;
            this.supportsDelegation = config.agent.supports_delegation || false;
        }

        // Apply planner configuration
        if (config.planner) {
            if (config.planner.type === 'nextStep') {
                this.planner = null;
            } else if (config.planner.type === 'advanced') {
                const planner = new MultiStepPlanner(
                    this.llmService,
                    this.taskManager,
                    this.userId,
                    this.modelHelpers,
                    this.stepExecutors,
                    this.agents
                );
                planner.modelType = ModelType.ADVANCED_REASONING;
                this.planner = planner;
            }
        }

        // Apply any additional configuration from the markdown
        this.config = {
            ...this.config,
            ...config
        };
    }
}
