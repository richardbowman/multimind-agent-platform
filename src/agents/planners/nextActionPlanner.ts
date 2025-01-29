import { HandlerParams } from '../agents';
import { NextActionResponse } from '../../schemas/NextActionResponse';
import { PlanStepsResponse } from '../../schemas/PlanStepsResponse';
import { Planner } from './planner';
import { AddTaskParams, Task, TaskType } from '../../tools/taskManager';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { TaskManager } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ILLMService } from 'src/llm/ILLMService';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { EXECUTOR_METADATA_KEY } from '../decorators/executorDecorator';
import { ChatClient } from 'src/chat/chatClient';
import { ContentType } from 'src/llm/promptBuilder';
import { Agents } from 'src/utils/AgentLoader';
import { StepTask } from '../interfaces/ExecuteStepParams';

export class SimpleNextActionPlanner implements Planner {
    readonly allowReplan: boolean = false;
    readonly alwaysComplete: boolean = true;

    constructor(
        private llmService: ILLMService,
        private projects: TaskManager,
        private userId: string,
        private modelHelpers: ModelHelpers,
        private stepExecutors: Map<string, any> = new Map(),
        private chatClient: ChatClient,
        private agents: Agents
    ) { }

    public async planSteps(handlerParams: HandlerParams): Promise<PlanStepsResponse> {
        // Get channel data including any project goals
        const channelData = await this.chatClient.getChannelData(handlerParams.userPost.channel_id);

        const agentList = Object.values(this.agents.agents).filter(a => a.userId !== this.userId);

        // Get agent descriptions from settings for channel members
        const agentOptions = (channelData.members || [])
            .filter(memberId => this.userId !== memberId)
            .map(memberId => {
                return this.agents[memberId];
            });


        const executorMetadata = Array.from(this.stepExecutors.entries())
            .map(([key, executor]) => {
                const metadata = Reflect.getMetadata(EXECUTOR_METADATA_KEY, executor.constructor);
                return {
                    key,
                    description: metadata?.description || 'No description available',
                    planner: metadata?.planner !== false // Default to true if not specified
                };
            })
            .filter(metadata => metadata.planner); // Only include executors marked for planner

        const schema = await getGeneratedSchema(SchemaType.NextActionResponse);

        const project = handlerParams.projects[0];
        const tasks = this.projects.getAllTasks(project.id);

        const formatCompletedTasks = (tasks: Task[]) => {
            return tasks.map(t => {
                const type = t.type === TaskType.Step ? `**Step Type**: ${(t as StepTask).props.stepType}` : '**Task Type**: ${t.type}';
                return `- ${type}: ${t.description}`;
            }).join('\n');
        };

        const completedTasks = tasks.filter(t => t.complete);
        const currentTasks = tasks.filter(t => !t.complete);

        const completedSteps = completedTasks.length > 0 ?
            formatCompletedTasks(completedTasks) :
            `*No completed tasks yet*`;

        const stepDescriptions = executorMetadata
            .filter(metadata => metadata.planner)
            .map(({ key, description }) => `[${key}]: ${description}`)
            .join("\n");

        //TODO: opportunity here to better organize context of the chat chain to include info
        const userContext = handlerParams.userPost?.message
            ? `CONTEXT: ${handlerParams.userPost.message}`
            : '';

        // Get all available sequences
        const sequences = this.modelHelpers.getStepSequences();

        const sequencesPrompt = sequences.map(seq =>
            `### ${seq.getName()} Sequence (${seq.getDescription()}):
${seq.getAllSteps().map((step, i) => `${i + 1}. [${step.type}]: ${step.description}`).join('\n')}`
        ).join('\n\n');



        const systemPrompt =
            `## HIGH-LEVEL USER GOAL: ${project.name}
${userContext}

## AVAILABLE SEQUENCES:
${sequencesPrompt}

## AVAILABLE ACTION TYPES (and descriptions of when to use them):
${stepDescriptions}

## YOUR GOAL:
- Look at the completed tasks and determine the next Action Type from the Available Action Types action that would move us closer to the high-level goal
- Consider the sequences for guidance on the order for steps to be successful.

## COMPLETED TASKS:
${completedSteps}`;

        const prompt = this.modelHelpers.createPrompt();
        prompt.addContent(ContentType.PURPOSE);
        prompt.addContent(ContentType.AGENT_OVERVIEWS, agentList);
        prompt.addInstruction(systemPrompt);
        prompt.addContent(ContentType.FINAL_INSTRUCTIONS);

        const response = await this.modelHelpers.generate<NextActionResponse>({
            ...handlerParams,
            instructions: new StructuredOutputPrompt(schema, prompt)
        });

        Logger.verbose(`NextActionResponse: ${JSON.stringify(response, null, 2)}`);

        // Create new task for the next action
        if (response.action) {
            const newTask: AddTaskParams = {
                type: TaskType.Step,
                description: response.action.parameters || response.action.actionType,
                creator: this.userId,
                order: currentTasks.length, // Add to end of current tasks
                props: {
                    stepType: response.action.actionType
                }
            };
            this.projects.addTask(project, newTask);
        }

        // Convert NextActionResponse to PlanStepsResponse
        const planResponse: PlanStepsResponse = {
            reasoning: response.reasoning,
            steps: response.action ? [{
                actionType: response.action.actionType,
                parameters: response.action.parameters
            }] : []
        };

        return planResponse;
    }
}
