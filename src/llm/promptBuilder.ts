import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType } from "src/agents/interfaces/StepResult";
import { StepBasedAgent } from "src/agents/stepBasedAgent";
import Logger from "src/helpers/logger";
import { ModelHelpers } from "./modelHelpers";
import { SchemaType } from "src/schemas/SchemaTypes";
import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { AgentCapabilitiesContent, AgentOverviewsContent, ChannelContent, ContentInput, ExecuteParamsContent, GoalsContent, IntentContent, StepResponseContent, ArtifactsExcerptsContent, ArtifactsFullContent, ArtifactsTitlesContent, ConversationContent, OverallGoalContent, FullGoalsContent, StepsContent } from "./ContentTypeDefinitions";
import { InputPrompt } from "src/prompts/structuredInputPrompt";
import { IntentionsResponse } from "src/schemas/goalAndPlan";
import { ExecutorType } from "src/agents/interfaces/ExecutorType";

export interface ContentRenderer<T> {
    (content: T): string;
}

export enum ContentType {
    ARTIFACTS_EXCERPTS = 'artifacts',
    ARTIFACTS_TITLES = 'artifact_titles',
    ARTIFACTS_FULL = 'artifacts_full',
    CONVERSATION = 'conversation',
    SEARCH_RESULTS = 'search_results',
    CODE = 'code',
    DOCUMENTS = 'documents',
    TASKS = 'tasks',
    CHANNEL_GOALS = 'goals',
    STEP_RESPONSE = 'step_results',
    EXECUTE_PARAMS = 'execute_params',
    AGENT_CAPABILITIES = 'agent_capabilities',
    AGENT_OVERVIEWS = 'agent_overviews',
    PURPOSE = "PURPOSE",
    CHANNEL = "CHANNEL",
    FINAL_INSTRUCTIONS = "FINAL_INSTRUCTIONS",
    OVERALL_GOAL = "OVERALL_GOAL",
    STEP_GOAL = "STEP_GOAL",
    ABOUT = "ABOUT",
    INTENT = "INTENT",
    VALIDATION_RESULTS = "VALIDATION_RESULTS",
    GOALS_FULL = "GOALS_FULL",
    STEPS = "STEPS"
}

export enum OutputType {
    JSON_AND_MARKDOWN

}


export class PromptRegistry {
    private contentRenderers: Map<ContentType, ContentRenderer<any>> = new Map();

    constructor(private modelHelpers: ModelHelpers) {
        // Register default renderers
        this.registerRenderer(ContentType.ABOUT, this.renderAboutAgent.bind(this));
        this.registerRenderer(ContentType.INTENT, this.renderIntent.bind(this));

        this.registerRenderer(ContentType.PURPOSE, this.renderPurpose.bind(this));
        this.registerRenderer(ContentType.CHANNEL, this.renderChannel.bind(this));
        this.registerRenderer(ContentType.OVERALL_GOAL, this.renderOverallGoal.bind(this));
        this.registerRenderer(ContentType.FINAL_INSTRUCTIONS, this.renderFinalInstructions.bind(this));

        this.registerRenderer(ContentType.ARTIFACTS_TITLES, this.renderArtifactTitles.bind(this));
        this.registerRenderer(ContentType.ARTIFACTS_EXCERPTS, this.renderArtifactExcerpts.bind(this));
        this.registerRenderer(ContentType.ARTIFACTS_FULL, this.renderArtifacts.bind(this));
        this.registerRenderer(ContentType.CONVERSATION, this.renderConversation.bind(this));
        this.registerRenderer(ContentType.STEP_RESPONSE, this.renderStepResults.bind(this));
        this.registerRenderer(ContentType.STEPS, this.renderSteps.bind(this));
        this.registerRenderer(ContentType.EXECUTE_PARAMS, this.renderExecuteParams.bind(this));
        this.registerRenderer(ContentType.AGENT_CAPABILITIES, this.renderAgentCapabilities.bind(this));
        this.registerRenderer(ContentType.AGENT_OVERVIEWS, this.renderAgentOverviews.bind(this));
        
        this.registerRenderer(ContentType.GOALS_FULL, this.renderAllGoals.bind(this));
        this.registerRenderer(ContentType.CHANNEL_GOALS, this.renderChannelGoals.bind(this));

        // Register type-specific step result renderers
        this.registerStepResultRenderer(StepResponseType.Validation, this.renderValidationStep.bind(this));
        this.registerStepResultRenderer(StepResponseType.Question, this.renderQuestionStep.bind(this));
        // Add more type-specific renderers as needed
    }

