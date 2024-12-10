import { StepBasedAgent, AgentState, StepResult } from './stepBasedAgent';
import { ChatClient } from '../chat/chatClient';
import LMStudioService, { StructuredOutputPrompt } from '../llm/lmstudioService';
import { TaskManager } from '../tools/taskManager';
import { HandleActivity, HandlerParams, ResponseType } from './agents';
import { ONBOARDING_CHANNEL_ID } from '../helpers/config';
import { ArtifactManager } from '../tools/artifactManager';
import ChromaDBService from '../llm/chromaService';
import Logger from '../helpers/logger';
import { Project, Task } from '../tools/taskManager';
import crypto from 'crypto';
import { Artifact } from 'src/tools/artifact';
import { RequestArtifacts } from './schemas/ModelResponse';

export interface OnboardingProject extends Project<Task> {
    businessDescription?: string;
    businessGoals?: string[];
    serviceRequirements?: string;
}

class GoalBasedOnboardingConsultant extends StepBasedAgent<OnboardingProject, Task> {
    protected projectCompleted(project: OnboardingProject): void {
        throw new Error('Method not implemented.');
    }
    protected processTask(task: Task): Promise<void> {
        throw new Error('Method not implemented.');
    }

    constructor(
        userId: string,
        messagingHandle: string,
        chatClient: ChatClient,
        lmStudioService: LMStudioService,
        chromaDBService: ChromaDBService,
        projects: TaskManager
    ) {
        super(chatClient, lmStudioService, userId, projects);
        this.chromaDBService = chromaDBService;

        this.setPurpose(`I am an Onboarding Consultant focused on helping you achieve your business goals with our service.`);
        this.setupChatMonitor(ONBOARDING_CHANNEL_ID, messagingHandle);
        this.artifactManager = new ArtifactManager(chromaDBService);

        // Register step executors
        this.registerStepExecutor('analyze_goals', {
            execute: this.executeAnalyzeGoals.bind(this)
        });
        this.registerStepExecutor('create_plan', {
            execute: this.executeCreatePlan.bind(this)
        });
        this.registerStepExecutor('review_progress', {
            execute: this.executeReviewProgress.bind(this)
        });
    }

    public async initialize(): Promise<void> {
        const welcomeMessage = {
            message: `👋 Welcome! I'm your Goal-Based Onboarding Consultant.
            
I help you achieve your business objectives by:
- Understanding your specific goals
- Creating actionable plans
- Tracking progress
- Adapting strategies as needed

Let's start by discussing your main business goals. What would you like to achieve?`
        };

        await this.send(welcomeMessage, ONBOARDING_CHANNEL_ID);
    }

    protected async planSteps(goal: string): Promise<{
        steps: string[];
        requiresUserInput: boolean;
        userQuestion?: string;
    }> {
        const schema = {
            type: "object",
            properties: {
                steps: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of steps needed"
                },
                requiresUserInput: {
                    type: "boolean",
                    description: "Whether user input is needed"
                },
                userQuestion: {
                    type: "string",
                    description: "Question to ask the user if needed"
                }
            },
            required: ["steps", "requiresUserInput"]
        };

        const systemPrompt = `You are a business consultant planning how to help a client.
Break down the consultation process into specific steps.
If the goal needs clarification, set requiresUserInput to true and ask relevant questions.
Otherwise, plan concrete steps to help achieve the goal.`;

        const response = await this.generate({
            message: goal,
            instructions: new StructuredOutputPrompt(schema, systemPrompt)
        });

