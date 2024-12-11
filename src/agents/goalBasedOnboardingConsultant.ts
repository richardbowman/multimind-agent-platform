import { StepBasedAgent, AgentState, StepResult, PlanStepsResponse } from './stepBasedAgent';
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
import { definitions as schemas } from "./schemas/schema.json";


export interface OnboardingProject extends Project<Task> {
    businessDescription?: string;
    businessGoals?: string[];
    serviceRequirements?: string;
    existingPlan?: Artifact;
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
        this.registerStepExecutor('understand_goals', {
            execute: this.executeUnderstandGoals.bind(this)
        });
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

    @HandleActivity("start-thread", "Start conversation with user", ResponseType.CHANNEL)
    private async handleConversation(params: HandlerParams): Promise<void> {

        const plan = await this.planSteps(params.message);

        this.addNewProject({
            name: "Onboarding",
            tasks: plan.steps.map(s => ({
                type: s.type,
                description: s.description
            }))
        });
        
        await this.executeNextStep(projectId, params.userPost);
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

        // Find the current in-progress task
        const currentTask = Object.values(project.tasks).find(t => t.inProgress);
        if (!currentTask) {
            await this.reply(params.userPost, { 
                message: "I wasn't expecting a response right now. What would you like to work on?" 
            });
            return;
        }

        // Handle the user's input using the base class method
        await this.handleUserInput(project.id, currentTask.type, params.userPost);
    }

    protected async planSteps(projectId: string, latestGoal: string): Promise<PlanStepsResponse> {
        const registeredSteps = Array.from(this.stepExecutors.keys());
        
        const schema = schemas.PlanStepsResponse;

        const tasks = this.projects.getAllTasks(projectId);

        const mapper = (t: Task, index: number) => ({
            type: t.type,
            description: t.description,
            index: index,
        });
        const completedSteps = `Completed Tasks:\n${JSON.stringify(tasks.filter(t => t.complete).map(mapper), undefined, " ")}\n\n`;
        const currentSteps = `Current Plan:\n${JSON.stringify(tasks.filter(t => !t.complete).map(mapper), undefined, " ")}\n\n`;

        const systemPrompt = 
`You help on-board users into our AI Agent tool. This service is designed
to help small businesses perform tasks automatically with regards to research and content creation.
Break down the consultation process into specific steps.
If you need clarification or more information, add "ask-question" steps at the beginning of the plan.
Otherwise, plan concrete steps to help achieve on-board the user and make sure the other agents
will have sufficient context to help the business.

${completedSteps}

${currentSteps}`

        const response: PlanStepsResponse = await this.generate({
            message: latestGoal,
            instructions: new StructuredOutputPrompt(schema, systemPrompt)
        });

        // Create a map of existing tasks by type and description for quick lookup
        const existingTaskMap = new Map(
            tasks.map(task => [`${task.type}-${task.description}`, task])
        );

        // Update task order and status based on response
        response.steps.forEach((step, index) => {
            const taskKey = `${step.type}-${step.description}`;
            const existingTask = existingTaskMap.get(taskKey);

            if (existingTask) {
                // Update existing task
                existingTask.order = index;
                existingTaskMap.delete(taskKey); // Remove from map to track which tasks weren't in response
            } else {
                // Create new task
                const newTask: Task = {
                    id: crypto.randomUUID(),
                    type: step.type,
                    description: step.description,
                    creator: this.userId,
                    complete: false,
                    order: index
                };
                this.projects.addTask(projectId, newTask);
            }
        });

        // Mark any tasks not in the response as completed
        for (const [_, task] of existingTaskMap) {
            task.complete = true;
            this.projects.updateTask(projectId, task);
        }

        return response;
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

    private async executeUnderstandGoals(goal: string, step: string, projectId: string): Promise<StepResult> {
        const project = await this.getProjectWithPlan(projectId);
        const analyzedGoals = await this.breakdownBusinessGoals(goal);
        const tasks = await this.createGoalTasks(project, analyzedGoals);
        const businessPlanId = await this.updateProjectBusinessPlan(project);

        return {
            type: "analyze_goals",
            goals: project.goals,
            projectId: project.id,
            artifactId: businessPlanId
        };
    }

    private async executeAnalyzeGoals(goal: string, step: string, projectId: string): Promise<StepResult> {
        const project = await this.getProjectWithPlan(projectId);
        const analyzedGoals = await this.breakdownBusinessGoals(goal);
        const tasks = await this.createGoalTasks(project, analyzedGoals);
        const businessPlanId = await this.updateProjectBusinessPlan(project);

        return {
            type: 'goals_analysis',
            goals: project.goals,
            projectId: project.id,
            artifactId: businessPlanId
        };
    }

    private async getProjectWithPlan(projectId: string): Promise<OnboardingProject> {
        const project = this.projects.getProject(projectId) as OnboardingProject;
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        if (project.props?.businessPlanId) {
            project.existingPlan = await this.artifactManager.loadArtifact(project.props.businessPlanId);
        }

        return project;
    }

    private async breakdownBusinessGoals(userInput: string): Promise<Array<{ description: string }>> {
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

        const response = await this.generate({
            message: userInput,
            instructions: new StructuredOutputPrompt(schema, 
                `Restructure the information the user provided on business goals`)
        });

        return response.goals;
    }

    private async createGoalTasks(project: OnboardingProject, goals: Array<{ description: string }>): Promise<Task[]> {
        const tasks: Task[] = [];
        
        for (const goalData of goals) {
            const task: Task = {
                id: crypto.randomUUID(),
                description: goalData.description,
                creator: this.userId,
                complete: false,
                type: 'business-goal'
            };
            
            await this.projects.addTask(project, task);
            tasks.push(task);
        }

        return tasks;
    }

    private async updateProjectBusinessPlan(project: OnboardingProject): Promise<string> {
        const businessPlanId = await this.updateBusinessPlan(project, project.existingPlan);
        
        project.props = {
            ...project.props,
            businessPlanId
        };

        return businessPlanId;
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
}

export default GoalBasedOnboardingConsultant;