    private renderAboutAgent() {
        return `🤖 Agent: ${this.modelHelpers.messagingHandle}
📝 Purpose: ${this.modelHelpers.getPurpose()}`
    };

    private renderIntent({params} : IntentContent) {
        const intents = params.previousResult?.filter(r => r.type === StepResponseType.Intent).slice(-1);
        if (intents?.length == 1) {
            const intent = intents[0].data as IntentionsResponse;
            return `🤖 My Intention: ${intent.intention}\nWorking Plan: ${intent.plan.map((p, i) => (i+1)===intent.currentFocus? ` - **CURRENT GOAL: ${p}**` :` - ${p}`).join('\n')}`
        } else {
            return `🤖 My Intention: [No intentions set yet.]`
        }
    };

    private renderAllGoals({params} : FullGoalsContent) {
        return `${this.renderIntent({contentType: ContentType.INTENT, params})}
${params.overallGoal && this.renderOverallGoal({contentType: ContentType.OVERALL_GOAL, goal: params.overallGoal})}
${params.stepGoal && `CURRENT STEP GOAL: ${params.stepGoal}`}`;
    };


    private renderExecuteParams({params}: ExecuteParamsContent): string {
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

    private stepResultRenderers = new Map<StepResponseType, ContentRenderer<StepResponse>>();

    registerStepResultRenderer(type: StepResponseType, renderer: ContentRenderer<StepResponse>): void {
        this.stepResultRenderers.set(type, renderer);
    }

    renderOverallGoal({goal}: OverallGoalContent) {
        return `USER'S OVERALL GOAL: ${goal}\n`;
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

    renderChannel({channel} : ChannelContent) {
        return `CURRENT CHAT CHANNEL: ${channel.name} - ${channel.description}`;
    }

    private renderSteps({steps} : StepsContent): string {
        const filteredSteps = steps.filter(s => s.props.result && s.props.stepType !== ExecutorType.NEXT_STEP);
        return "# 📝 STEP HISTORY:\n" + 
            filteredSteps.map((step, index) => {
                const stepResult = step.props.result!;
                if (stepResult.response.type) {
                    const typeRenderer = this.stepResultRenderers.get(stepResult.response.type);
                    if (typeRenderer) {
                        return typeRenderer(stepResult.response);
                    }
                }
                // Default renderer for unknown types
                return `- STEP ${index + 1} of ${filteredSteps.length} ${index+1==filteredSteps.length?"[LAST COMPLETED STEP]":""}: [${step.props.stepType}]: ${stepResult?.response.message}`;
            }).join('\n') + "\n";
    }

    private renderStepResults({responses} : StepResponseContent): string {
        return "📝 Past Step Results:\n" + responses.map((stepResult, index) => {
            if (stepResult.type) {
                const typeRenderer = this.stepResultRenderers.get(stepResult.type!);
                if (typeRenderer) {
                    return typeRenderer(stepResult);
                }
            }
            // Default renderer for unknown types
            return `Step ${index + 1} (${stepResult.type}):\n${stepResult.message}`;
        }).join('\n') + "\n";
    }

    private renderValidationStep(response : StepResponse): string {
        const metadata = response.data;
        return `🔍 Validation Step:\n` +
            `- Attempts: ${metadata?.validationAttempts || 1}\n` +
            `- Missing Aspects: ${metadata?.missingAspects?.join(', ') || 'None'}\n` +
            `- Result: ${response.message}`;
    }

    private renderQuestionStep(response : StepResponse): string {
        return ` -❓Question: ${response.message}\n`
    }

    registerRenderer<T>(contentType: ContentType, renderer: ContentRenderer<T>): void {
        this.contentRenderers.set(contentType, renderer);
    }

    getRenderer(contentType: ContentType): ContentRenderer<any> | undefined {
        return this.contentRenderers.get(contentType);
    }

    private renderArtifacts({artifacts} : ArtifactsFullContent): string {
        if (!artifacts || artifacts.length === 0) return '';
        return "📁 Attached Artifacts:\n\n" + artifacts.map((artifact, index) => {
            let content = typeof artifact.content === 'string'
                ? artifact.content
                : `[Binary data - ${artifact.content.length} bytes]`;

            return `Artifact Index:${index + 1} (${artifact.type}): ${artifact.metadata?.title || 'Untitled'}\n$\`\`\`${artifact.type}\n${content}\n\`\`\`\n`;
        }).join('\n\n');
    }

    private renderArtifactExcerpts({artifacts}: ArtifactsExcerptsContent): string {
        if (!artifacts || artifacts.length === 0) return '';
        return "📁 Attached Artifacts:\n\n" + artifacts.map((artifact, index) => {
            let content = typeof artifact.content === 'string'
                ? artifact.content
                : `[Binary data - ${artifact.content.length} bytes]`;

            // Truncate string content to 1000 chars
            if (typeof content === 'string' && content.length > 1000) {
                content = content.substring(0, 1000) + '... [truncated]';
            }

            return `Artifact Index:${index + 1} (${artifact.type}): ${artifact.metadata?.title || 'Untitled'}\n$\`\`\`${artifact.type}\n${content}\n\`\`\`\n`;
        }).join('\n\n');
    }

    private renderArtifactTitles({artifacts}: ArtifactsTitlesContent): string {
        if (!artifacts || artifacts.length === 0) return '';
        return "📁 Attached Artifacts:\n\n" + artifacts.map((artifact, index) => {
            return `Artifact Index:${index + 1} (${artifact.type}): ${artifact.metadata?.title || 'Untitled'}`;
        }).join('\n\n');
    }

    private renderAgentCapabilities({agents} : AgentCapabilitiesContent): string {
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

    private renderAgentOverviews({agents} : AgentOverviewsContent): string {
        if (!agents || agents.length === 0) return '';

        return "🤖 OTHER AVAILABLE AGENTS FOR DELEGATION:\n\n" + agents.filter(a => a && a.messagingHandle && a.description).map(agent => {
            let output = `- ${agent.messagingHandle}: ${agent.description}`;
            return output;
        }).join('\n');
    }

    private renderChannelGoals({tasks}: GoalsContent): string {
        if (!tasks || tasks.length == 0) return '';

        let output = `🎯 In this channel, there are a ${tasks.length} of high-level goals associated:`;
        output += `📋 CHANNEL GOALS:\n` +
            Object.values(tasks)
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((task, index) =>
                    `${index + 1}. ${task.description} (${task.complete ? 'completed' : 'pending'})`
                ).join('\n');
        return output;
    }

    private renderProject({project}): string {
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

    private renderConversation({posts}: ConversationContent): string {
        if (!posts || posts.length === 0) return '';
        return "💬 Conversation Context:\n\n" + posts.filter(post => post && post.user_id && post.message).map(post =>
            `${post.user_id}: ${post.message}`
        ).join('\n');
    }
}

export class PromptBuilder implements InputPrompt {
    getInstructions(): string {
        return this.build();
    }
    
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

    /**
     * @deprecated
     */
    addContent<T>(contentType: ContentType, content?: T): void {
        this.contentSections.set(contentType, {
            contentType: contentType,
            params: content
        });
    }

    addInstruction(instruction?: ContentInput): void {
        if (typeof instruction === 'string') {
            this.instructions.push(instruction);
        } else if (instruction) {
            const renderer = this.registry.getRenderer(instruction.contentType);
            if (renderer) {
                const rendered = renderer(instruction);
                if (rendered) {
                    this.instructions.push(rendered);
                } else {
                    Logger.error(`PromptBuilder renderer for content type ${instruction.contentType} not found`);
                }
            }
        }
    }

    addContext(context?: ContentInput): void {
        if (typeof context === 'string') {
            this.context.push(context);
        } else if (context) {
            const renderer = this.registry.getRenderer(context.contentType);
            if (renderer) {
                const rendered = renderer(context);
                if (rendered) {
                    this.context.push(rendered);
                } else {
                    Logger.warn(`PromptBuilder renderer for content type ${context.contentType} provided no content`);
                }
            } else {
                Logger.error(`PromptBuilder renderer for content type ${context.contentType} not found`);
            }
        }
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
