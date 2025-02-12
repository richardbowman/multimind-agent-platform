import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType } from "src/agents/interfaces/StepResult";
import { StepBasedAgent } from "src/agents/stepBasedAgent";
import Logger from "src/helpers/logger";
import { ModelHelpers } from "./modelHelpers";
import { SchemaType } from "src/schemas/SchemaTypes";
import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { AgentCapabilitiesContent, AgentOverviewsContent, ChannelNameContent, ContentInput, ExecuteParamsContent, GoalsContent, IntentContent, StepResponseContent, ArtifactsExcerptsContent, ArtifactsFullContent, ArtifactsTitlesContent, ConversationContent, OverallGoalContent, FullGoalsContent, StepsContent, TasksContent, ChannelDetailsContent } from "./ContentTypeDefinitions";
import { InputPrompt } from "src/prompts/structuredInputPrompt";
import { IntentionsResponse } from "src/schemas/goalAndPlan";
import { ExecutorType } from "src/agents/interfaces/ExecutorType";
import { StringUtils } from "src/utils/StringUtils";
import { JSONSchema } from "./ILLMService";

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
    CHANNEL_AGENT_CAPABILITIES = 'agent_capabilities',
    AGENT_OVERVIEWS = 'agent_overviews',
    PURPOSE = "PURPOSE",
    CHANNEL = "CHANNEL",
    CHANNEL_DETAILS = "CHANNEL_DETAILS",
    FINAL_INSTRUCTIONS = "FINAL_INSTRUCTIONS",
    OVERALL_GOAL = "OVERALL_GOAL",
    STEP_GOAL = "STEP_GOAL",
    ABOUT = "ABOUT",
    INTENT = "INTENT",
    VALIDATION_RESULTS = "VALIDATION_RESULTS",
    GOALS_FULL = "GOALS_FULL",
    STEPS = "STEPS",
    ALL_AGENTS = "ALL_AGENTS"
}

export enum OutputType {
    JSON_AND_MARKDOWN,
    JSON_WITH_MESSAGE,
    JSON_WITH_MESSAGE_AND_REASONING
}


export class PromptRegistry {
    private contentRenderers: Map<ContentType, ContentRenderer<any>> = new Map();

    constructor(private modelHelpers: ModelHelpers) {
        // Register default renderers
        this.registerRenderer(ContentType.ABOUT, this.renderAboutAgent.bind(this));
        this.registerRenderer(ContentType.INTENT, this.renderIntent.bind(this));

        this.registerRenderer(ContentType.PURPOSE, this.renderPurpose.bind(this));
        this.registerRenderer(ContentType.CHANNEL, this.renderChannel.bind(this));
        this.registerRenderer(ContentType.CHANNEL_DETAILS, this.renderChannelDetails.bind(this));
        this.registerRenderer(ContentType.OVERALL_GOAL, this.renderOverallGoal.bind(this));
        this.registerRenderer(ContentType.FINAL_INSTRUCTIONS, this.renderFinalInstructions.bind(this));

        this.registerRenderer(ContentType.ARTIFACTS_TITLES, this.renderArtifactTitles.bind(this));
        this.registerRenderer(ContentType.ARTIFACTS_EXCERPTS, this.renderArtifactExcerpts.bind(this));
        this.registerRenderer(ContentType.ARTIFACTS_FULL, this.renderArtifacts.bind(this));

        this.registerRenderer(ContentType.CONVERSATION, this.renderConversation.bind(this));
        
        this.registerRenderer(ContentType.TASKS, this.renderTasks.bind(this));

        this.registerRenderer(ContentType.STEP_RESPONSE, this.renderStepResponses.bind(this));
        this.registerRenderer(ContentType.STEPS, this.renderSteps.bind(this));
        this.registerRenderer(ContentType.EXECUTE_PARAMS, this.renderExecuteParams.bind(this));
        this.registerRenderer(ContentType.CHANNEL_AGENT_CAPABILITIES, this.renderAgentCapabilities.bind(this));
        this.registerRenderer(ContentType.ALL_AGENTS, this.renderFullAgentList.bind(this));
        this.registerRenderer(ContentType.AGENT_OVERVIEWS, this.renderAgentOverviews.bind(this));
        
        this.registerRenderer(ContentType.GOALS_FULL, this.renderAllGoals.bind(this));
        this.registerRenderer(ContentType.CHANNEL_GOALS, this.renderChannelGoals.bind(this));

        // Register type-specific step result renderers
        this.registerStepResponseRenderer(StepResponseType.Validation, this.renderValidationResponse.bind(this));
        this.registerStepResponseRenderer(StepResponseType.Question, this.renderQuestionResponse.bind(this));
        this.registerStepResponseRenderer(StepResponseType.Tasks, this.renderTasksResponse.bind(this));
        // Add more type-specific renderers as needed
    }

