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
import { StepExecutor } from './decorators/executorDecorator';
import { RefutingExecutor } from './executors/RefutingExecutor';
import { ThinkingExecutor } from './executors/ThinkingExecutor';
import { ValidationExecutor } from './executors/ValidationExecutor';



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
        chatClient: ChatClient,
        lmStudioService: LMStudioService,
        userId: string,
        projects: TaskManager,
        chromaDBService: ChromaDBService
    ) {
        super(chatClient, lmStudioService, userId, projects, chromaDBService);
        
        // Register our specialized executors
        this.registerStepExecutor(new ThinkingExecutor(lmStudioService));
        this.registerStepExecutor(new RefutingExecutor(lmStudioService));
        this.registerStepExecutor(new ValidationExecutor(lmStudioService));

        this.setPurpose(`I am an Onboarding Agent focused on helping users achieve their business goals with our AI Agent tools. This service is designed
to help businesses automate tasks automatically including research and content creation. My goal is to ensure that the rest of the agents in the platform
are trained and educated on what the user is trying to achieve using our system. This means I build an understanding of their business goals, market, strategy,
and brand standards. When all of that is complete, I build and maintain a comprehensive on-boarding guide, and then introduce the user to the other agents.`);
    }

    public async initialize(): Promise<void> {
        Logger.info(`Initialized Onboarding Consultant`);
        await super.setupChatMonitor(ONBOARDING_CHANNEL_ID, "@onboarding");

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
        
        // asynchronously check for old tasks and keep working on them
        this.processTaskQueue();
    }

    @HandleActivity("start-thread", "Start conversation with user", ResponseType.CHANNEL)
    protected async handleConversation(params: HandlerParams): Promise<void> {
        // Get conversation history
        const conversationContext = [...params.rootPost?[params.rootPost]:[], ...params.threadPosts||[], params.userPost]
            .map(post => `[${post.user_id === this.userId ? 'Assistant' : 'User'}] ${post.message}`)
            .join('\n\n');

        const { projectId } = await this.addNewProject({
            projectName: params.userPost.message,
            tasks: [{
                type: "reply",
                description: "Initial response to user query."
            }],
            metadata: {
                originalPostId: params.userPost.id
            }
        });

        const plan = await this.planSteps(projectId, conversationContext);
        await this.executeNextStep(projectId, params.userPost);
    }

    @HandleActivity("response", "Handle responses on the thread", ResponseType.RESPONSE)
    protected async handleThreadResponse(params: HandlerParams): Promise<void> {
        const project = params.projects?.[0] as OnboardingProject;
        
        // Get conversation history
        const conversationContext = [...params.rootPost?[params.rootPost]:[], ...params.threadPosts||[], params.userPost]
            .map(post => `[${post.user_id === this.userId ? 'Assistant' : 'User'}] ${post.message}`)
            .join('\n\n');

        // If no active project, treat it as a new conversation
        if (!project) {
            Logger.info("No active project found, starting new conversation");
            const { projectId } = await this.addNewProject({
                projectName: params.userPost.message,
                tasks: [{
                    type: "reply",
                    description: "Initial response to user query."
                }],
                metadata: {
                    originalPostId: params.userPost.id
                }
            });

            const plan = await this.planSteps(projectId, conversationContext);
            await this.executeNextStep(projectId, params.userPost);
            return;
        }

        // Handle response to existing project
        const currentTask = Object.values(project.tasks).find(t => t.inProgress);
        if (!currentTask) {
            Logger.info("No active task, treating as new query in existing project");
            const plan = await this.planSteps(project.id, params.userPost.message);
            await this.executeNextStep(project.id, params.userPost);
            return;
        }

        // Handle response to active task
        const plan = await this.planSteps(project.id, conversationContext);
        await this.executeNextStep(project.id, params.userPost);
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

    constructor(
        chatClient: ChatClient,
        lmStudioService: LMStudioService,
        userId: string,
        projects: TaskManager,
        chromaDBService: ChromaDBService
    ) {
        super(chatClient, lmStudioService, userId, projects, chromaDBService);
        
        // Register our specialized executors
        this.registerStepExecutor(new ReplyExecutor(lmStudioService, projects, this.artifactManager));
        this.registerStepExecutor(new AnswerQuestionsExecutor(lmStudioService, projects));
        this.registerStepExecutor(new UnderstandGoalsExecutor(lmStudioService, projects));
        this.registerStepExecutor(new AnalyzeGoalsExecutor(lmStudioService, projects, this.artifactManager));
        this.registerStepExecutor(new CreatePlanExecutor(lmStudioService, projects, this.artifactManager));
        this.registerStepExecutor(new ReviewProgressExecutor(lmStudioService, projects, this.artifactManager));
        this.registerStepExecutor(new ThinkingExecutor(lmStudioService));
        this.registerStepExecutor(new RefutingExecutor(lmStudioService));
        this.registerStepExecutor(new ValidationExecutor(lmStudioService));

        this.setPurpose(`I am an Onboarding Agent focused on helping users achieve their business goals with our AI Agent tools...`);
    }
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
                1. Determine if the question was answered completely and meaningfully
                2. Extract the specific answer from the response (mark as "Not provided" if unclear or incomplete)
                3. Provide a detailed analysis of the answer quality and completeness
                4. Be specific about what information was provided or what's still missing
                
                Only mark a question as 'answered: true' if:
                - The response directly addresses the question
                - Provides specific, actionable information
                - Contains enough detail to inform our planning
                - Is clear and unambiguous
                
                If the answer is vague, incomplete, or doesn't provide enough context, mark it as 'answered: false'`)
        });

        // Initialize answers array if it doesn't exist
        if (!project.answers) {
            project.answers = [];
        }

        // Update tasks and store answers based on analysis
        for (const answer of modelResponse.answers) {
            const task = project.tasks[answer.questionId];
            if (task && answer.answered) {
                // Validate the answer quality
                const isAnswerMeaningful = answer.extractedAnswer.length > 10 && 
                    !answer.extractedAnswer.toLowerCase().includes("not provided") &&
                    !answer.extractedAnswer.toLowerCase().includes("no answer") &&
                    !answer.analysis.toLowerCase().includes("insufficient") &&
                    !answer.analysis.toLowerCase().includes("unclear");

                if (isAnswerMeaningful) {
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
                        answeredAt: new Date().toISOString(),
                        isComplete: true
                    };
                    await this.projects.completeTask(answer.questionId);
                } else {
                    // Mark as incomplete and needing more information
                    task.metadata = {
                        ...task.metadata,
                        analysis: answer.analysis,
                        partialAnswer: answer.extractedAnswer,
                        needsMoreInfo: true,
                        lastAttempt: new Date().toISOString()
                    };
                }
            }
        }

        // Check if we have enough meaningful information to proceed
        const answeredQuestions = project.answers?.length || 0;
        const totalQuestions = intakeQuestions.length;
        const minimumQuestionsNeeded = Math.ceil(totalQuestions * 0.75); // Require at least 75% of questions

        const remainingQuestions = intakeQuestions.filter(q => 
            !q.metadata?.isComplete
        );

        const hasEnoughInformation = answeredQuestions >= minimumQuestionsNeeded;

        let responseMessage = modelResponse.summary + "\n\n";
        
        if (remainingQuestions.length > 0) {
            responseMessage += "I still need more information:\n\n";
            remainingQuestions.forEach(q => {
                const answer = modelResponse.answers.find(a => a.questionId === q.id);
                responseMessage += `${q.description}\n`;
                if (answer?.partialAnswer) {
                    responseMessage += `Current answer: ${answer.partialAnswer}\n`;
                    responseMessage += `Additional info needed: ${answer.analysis}\n`;
                }
                responseMessage += "\n";
            });
        }

        if (hasEnoughInformation && remainingQuestions.length === 0) {
            responseMessage += "All questions have been answered sufficiently. I'll analyze the information to create a plan.";
        } else if (hasEnoughInformation) {
            responseMessage += "\nWhile we could proceed with the current information, providing answers to the remaining questions would help create a more detailed plan.";
        } else {
            responseMessage += "\nPlease provide more detailed answers so I can create an effective plan.";
        }

        return {
            type: 'answer_analysis',
            finished: hasEnoughInformation && remainingQuestions.length === 0,
            needsUserInput: !hasEnoughInformation || remainingQuestions.length > 0,
            response: {
                message: responseMessage
            }
        };
    }

    private getAnswersForType(project: OnboardingProject, questionType: string): QuestionAnswer[] {
        if (!project.answers) return [];
        
        return project.answers.filter(answer => {
            const task = project.tasks[answer.questionId];
            return task?.type === questionType;
        });
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


}

export default GoalBasedOnboardingConsultant;
