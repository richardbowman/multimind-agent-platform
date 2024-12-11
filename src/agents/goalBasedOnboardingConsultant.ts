import { StepBasedAgent, StepResult } from './stepBasedAgent';
import { PlanStepsResponse } from './schemas/agent';
import { ChatClient } from '../chat/chatClient';
import 'reflect-metadata';
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
import { PlanStepTask } from './schemas/agent';


// Decorator for step executors
export function StepExecutor(key: string, description: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        Reflect.defineMetadata('stepDescription', description, target, propertyKey);
        Reflect.defineMetadata('stepKey', key, target, propertyKey);
    };
}

interface QuestionAnswer {
    questionId: string;
    question: string;
    answer: string;
    analysis: string;
    answeredAt: string;
}

export interface OnboardingProject extends Project<Task> {
    businessDescription?: string;
    businessGoals?: string[];
    serviceRequirements?: string;
    existingPlan?: Artifact;
    answers?: QuestionAnswer[];
}

class GoalBasedOnboardingConsultant extends StepBasedAgent<OnboardingProject, Task> {
    protected projectCompleted(project: OnboardingProject): void {
        // this.chatClient.postInChannel()
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

        this.setPurpose(`I am an Onboarding Agent focused on helping users achieve their business goals with our AI Agent tools. This service is designed
to help businesses automate tasks automatically including research and content creation. My goal is to ensure that the rest of the agents in the platform
are trained and educated on what the user is trying to achieve using our system. This means I build an understanding of their business goals, market, strategy,
and brand standards. When all of that is complete, I build and maintain a comprehensive on-boarding guide, and then introduce the user to the other agents.`);
        this.setupChatMonitor(ONBOARDING_CHANNEL_ID, messagingHandle);
        this.artifactManager = new ArtifactManager(chromaDBService);

        // Automatically register step executors using reflection
        this.registerStepExecutorsFromMetadata();
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

        const { projectId } = await this.addNewProject({
            projectName: "Onboarding",
            tasks: [{
                type: "reply",
                description: "Welcome the user to the onboarding plan, and explain the steps."
            }]
        });

        const plan = await this.planSteps(projectId, params.userPost.message);
        
        await this.executeNextStep(projectId, params.userPost);
    }

    @HandleActivity("response", "Handle responses on the thread", ResponseType.RESPONSE)
    private async handleThreadResponse(params: HandlerParams): Promise<void> {
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

        const plan = await this.planSteps(project.id, params.userPost.message);
        
        await this.executeNextStep(project.id, params.userPost);
    }

