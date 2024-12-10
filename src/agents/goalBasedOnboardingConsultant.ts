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

export interface OnboardingGoal {
    id: string;
    description: string;
    completed: boolean;
    subgoals?: OnboardingGoal[];
}

export interface OnboardingState extends AgentState {
    goals: OnboardingGoal[];
    currentGoalId?: string;
    businessPlanId?: string;
}

export interface OnboardingProject extends Project<Task> {
    goals: OnboardingGoal[];
}

class GoalBasedOnboardingConsultant extends StepBasedAgent<OnboardingProject, Task> {
    protected projectCompleted(project: OnboardingProject): void {
        throw new Error('Method not implemented.');
    }
    protected processTask(task: Task): Promise<void> {
        throw new Error('Method not implemented.');
    }
    
    private businessPlanId?: string;

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
        const stateId = params.userPost.id;
        const newState: OnboardingState = {
            originalGoal: "Understand the user's business and their desired business plan so we can develop an automation plan using our agents.",
            currentStep: "analyze_goals",
            intermediateResults: [],
            goals: []
        };

        this.activeStates.set(stateId, newState);
        await this.executeStep(newState, params.userPost);
    }

    private async updateBusinessPlan(state: OnboardingState, goals: OnboardingGoal[]): Promise<string> {
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

        const response = await this.generate({
            message: JSON.stringify({
                goals: goals,
                previousResults: state.intermediateResults
            }),
            instructions: new StructuredOutputPrompt(schema,
                `Create or update a business plan based on the goals and any previous results.
                Include sections for:
                - Executive Summary
                - Goals and Objectives
                - Implementation Strategy
                - Progress Tracking
                
                Format the content in markdown.`)
        });

        // Create or update the business plan artifact
        const artifactId = state.businessPlanId || crypto.randomUUID();
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

    private async executeAnalyzeGoals(goal: string, step: string, state: OnboardingState): Promise<StepResult> {
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

        const userInput = state.intermediateResults.length > 0 
            ? state.intermediateResults.map(r => r.type === 'user_input' ? r.answer : '').join('\n')
            : goal;

        const response = await this.generate({
            message: userInput,
            instructions: new StructuredOutputPrompt(schema, 
                `Analyze this business goal and break it down into distinct, manageable objectives.`)
        });

        // Create a new project for these goals
        const project: OnboardingProject = {
            id: this.projects.newProjectId(),
            name: "Onboarding Goals",
            tasks: {},
            goals: []
        };

        await this.projects.addProject(project);

        // Convert goals to tasks
        for (const goalData of response.goals) {
            const task: Task = {
                id: crypto.randomUUID(),
                description: goalData.description,
                creator: this.userId,
                complete: false
            };
            
            await this.projects.addTask(project, task);
            project.goals.push({
                id: task.id,
                description: task.description,
                completed: false
            });
        }

        state.goals = project.goals;
        
        // Create/update the business plan
        const businessPlanId = await this.updateBusinessPlan(state, project.goals);
        state.businessPlanId = businessPlanId;
        this.businessPlanId = businessPlanId;

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
        const state = this.activeStates.get(params.rootPost.id) as OnboardingState;
        if (!state) {
            await this.reply(params.userPost, { 
                message: "No active goal planning session found. Please start a new session." 
            });
            return;
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
                currentGoals: state.goals,
                userUpdate: params.userPost.message
            }),
            instructions: new StructuredOutputPrompt(schema,
                `Given the list of current goals and the user's update, identify which goal is being discussed and whether it's completed.
                Current goals state is provided in currentGoals.
                The user's update message is in userUpdate.`)
        });

        // Update goal status in both state and task manager
        const goal = state.goals.find(g => g.id === response.goalId);
        if (goal) {
            goal.completed = response.completed;
            
            // Get all projects and find the one containing our goals
            const projects = this.projects.getProjects();
            const project = projects.find(p => 'goals' in p && (p as OnboardingProject).goals.some(g => g.id === goal.id));
            
            if (project) {
                const task = project.tasks[goal.id];
                if (task) {
                    if (response.completed) {
                        await this.projects.completeTask(task.id);
                    } else {
                        await this.projects.markTaskInProgress(task);
                    }
                }
            }

            // Update the business plan with progress
            const businessPlanId = this.businessPlanId || state?.businessPlanId;
            if (businessPlanId) {
                await this.updateBusinessPlan(state, state.goals);
            }

            await this.reply(params.userPost, {
                message: `Updated status for goal: ${goal.description}\nStatus: ${goal.completed ? 'Completed' : 'In Progress'}\n${response.notes || ''}`,
                artifactId: businessPlanId
            });
        }
    }
}

export default GoalBasedOnboardingConsultant;