        return response;
    }

    @HandleActivity("start-goal-planning", "Begin the goal planning process", ResponseType.CHANNEL)
    private async handleStartGoalPlanning(params: HandlerParams): Promise<void> {
        const { projectId } = await this.addNewProject({
            projectName: params.userPost.message,
            tasks: [{
                description: "Understand the user's business and their desired business plan",
                type: "analyze_goals"
            }]
        });

        await this.executeStep(projectId, "analyze_goals", params.userPost);
    }

    private async updateBusinessPlan(project: OnboardingProject, existingPlan?: Artifact): Promise<string> {
        const schema = {
            type: "object",
            properties: {
                content: {
                    type: "string",
                    description: "The business plan content in markdown format"
                },
                title: {
                    type: "string",
                    description: "A title for the business plan"
                }
            },
            required: ["content", "title"]
        };

        // Get the existing business plan content if it exists
        let existingContent = existingPlan?.content.toString();

        const response = await this.generate({
            message: JSON.stringify({
                goals: Object.values(project.tasks).filter(t => t.type === 'business-goal'),
                existingPlan: existingContent,
                projectId: project.id,
                latestUpdate: project.props?.latestUpdate || ''
            }),
            instructions: new StructuredOutputPrompt(schema,
                `Update the business plan based on the goals, previous results, and latest updates.
                If there's an existing plan, use it as a base and incorporate new information.
                
                Include these sections in markdown format:
                
                # Executive Summary
                Brief overview of the business goals and current progress
                
                # Goals and Objectives
                List each business goal with:
                - Description
                - Current status (Not Started/In Progress/Complete)
                - Progress updates and achievements
                - Next steps or blockers
                
                # Implementation Strategy
                For each active goal:
                - Specific action items
                - Timeline and milestones
                - Resources needed
                
                # Progress Tracking
                - Overall completion status
                - Recent achievements
                - Areas needing attention
                
                # Recent Updates
                - Latest status changes
                - New developments
                - Important decisions made
                
                Use the goals array to list each specific business goal.
                Include detailed status updates for each goal.
                Reference specific progress points from task updates.
                Keep the tone professional but conversational.
                Format all content in clean, readable markdown.`)
        });

        // Create or update the business plan artifact
        const artifactId = existingPlan?.id || crypto.randomUUID();
        await this.artifactManager.saveArtifact({
            id: artifactId,
            type: 'business-plan',
            content: response.content,
            metadata: {
                title: response.title,
                lastUpdated: new Date().toISOString()
            }
        });

        return artifactId;
    }

    private findNextIncompleteTask(project: OnboardingProject): Task | undefined {
        return Object.values(project.tasks).find(t => !t.complete && !t.inProgress);
    }

    private async executeAnalyzeGoals(goal: string, step: string, projectId: string): Promise<StepResult> {
        // Get the existing project
        const project = this.projects.getProject(projectId) as OnboardingProject;
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        let existingPlan: Artifact | undefined;
        
        if (project.props?.businessPlanId) {
            existingPlan = await this.artifactManager.loadArtifact(project.props.businessPlanId);
        }

        const schema = {
            type: "object",
            properties: {
                goals: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            description: { type: "string" }
                        },
                        required: ["description"]
                    }
                }
            },
            required: ["goals"]
        };

        const userInput = goal;

        const response = await this.generate({
            message: userInput,
            instructions: new StructuredOutputPrompt(schema, 
                `You are speaking directly to the user. Analyze their business goal and break it down into distinct, manageable objectives. Use a friendly, direct tone as if having a conversation.`)
        });


        // Create tasks for each goal
        for (const goalData of response.goals) {
            const task: Task = {
                id: crypto.randomUUID(),
                description: goalData.description,
                creator: this.userId,
                complete: false,
                type: 'business-goal'
            };
            
            await this.projects.addTask(project, task);
        }

        // Create/update the business plan
        const businessPlanId = await this.updateBusinessPlan(project as OnboardingProject, existingPlan);
        
        // Store the business plan ID in project props
        project.props = {
            ...project.props,
            businessPlanId
        };

        return {
            type: 'goals_analysis',
            goals: project.goals,
            projectId: project.id,
            artifactId: businessPlanId
        };
    }

    private async executeCreatePlan(goal: string, step: string, state: OnboardingState): Promise<StepResult> {
        const schema = {
            type: "object",
            properties: {
                plans: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            goalId: { type: "string" },
                            steps: { 
                                type: "array",
                                items: { type: "string" }
                            }
                        },
                        required: ["goalId", "steps"]
                    }
                }
            },
            required: ["plans"]
        };

        const response = await this.generate({
            message: JSON.stringify(state.goals),
            instructions: new StructuredOutputPrompt(schema,
                `Create specific action plans for each identified business goal.
                Break down each goal into concrete, actionable steps.`)
        });

        return {
            type: 'action_plans',
            plans: response.plans
        };
    }

    private async executeReviewProgress(goal: string, step: string, state: OnboardingState): Promise<StepResult> {
        const schema = {
            type: "object",
            properties: {
                progress: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            goalId: { type: "string" },
                            status: { type: "string" },
                            nextSteps: { type: "array", items: { type: "string" } }
                        },
                        required: ["goalId", "status", "nextSteps"]
                    }
                }
            },
            required: ["progress"]
        };

        const response = await this.generate({
            message: JSON.stringify({
                goals: state.goals,
                results: state.intermediateResults
            }),
            instructions: new StructuredOutputPrompt(schema,
                `Review the progress on each goal and recommend next steps.
                Identify any goals that need adjustment or additional support.`)
        });

        return {
            type: 'progress_review',
            progress: response.progress
        };
    }

    @HandleActivity("response", "Handle responses on the thread", ResponseType.RESPONSE)
    private async handleGoalUpdate(params: HandlerParams): Promise<void> {
        const project = params.projects?.[0] as OnboardingProject;
        if (!project) {
            await this.reply(params.userPost, { 
                message: "No active goal planning session found. Please start a new session." 
            });
            return;
        }

        // Find next incomplete task before updating current one
        const nextTask = this.findNextIncompleteTask(project);

        // Initialize project props if needed
        if (!project.props) {
            project.props = {};
        }

        const schema = {
            type: "object",
            properties: {
                goalId: { type: "string" },
                completed: { type: "boolean" },
                notes: { type: "string" }
            },
            required: ["goalId", "completed"]
        };

        const response = await this.generate({
            message: JSON.stringify({
                currentGoals: project.tasks,
                userUpdate: params.userPost.message
            }),
            instructions: new StructuredOutputPrompt(schema,
                `Given the list of current goals and the user's update, identify which goal is being discussed and whether it's completed.
                Current goals state is provided in currentGoals.
                The user's update message is in userUpdate.`)
        });

        // Update task status
        const task = Object.values(project.tasks).find(t => t.id === response.goalId);
        if (task) {
            if (response.completed) {
                await this.projects.completeTask(task.id);
            } else {
                await this.projects.markTaskInProgress(task);
            }

            // Check if this update contains meaningful new information
            const schema = {
                type: "object",
                properties: {
                    hasNewInformation: { type: "boolean" },
                    summary: { type: "string" }
                },
                required: ["hasNewInformation", "summary"]
            };

            const updateAnalysis = await this.generate({
                message: JSON.stringify({
                    currentUpdate: params.userPost.message,
                    goalDescription: task.description,
                    goalStatus: task.complete ? "completed" : (task.inProgress ? "in progress" : "not started")
                }),
                instructions: new StructuredOutputPrompt(schema,
                    `Analyze this update and determine if it contains meaningful new information about the goal's progress or status.
                    Consider:
                    - Does it describe specific progress or achievements?
                    - Does it provide new details about implementation?
                    - Does it mention blockers or changes in direction?
                    - Is it substantially different from just acknowledging the goal?
                    
                    Return hasNewInformation: true only if the update contains concrete new information.
                    Provide a brief summary of what's new, or why the update isn't substantial.`)
            });

            // Only update the business plan if there's new information
            if (updateAnalysis.hasNewInformation && project.props?.businessPlanId) {
                const existingPlan = await this.artifactManager.loadArtifact(project.props.businessPlanId);
                project.props.latestUpdate = `${updateAnalysis.summary}\n\nUser's message: ${params.userPost.message}`; // Store analyzed update
                await this.updateBusinessPlan(project as OnboardingProject, existingPlan);
            }

            const responseSchema = {
                type: "object",
                properties: {
                    message: {
                        type: "string",
                        description: "A natural, conversational response about the goal status update"
                    }
                },
                required: ["message"]
            };

            const replyResponse = await this.generate({
                message: JSON.stringify({
                    goal: task.description,
                    completed: task.complete,
                    projectId: project.id,
                    nextTask: nextTask?.description
                }),
                instructions: new StructuredOutputPrompt(responseSchema,
                    `You are speaking directly to the user. Generate a natural, conversational response about their goal's status.
                    - Use "I" and "you" pronouns to make it personal
                    - If the goal is completed:
                        - Congratulate them directly
                        - If there's a next task, suggest working on that specific task next
                        - If no next task, ask what new goal they'd like to work on
                    - If the goal is in progress:
                        - Acknowledge their update and offer direct help
                        - Be specific about what aspects need more work
                    - Keep the tone friendly and supportive
                    - Write as if having a real conversation, not giving a status report
                    - Avoid phrases like "it looks like" or "the user" - speak directly to them`)
            });

            await this.reply(params.userPost, {
                ...replyResponse, 
                artifactIds: project.props?.businessPlanId ? [project.props.businessPlanId] : undefined
            } as RequestArtifacts);
        }
    }
}

export default GoalBasedOnboardingConsultant;