    protected async planSteps(projectId: string, latestGoal: string): Promise<PlanStepsResponse> {
        const registeredSteps = Array.from(this.stepExecutors.keys());
        
        const schema = schemas.PlanStepsResponse;

        const project = this.projects.getProject(projectId);
        const tasks = this.projects.getAllTasks(projectId);

        const mapper = (t: Task) => ({
            existingId: t.id,
            type: t.type,
            description: t.description
        } as PlanStepTask);

        const completedSteps = `Completed Tasks:\n${JSON.stringify(tasks.filter(t => t.complete).map(mapper), undefined, " ")}\n\n`;
        const currentSteps = `Current Plan:\n${JSON.stringify(tasks.filter(t => !t.complete).map(mapper), undefined, " ")}\n\n`;

        const stepDescriptions = registeredSteps.map(key => {
            const executor = this.stepExecutors.get(key);
            return `${key}\n    Description: ${executor?.description || 'No description available'}`;
        }).join("\n\n");

        const systemPrompt = 
`OVERALL BACKSTORY AND GOAL: ${this.purpose}

TASK GOAL: Manage a list of execution steps to complete a successful on-boarding process.

The allowable step types you can execute later are:
${stepDescriptions}

If you've completed any steps already they will be listed here:
${completedSteps}

This is your current active step list. If you remove an item from this list, we'll assume it isn't needed any longer. You can add new items by specifying a type and a description. You should include any relevant existing steps as well with their existingStepId.
${currentSteps}`

        const response: PlanStepsResponse = await this.generate({
            message: latestGoal,
            instructions: new StructuredOutputPrompt(schema, systemPrompt)
        });

        // Create a map of existing tasks by ID
        const existingTaskMap = new Map(
            tasks.map(task => [task.id, task])
        );

        // Track which tasks are mentioned in the response
        const mentionedTaskIds = new Set<string>();

        // Update task order and status based on response
        response.steps.forEach((step, index) => {
            if (step.existingId && existingTaskMap.has(step.existingId)) {
                // Update existing task
                const existingTask = existingTaskMap.get(step.existingId)!;
                existingTask.order = index;
                mentionedTaskIds.add(step.existingId);
            } else {
                // Create new task
                const newTask: Task = {
                    id: crypto.randomUUID(),
                    type: step.type,
                    description: step.description||step.type,
                    creator: this.userId,
                    complete: false,
                    order: index
                };
                this.projects.addTask(project, newTask);
            }
        });

        // Mark any tasks not mentioned in the response as completed
        for (const [taskId, task] of existingTaskMap) {
            if (!mentionedTaskIds.has(taskId)) {
                this.projects.completeTask(taskId);
            }
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

    private registerStepExecutorsFromMetadata() {
        const prototype = Object.getPrototypeOf(this);
        const propertyNames = Object.getOwnPropertyNames(prototype);
        
        for (const prop of propertyNames) {
            if (prop.startsWith('execute')) {
                const description = Reflect.getMetadata('stepDescription', prototype, prop);
                const key = Reflect.getMetadata('stepKey', prototype, prop);
                if (description && key) {
                    this.registerStepExecutor(key, {
                        execute: (this as any)[prop].bind(this),
                        description
                    });
                }
            }
        }
    }

    @StepExecutor("reply", "Respond to user messages and questions with appropriate context")
    private async executeReply(goal: string, step: string, projectId: string): Promise<StepResult> {
        const project = await this.getProjectWithPlan(projectId);
        const reply = await this.generate({
            instructions: "Generate a user friendly reply",
            message: `${step} [${goal}]`,
            projects: [project]
        });

        return {
            finished: true,
            needsUserInput: true,
            response: reply
        };
    }

    @StepExecutor("answer-questions", "Analyze user responses and mark answered questions as complete")
    private async executeAnswerQuestions(response: string, step: string, projectId: string): Promise<StepResult> {
        const schema = {
            type: "object",
            properties: {
                answers: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            questionId: { type: "string" },
                            answered: { type: "boolean" },
                            analysis: { type: "string" },
                            extractedAnswer: { type: "string" }
                        },
                        required: ["questionId", "answered", "analysis", "extractedAnswer"]
                    }
                },
                summary: { type: "string" }
            },
            required: ["answers", "summary"]
        };

        const project = this.projects.getProject(projectId) as OnboardingProject;
        const intakeQuestions = Object.values(project.tasks).filter(t => t.type === 'intake-question' && !t.complete);

        if (intakeQuestions.length === 0) {
            return {
                type: 'answer_analysis',
                finished: true,
                response: {
                    message: "No pending questions to analyze."
                }
            };
        }

        const modelResponse = await this.generate({
            message: response,
            instructions: new StructuredOutputPrompt(schema,
                `Analyze the user's response against these pending questions:
                ${intakeQuestions.map(q => `ID ${q.id}: ${q.description}`).join('\n')}
                
                For each question:
                1. Determine if it was answered
                2. Extract the specific answer from the response
                3. Provide a brief analysis of the answer or why it wasn't answered
                4. Be specific about what information was provided or what's still missing`)
        });

        // Initialize answers array if it doesn't exist
        if (!project.answers) {
            project.answers = [];
        }

        // Update tasks and store answers based on analysis
        for (const answer of modelResponse.answers) {
            const task = this.projects.getTask(answer.questionId);
            if (task && answer.answered) {
                // Store the answer in project
                project.answers.push({
                    questionId: answer.questionId,
                    question: task.description,
                    answer: answer.extractedAnswer,
                    analysis: answer.analysis,
                    answeredAt: new Date().toISOString()
                });

                // Update task metadata
                task.metadata = {
                    ...task.metadata,
                    analysis: answer.analysis,
                    answer: answer.extractedAnswer,
                    answeredAt: new Date().toISOString()
                };
                await this.projects.completeTask(answer.questionId);
            }
        }