    private renderAboutAgent() {
        return `📝 About MultiMind:
MultiMind is an advanced AI research assistant platform that provides multiple agents that can help:
- Task automation
- Web-based research
- Brainstorming
- Content generation including documents, diagrams, spreadsheets, and charts
- Work with CSV and Markdown

Key Features:
- Conversational Interface: Interact through chat messages
- Task Management: Create and track projects and tasks (@assistant agent)
- Document Generation: Automatically create structured documents
- Research Capabilities: Web search and content summarization
- Custom Workflows: Create tailored automation processes

📝 Agent Purpose: ${this.modelHelpers.getPurpose()}
`;
    };

    private renderIntent({params} : IntentContent) {
        const intents = params.previousResponses?.filter(r => r.type === StepResponseType.Intent).slice(-1);
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
            output += `⚙️ Execution Mode:\n${params.executionMode === 'task' ? 'You are running asynchronously as a background task. You cannot ask questions of the user, and will need to make assumptions.' : 'You are in conversation mode speaking with the user.'}\n\n`;
        }

        // if (params.context) {
        //     output += `📌 Context:\n${JSON.stringify(params.context, null, 2)}\n\n`;
        // }

        return output;
    }

    private stepResponseRenderers = new Map<StepResponseType, ContentRenderer<StepResponse>>();

    registerStepResponseRenderer(type: StepResponseType, renderer: ContentRenderer<StepResponse>): void {
        this.stepResponseRenderers.set(type, renderer);
    }

    renderOverallGoal({goal}: OverallGoalContent) {
        return `USER'S OVERALL GOAL: ${goal}\n`;
    }

    /**
     * @deprecated Use About instead
     **/
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

    renderChannel({channel} : ChannelNameContent) {
        return `CURRENT CHAT CHANNEL: ${channel.name} - ${channel.description}`;
    }

    private renderChannelDetails({channel, tasks, artifacts} : ChannelDetailsContent): string {
        let output = `📌 Channel Details:\n`;
        output += `- Name: ${channel.name}\n`;
        output += `- Description: ${channel.description || 'No description'}\n`;
        output += `- Type: ${channel.isPrivate ? 'Private' : 'Public'}\n`;
        
        if (channel.projectId) {
            output += `- Project ID: ${channel.projectId}\n`;
        }

        if (tasks && tasks.length > 0) {
            output += `\n📋 Channel Tasks (${tasks.length}):\n`;
            output += tasks.map((task, index) => 
                `  ${index + 1}. ${task.description} (Status: ${task.status})`
            ).join('\n');
        }

        if (artifacts && artifacts.length > 0) {
            output += `\n📁 Channel Artifacts (${artifacts.length}):\n`;
            output += artifacts.map((artifact, index) => 
                `  ${index + 1}. ${artifact.metadata?.title || 'Untitled'} (Type: ${artifact.type})`
            ).join('\n');
        }

        return output;
    }

    private renderSteps({steps} : StepsContent): string {
        const filteredSteps = steps.filter(s => s.props.result && s.props.stepType !== ExecutorType.NEXT_STEP);
        return "# 📝 STEP HISTORY:\n" + 
            filteredSteps.map((step, index) => {
                const stepResult = step.props.result!;
                let body;
                if (stepResult.response.type) {
                    const typeRenderer = this.stepResponseRenderers.get(stepResult.response.type);
                    if (typeRenderer) {
                        body = typeRenderer(stepResult.response);
                    }
                }
                // Default renderer for unknown types
                return `- STEP ${index + 1} of ${filteredSteps.length} ${index+1==filteredSteps.length?"[LAST COMPLETED STEP]":""}:
   Step Type [${step.props.stepType}]
   Step Description: ${step.description}
   Step Result: <stepInformation>${body||stepResult.response.message||stepResult.response.reasoning||stepResult.response.status}</stepInformation>`;
            }).join('\n') + "\n";
    }

    private renderStepResponses({responses} : StepResponseContent): string {
        return "📝 Past Step Responses:\n" + responses.filter(r => r).map((stepResponse, index) => {
            let body;
            if (stepResponse.type) {
                const typeRenderer = this.stepResponseRenderers.get(stepResponse.type!);
                if (typeRenderer) {
                    body = typeRenderer(stepResponse);
                }
            }
            // Default renderer for unknown types
        return `Step ${index + 1} (${stepResponse.type??""}):\n<stepInformation>${body||stepResponse.message||stepResponse.reasoning||stepResponse.status}</stepInformation>`;
        }).join('\n') + "\n";
    }

    private renderValidationResponse(response : StepResponse): string {
        const metadata = response.data;
        return `🔍 Validation Step:\n` +
            `- Attempts: ${metadata?.validationAttempts || 1}\n` +
            `- Missing Aspects: ${metadata?.missingAspects?.join(', ') || 'None'}\n` +
            `- Result: ${response.message}`;
    }

    private renderQuestionResponse(response : StepResponse): string {
        return ` -❓Question: ${response.message}\n`
    }

    private renderTasksResponse(response : StepResponse): string {
        return ` - 📁 Tasks for ${response.data?.messagingHandle||"[unknown]"} (${response.data?.tasks.length}): ${response.data?.tasks?.map((t, i) => `  TASK ${i+1}. ID:[${t.id}] ${t.description}`).join("\n")}\n\n`
    }

    registerRenderer<T>(contentType: ContentType, renderer: ContentRenderer<T>): void {
        this.contentRenderers.set(contentType, renderer);
    }

    registerChannelDetailsRenderer(renderer: ContentRenderer<ChannelDetailsContent>): void {
        this.registerRenderer(ContentType.CHANNEL_DETAILS, renderer);
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

            let metadataInfo = '';
            if (artifact.metadata) {
                if (artifact.metadata.url) {
                    metadataInfo += `\n- URL: ${artifact.metadata.url}`;
                }
                if (artifact.metadata.publishedDate) {
                    metadataInfo += `\n- Published: ${new Date(artifact.metadata.publishedDate).toLocaleDateString()}`;
                }
                if (artifact.metadata.contentDate) {
                    metadataInfo += `\n- Content Date: ${new Date(artifact.metadata.contentDate).toLocaleDateString()}`;
                }
            }

            return `Artifact Index:${index + 1} (${artifact.type}): ${artifact.metadata?.title || 'Untitled'}${metadataInfo}\n$\`\`\`${artifact.type}\n${content}\n\`\`\`\n`;
        }).join('\n\n');
    }

    private renderArtifactExcerpts({artifacts}: ArtifactsExcerptsContent): string {
        if (!artifacts || artifacts.length === 0) return '📁 Attached Artifacts: NONE ATTACHED';
        return "📁 Attached Artifacts:\n\n" + artifacts.map((artifact, index) => {
            const size = typeof artifact.content === 'string'
                ? `${artifact.content.length} characters`
                : `${artifact.content.length} bytes`;

            let content = typeof artifact.content === 'string'
                ? artifact.content
                : `[Binary data - ${size}]`;

            content = StringUtils.truncateWithEllipsis(content, 1000, `[truncated to 1000 characters out of total size: ${size}]`);

            let metadataInfo = '';
            if (artifact.metadata) {
                if (artifact.metadata.url) {
                    metadataInfo += `\n- URL: ${artifact.metadata.url}`;
                }
                if (artifact.metadata.publishedDate) {
                    metadataInfo += `\n- Published: ${new Date(artifact.metadata.publishedDate).toLocaleDateString()}`;
                }
                if (artifact.metadata.contentDate) {
                    metadataInfo += `\n- Content Date: ${new Date(artifact.metadata.contentDate).toLocaleDateString()}`;
                }
            }

            return `Artifact Index:${index + 1} (${artifact.type}): ${artifact.metadata?.title || 'Untitled'} [Size: ${size}]${metadataInfo}\n$\`\`\`${artifact.type}\n${content}\n\`\`\`\n`;
        }).join('\n\n');
    }

    private renderArtifactTitles({artifacts}: ArtifactsTitlesContent, offset: number = 0): string {
        if (!artifacts || artifacts.length === 0) return '';
        return "📁 Attached Artifacts:\n\n" + artifacts.map((artifact, index) => {
            let metadataInfo = '';
            if (artifact.metadata) {
                if (artifact.metadata.url) {
                    metadataInfo += `\n- URL: ${artifact.metadata.url}`;
                }
                if (artifact.metadata.publishedDate) {
                    metadataInfo += `\n- Published: ${new Date(artifact.metadata.publishedDate).toLocaleDateString()}`;
                }
                if (artifact.metadata.contentDate) {
                    metadataInfo += `\n- Content Date: ${new Date(artifact.metadata.contentDate).toLocaleDateString()}`;
                }
            }
            return `Artifact Index:${index + offset} (${artifact.type}): ${artifact.metadata?.title || 'Untitled'}${metadataInfo}`;
        }).join('\n\n');
    }

    private renderAgentCapabilities({agents} : AgentCapabilitiesContent): string {
        if (!agents || agents.length === 0) return '';

        return "🤖 AGENTS IN THIS CHANNEL:\n\n" + agents.filter(a => a && a.messagingHandle && a.description).map(agent => {
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

        return "🤖 AGENTS IN THIS CHANNEL:\n\n" + agents.filter(a => a && a.messagingHandle && a.description).map(agent => {
            let output = `- ${agent.messagingHandle}: ${agent.description}`;
            return output;
        }).join('\n');
    }

    private renderFullAgentList({agents} : AgentOverviewsContent): string {
        if (!agents || agents.length === 0) return '';

        return "🤖 AGENTS AVAIALBLE ACROSS PLATFORM:\n\n" + agents.filter(a => a && a.messagingHandle && a.description).map(agent => {
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
                    `${index + 1}. ${task.description} (${task.status})`
                ).join('\n');
        return output;
    }

    private renderTasks({tasks} : TasksContent): string {
        if (!tasks || tasks.length == 0) return '';

        // let output = `🎯 Project: ${project.name}\n`;
        // output += `📝 Description: ${project.metadata?.description || 'No description'}\n`;
        // output += `📊 Status: ${project.metadata?.status || 'active'}\n\n`;
        return `📋 Tasks:\n` +
            Object.values(tasks)
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((task, index) =>
                    `${index + 1}. ID:[${task.id}] ${task.description} (${task.status})`
                ).join('\n');;
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
    
    addOutputInstructions(outputType: OutputType, schemaDef?: JSONSchema, specialInstructions?: string, type: string = 'markdown') {
        if (outputType === OutputType.JSON_AND_MARKDOWN && schemaDef) {
            this.addInstruction(`Respond with a user-friendly message as well as two separate fully enclosed code blocks. One enclosed \`\`\`json block format that follows this schema:\n\`\`\`json\n${JSON.stringify(schemaDef, null, 2)}\`\`\`\n 
            Then, provide a separate fully enclosed \`\`\`${type} block. ${specialInstructions || ''}`);
        } else if (outputType === OutputType.JSON_WITH_MESSAGE && schemaDef) {
            this.addInstruction(`Respond with a user-friendly message as well as a fully enclosed \`\`\`json block format that follows this schema:\n\`\`\`json\n${JSON.stringify(schemaDef, null, 2)}\`\`\`\n\n${specialInstructions || ''}`);
        } else if (outputType === OutputType.JSON_WITH_MESSAGE_AND_REASONING && schemaDef) {
            this.addInstruction(`Before you answer the user, please think about how to best interpret the instructions and context you have been provided. Include your thinking inside of a single <thinking> XML block.
Then, respond with a user-friendly message and a \`\`\`json block format that follows this schema:\n\`\`\`json\n${JSON.stringify(schemaDef, null, 2)}\`\`\`\n\n${specialInstructions || ''}`);
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

    registerStepResultRenderer<T extends StepResponse>(responseType: StepResponseType, renderer: ContentRenderer<T>): void {
        this.registry.registerStepResponseRenderer(responseType, renderer);
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
