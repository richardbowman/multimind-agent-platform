import { Agent } from "src/agents/agents";
import { ExecuteParams } from "src/agents/interfaces/ExecuteParams";
import { StepTask } from "src/agents/interfaces/ExecuteStepParams";
import { ReplanType, StepResult, StepResultType } from "src/agents/interfaces/StepResult";
import { StepBasedAgent } from "src/agents/stepBasedAgent";
import { ChatPost } from "src/chat/chatClient";
import Logger from "src/helpers/logger";
import { Artifact } from "src/tools/artifact";
import { ModelHelpers } from "./modelHelpers";
import { Project } from "src/tools/taskManager";
import { ChannelData } from "src/shared/channelTypes";
import { SchemaType } from "src/schemas/SchemaTypes";
import { json } from "stream/consumers";
import { getGeneratedSchema } from "src/helpers/schemaUtils";

export interface ContentRenderer<T> {
    (content: T): string;
}

export enum ContentType {
    ARTIFACTS_EXCERPTS = 'artifacts',
    ARTIFACTS_TITLES = 'artifact_titles',
    CONVERSATION = 'conversation',
    SEARCH_RESULTS = 'search_results',
    CODE = 'code',
    DOCUMENTS = 'documents',
    TASKS = 'tasks',
    GOALS = 'goals',
    STEP_RESULTS = 'step_results',
    EXECUTE_PARAMS = 'execute_params',
    AGENT_CAPABILITIES = 'agent_capabilities',
    AGENT_OVERVIEWS = 'agent_overviews',
    PURPOSE = "PURPOSE",
    CHANNEL = "CHANNEL",
    FINAL_INSTRUCTIONS = "FINAL_INSTRUCTIONS",
    OVERALL_GOAL = "OVERALL_GOAL",
    STEP_GOAL = "STEP_GOAL"
}

export enum OutputType {
    JSON_AND_MARKDOWN

}


export class PromptRegistry {
    private contentRenderers: Map<ContentType, ContentRenderer<any>> = new Map();

    constructor(private modelHelpers: ModelHelpers) {
        // Register default renderers
        this.registerRenderer(ContentType.PURPOSE, this.renderPurpose.bind(this));
        this.registerRenderer(ContentType.CHANNEL, this.renderChannel.bind(this));
        this.registerRenderer(ContentType.OVERALL_GOAL, this.renderOverallGoal.bind(this));
        this.registerRenderer(ContentType.FINAL_INSTRUCTIONS, this.renderFinalInstructions.bind(this));

        this.registerRenderer(ContentType.ARTIFACTS_TITLES, this.renderArtifactTitles.bind(this));
        this.registerRenderer(ContentType.ARTIFACTS_EXCERPTS, this.renderArtifacts.bind(this));
        this.registerRenderer(ContentType.CONVERSATION, this.renderConversation.bind(this));
        this.registerRenderer(ContentType.STEP_RESULTS, this.renderStepResults.bind(this));
        this.registerRenderer(ContentType.EXECUTE_PARAMS, this.renderExecuteParams.bind(this));
        this.registerRenderer(ContentType.AGENT_CAPABILITIES, this.renderAgentCapabilities.bind(this));
        this.registerRenderer(ContentType.AGENT_OVERVIEWS, this.renderAgentOverviews.bind(this));
        this.registerRenderer(ContentType.GOALS, this.renderGoals.bind(this));
        
        // Register type-specific step result renderers
        this.registerStepResultRenderer(StepResultType.Validation, this.renderValidationStep.bind(this));
        this.registerStepResultRenderer(StepResultType.Question, this.renderQuestionStep.bind(this));
        // Add more type-specific renderers as needed
    }

    private renderExecuteParams(params: ExecuteParams): string {
        let output = `🎯 Goal:\n${params.goal}\n\n`;
        
        if (params.step) {
            output += `🔧 Current Step:\n${params.step}\n\n`;
        }
        
        if (params.executionMode) {
            output += `⚙️ Execution Mode:\n${params.executionMode}\n\n`;
        }
        
        // if (params.context) {
        //     output += `📌 Context:\n${JSON.stringify(params.context, null, 2)}\n\n`;
        // }
        
        return output;
    }