        const remainingQuestions = intakeQuestions.filter(q => 
            !modelResponse.answers.find(a => a.questionId === q.id && a.answered)
        );

        return {
            type: 'answer_analysis',
            finished: remainingQuestions.length === 0,
            needsUserInput: remainingQuestions.length > 0,
            response: {
                message: `${modelResponse.summary}\n\n${
                    remainingQuestions.length > 0 
                        ? `I still need answers to these questions:\n${remainingQuestions.map(q => q.description).join('\n')}`
                        : "All questions have been answered. I'll analyze the information to create a plan."
                }`
            }
        };
    }

    private getAnswersForType(project: OnboardingProject, questionType: string): QuestionAnswer[] {
        if (!project.answers) return [];
        
        return project.answers.filter(answer => {
            const task = this.projects.getTask(answer.questionId);
            return task?.type === questionType;
        });
    }

    @StepExecutor("understand-goals", "Analyze and break down the user's business goals into actionable items")
    private async executeUnderstandGoals(goal: string, step: string, projectId: string): Promise<StepResult> {
        const schema = {
            type: "object",
            properties: {
                intakeQuestions: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            question: { type: "string" },
                            purpose: { type: "string" }
                        },
                        required: ["question", "purpose"]
                    }
                },
                reasoning: { type: "string" }
            },
            required: ["intakeQuestions", "reasoning"]
        };

        const response = await this.generate({
            message: goal,
            instructions: new StructuredOutputPrompt(schema,
                `Based on the user's initial business goals, generate focused questions to understand both their business needs and how our AI service fits in.
                Each question should help gather specific information about:

                Business Understanding:
                - Their business model and target market
                - Their specific growth objectives and challenges
                - Their competitive advantages
                - Their desired business outcomes
                - Their timeline and budget expectations

                AI Service Integration:
                - Which business processes they want to automate
                - What type of content or tasks they need help with
                - Their team's current workflow and pain points
                - Their experience level with AI tools
                - Their success metrics for AI automation
                
                Include 4-6 essential questions that will help us understand both their business goals and how we can best support them.
                Keep questions focused and actionable.`)
        });

        // Create tasks for each intake question
        for (const q of response.intakeQuestions) {
            await this.addTaskToProject({
                projectId,
                type: 'answer-questions',
                description: `Q: ${q.question}\nPurpose: ${q.purpose}`,
                skipForSameType: false
            });
        }

        return {
            type: 'intake_questions',
            finished: true,
            needsUserInput: true,
            response: {
                message: `To help me better understand your goals, I have a few questions:\n\n${
                    response.intakeQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n\n')
                }\n\nPlease respond to these questions so I can create a more tailored plan.`
            }
        };
    }

    @StepExecutor("analyze-goals", "Perform detailed analysis of business goals and create specific action items")
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

    @StepExecutor("create-plan", "Create a detailed business plan based on analyzed goals and requirements")
    private async executeCreatePlan(goal: string, step: string, projectId: string): Promise<StepResult> {
        const project = await this.getProjectWithPlan(projectId);
        const businessGoals = Object.values(project.tasks).filter(t => t.type === 'business-goal');

        const schema = {
            type: "object",
            properties: {
                plans: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            goalId: { type: "string" },
                            actionItems: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        description: { type: "string" },
                                        timeline: { type: "string" },
                                        resources: { type: "string" },
                                        dependencies: { 
                                            type: "array",
                                            items: { type: "string" }
                                        }
                                    },
                                    required: ["description", "timeline", "resources"]
                                }
                            }
                        },
                        required: ["goalId", "actionItems"]
                    }
                },
                summary: { type: "string" }
            },
            required: ["plans", "summary"]
        };

        const businessAnswers = this.getAnswersForType(project, 'business-question');
        const serviceAnswers = this.getAnswersForType(project, 'service-question');

        const response = await this.generate({
            message: JSON.stringify({
                goals: businessGoals,
                currentPlan: project.existingPlan?.content.toString(),
                projectContext: project.props,
                businessAnswers,
                serviceAnswers
            }),
            instructions: new StructuredOutputPrompt(schema,
                `Create detailed action plans for each business goal.
                Use the provided answers about the business and service requirements to inform the plan.
                
                Business Context:
                ${businessAnswers.map(a => `- ${a.question}: ${a.answer}`).join('\n')}
                
                Service Requirements:
                ${serviceAnswers.map(a => `- ${a.question}: ${a.answer}`).join('\n')}
                
                For each goal:
                - Break down into specific, actionable tasks
                - Estimate timeline for each action item
                - Identify required resources
                - Note dependencies between tasks
                
                Consider:
                - Business constraints and requirements
                - Available resources and capabilities
                - Dependencies between different goals
                - Realistic timelines for implementation
                
                Provide a summary that outlines:
                - Overall implementation strategy
                - Critical path items
                - Resource requirements
                - Risk factors to consider`)
        });

        // Create tasks for each action item
        for (const plan of response.plans) {
            const parentGoal = this.projects.getTask(plan.goalId);
            if (!parentGoal) continue;

            for (const action of plan.actionItems) {
                await this.addTaskToProject({
                    projectId,
                    type: 'action-item',
                    description: action.description,
                    metadata: {
                        timeline: action.timeline,
                        resources: action.resources,
                        dependencies: action.dependencies
                    },
                    dependsOn: plan.goalId
                });
            }
        }

        // Update the business plan with the new action items
        const businessPlanId = await this.updateProjectBusinessPlan(project);

        return {
            type: 'action_plans',
            finished: true,
            needsUserInput: false,
            response: {
                message: response.summary,
                plans: response.plans,
                businessPlanId
            }
        };
    }

    @StepExecutor("review-progress", "Review progress on goals and provide status updates with next steps")
    private async executeReviewProgress(goal: string, step: string, projectId: string): Promise<StepResult> {
        const project = await this.getProjectWithPlan(projectId);
        const tasks = this.projects.getAllTasks(projectId);

        const schema = {
            type: "object",
            properties: {
                progress: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            taskId: { type: "string" },
                            status: { 
                                type: "string",
                                enum: ["Not Started", "In Progress", "Blocked", "Complete"]
                            },
                            analysis: { type: "string" },
                            nextSteps: { 
                                type: "array", 
                                items: { type: "string" } 
                            },
                            blockers: { 
                                type: "array", 
                                items: { type: "string" },
                                description: "Any issues preventing progress"
                            }
                        },
                        required: ["taskId", "status", "analysis", "nextSteps"]
                    }
                },
                summary: { type: "string" }
            },
            required: ["progress", "summary"]
        };

        const response = await this.generate({
            message: JSON.stringify({
                currentGoal: goal,
                tasks: tasks.map(t => ({
                    id: t.id,
                    type: t.type,
                    description: t.description,
                    complete: t.complete,
                    metadata: t.metadata
                }))
            }),
            instructions: new StructuredOutputPrompt(schema,
                `Review the progress of all tasks and provide a detailed status update.
                For each task:
                - Assess current status
                - Analyze progress made
                - Identify any blockers
                - Recommend specific next steps
                
                Provide a summary that highlights:
                - Overall progress
                - Key achievements
                - Critical issues needing attention
                - Recommendations for keeping progress on track`)
        });

        // Update task metadata with latest progress info
        for (const update of response.progress) {
            const task = this.projects.getTask(update.taskId);
            if (task) {
                task.metadata = {
                    ...task.metadata,
                    lastReview: {
                        status: update.status,
                        analysis: update.analysis,
                        nextSteps: update.nextSteps,
                        blockers: update.blockers,
                        reviewedAt: new Date().toISOString()
                    }
                };
            }
        }

        // Update the business plan with latest progress
        await this.updateProjectBusinessPlan(project);

        return {
            type: 'progress_review',
            finished: true,
            needsUserInput: false,
            response: {
                message: response.summary,
                progress: response.progress
            }
        };
    }
}

export default GoalBasedOnboardingConsultant;