    private stepResultRenderers = new Map<StepResultType, ContentRenderer<StepResult>>();

    registerStepResultRenderer(type: StepResultType, renderer: ContentRenderer<StepResult>): void {
        this.stepResultRenderers.set(type, renderer);
    }

    renderOverallGoal(goal: string) {
        return `OVERALL GOAL: ${goal}\n`;
    }

    renderPurpose() {
        return `OVERALL AGENT PURPOSE:
${this.modelHelpers.getPurpose()}
`;
    }

    renderFinalInstructions() {
        return `KEY INSTRUCTIONS:
${this.modelHelpers.getFinalInstructions()}
`;
    }

    renderChannel(channel: ChannelData) {
        return `CURRENT CHAT CHANNEL: ${channel.name} - ${channel.description}`;
    }

    private renderStepResults(steps: StepTask[]): string {
        const stepsWithResults = steps?.filter(s => s.props?.result?.type && s.props.result != undefined);
        if (!stepsWithResults || stepsWithResults.length === 0) return '';
        
        return "📝 Step History:\n\n" + stepsWithResults.map((step, index) => {
            const stepResult = step.props.result!;
            const typeRenderer = this.stepResultRenderers.get(stepResult.type!);
            if (typeRenderer) {
                return typeRenderer(stepResult);
            }
            // Default renderer for unknown types
            return `Step ${index + 1} (${stepResult.type}):\n${stepResult.response?.message}`;
        }).join('\n\n');
    }

    private renderValidationStep(step: StepResult): string {
        const metadata = step.response.metadata;
        return `🔍 Validation Step:\n` +
            `- Status: ${step.finished ? 'Complete' : 'In Progress'}\n` +
            `- Attempts: ${metadata?.validationAttempts || 1}\n` +
            `- Missing Aspects: ${metadata?.missingAspects?.join(', ') || 'None'}\n` +
            `- Replan: ${step.replan || ReplanType.None}\n` +
            `- Result: ${step.response.message}`;
    }

    private renderQuestionStep(step: StepResult): string {
        return `❓ Question Step:\n` +
            `- Question: ${step.response.message}\n` +
            `- Status: ${step.finished ? 'Answered' : 'Pending'}`;
    }

    registerRenderer<T>(contentType: ContentType, renderer: ContentRenderer<T>): void {
        this.contentRenderers.set(contentType, renderer);
    }

    getRenderer(contentType: ContentType): ContentRenderer<any> | undefined {
        return this.contentRenderers.get(contentType);
    }

    private renderArtifacts(artifacts: Artifact[]): string {
        if (!artifacts || artifacts.length === 0) return '';
        return "📁 Attached Artifacts:\n\n" + artifacts.map((artifact, index) => {
            let content = typeof artifact.content === 'string' 
                ? artifact.content
                : `[Binary data - ${artifact.content.length} bytes]`;
            
            // Truncate string content to 1000 chars
            if (typeof content === 'string' && content.length > 1000) {
                content = content.substring(0, 1000) + '... [truncated]';
            }
            
            return `Artifact ${index + 1} (${artifact.type}): ${artifact.metadata?.title || 'Untitled'}\n$\`\`\`${artifact.type}\n{content}\`\`\`\n`;
        }).join('\n\n');
    }

    private renderArtifactTitles(artifacts: Artifact[]): string {
        if (!artifacts || artifacts.length === 0) return '';
        return "📁 Attached Artifacts:\n\n" + artifacts.map((artifact, index) => {
            return `Artifact ${index + 1} (${artifact.type}): ${artifact.metadata?.title || 'Untitled'}`;
        }).join('\n\n');
    }

    private renderAgentCapabilities(agents: Agent[]): string {
        if (!agents || agents.length === 0) return '';
        
        return "🤖 OTHER AVAILABLE AGENTS FOR DELEGATION:\n\n" + agents.filter(a => a && a.messagingHandle && a.description).map(agent => {
            let output = `- ${agent.messagingHandle}: ${agent.description}`;

            // Get detailed capabilities for each agent that is a StepBasedAgent
            const capabilities = (agent as StepBasedAgent).getExecutorCapabilities?.() || []
            
            if (capabilities.length > 0) {
                output += `\n  ${agent.messagingHandle} CAPABILTIES:\n` + 
                    capabilities.map(cap => 
                        `    * ${cap.stepType}: ${cap.description}\n` +
                        (cap.exampleInput ? `      Example Input: ${cap.exampleInput}\n` : '') +
                        (cap.exampleOutput ? `      Example Output: ${cap.exampleOutput}` : '')
                    ).join('\n');
            }
            
            return output;
        }).join('\n\n');
    }

    private renderAgentOverviews(agents: Agent[]): string {
        if (!agents || agents.length === 0) return '';
        
        return "🤖 OTHER AVAILABLE AGENTS FOR DELEGATION:\n\n" + agents.filter(a => a && a.messagingHandle && a.description).map(agent => {
            let output = `- ${agent.messagingHandle}: ${agent.description}`;
            return output;
        }).join('\n');
    }

    private renderGoals(project: Project): string {
        if (!project) return '';
        
        let output = `🎯 Project: ${project.name}\n`;
        output += `📝 Description: ${project.metadata?.description || 'No description'}\n`;
        output += `📊 Status: ${project.metadata?.status || 'active'}\n\n`;
        
        if (project.tasks) {
            output += `📋 Tasks:\n` + 
                Object.values(project.tasks)
                    .sort((a, b) => (a.order || 0) - (b.order || 0))
                    .map((task, index) => 
                        `${index + 1}. ${task.description} (${task.complete ? 'completed' : 'pending'})`
                    ).join('\n');
        }
        
        return output;
    }

    private renderConversation(posts: ChatPost[]): string {
        if (!posts || posts.length === 0) return '';
        return "💬 Conversation Context:\n\n" + posts.filter(post => post && post.user_id && post.message).map(post => 
            `${post.user_id}: ${post.message}`
        ).join('\n');
    }
}

export class PromptBuilder {
    async addOutputInstructions(outputType: OutputType, schema?: SchemaType, specialInstructions?: string) {
        if (outputType === OutputType.JSON_AND_MARKDOWN && schema) {
            const schemaDef = await getGeneratedSchema(schema);
            this.addInstruction(`Please respond two code blocks. One enclosed \`\`\`json block format that follows this schema: ${JSON.stringify(schemaDef, null, 2)}. 
            Then, provide a separately enclosed \`\`\`markdown block. ${specialInstructions || ''}`);   
        }
    }
    private contentSections: Map<ContentType, any> = new Map();
    private instructions: string[] = [];
    private context: string[] = [];
    private registry: PromptRegistry;

    constructor(registry: PromptRegistry) {
        this.registry = registry;
    }

    registerRenderer<T>(contentType: ContentType, renderer: ContentRenderer<T>): void {
        this.registry.registerRenderer(contentType, renderer);
    }

    addContent<T>(contentType: ContentType, content?: T): void {
        this.contentSections.set(contentType, content);
    }

    addInstruction(instruction: string|undefined): void {
        if (instruction) this.instructions.push(instruction);
    }

    addContext(context: string): void {
        this.context.push(context);
    }

    build(): string {
        const sections: string[] = [];

        // Add context
        if (this.context.length > 0) {
            sections.push("## Context\n" + this.context.join('\n\n'));
        }

        // Render and add content sections
        for (const [contentType, content] of this.contentSections) {
            const renderer = this.registry.getRenderer(contentType);
            if (renderer) {
                const rendered = renderer(content);
                if (rendered) {
                    sections.push(`## ${contentType[0].toUpperCase()}${contentType.slice(1)}\n` + rendered);
                }
            } else {
                Logger.error(`PromptBuilder renderer for content type ${contentType} not found`);
            }
        }

        // Add instructions last
        if (this.instructions.length > 0) {
            sections.push("## INSTRUCTIONS\n" + this.instructions.join('\n\n'));
        }
        
        return sections.join('\n\n');
    }
}
