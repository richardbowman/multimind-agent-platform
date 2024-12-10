import { Agent, HandleActivity, HandlerParams, ResponseType } from './agents';
import { ChatClient } from '../chat/chatClient';
import LMStudioService from '../llm/lmstudioService';
import { TaskManager, Task, Project } from '../tools/taskManager';
import Logger from '../helpers/logger';
import { FACT_CHECKER_USER_ID } from '../helpers/config';
import { randomUUID } from 'crypto';

export enum FactCheckerActivityType {
    VerifyContent = "verify-content",
    ProvideSourcesForClaim = "provide-sources",
    ReviewCorrections = "review-corrections"
}

export interface FactCheckProject extends Project<FactCheckTask> {
    contentToVerify: string;
    verificationResults?: string;
}

export interface FactCheckTask extends Task {
    claim: string;
    verification?: {
        isVerified: boolean;
        evidence: string;
        confidence: number;
        suggestedCorrection?: string;
    };
}

export class FactChecker extends Agent<FactCheckProject, FactCheckTask> {
    constructor(chatClient: ChatClient, lmStudioService: LMStudioService, projects: TaskManager) {
        super(chatClient, lmStudioService, FACT_CHECKER_USER_ID, projects);
        this.setPurpose("I am a fact-checking agent that verifies claims and provides evidence from reliable sources.");
    }

    protected async processTask(task: FactCheckTask): Promise<void> {
        try {
            // Search for evidence in the knowledge base
            const searchResults = await this.chromaDBService.query([task.claim], undefined, 5);
            
            const verificationPrompt = `
                As a fact checker, verify this claim: "${task.claim}"
                
                Here are relevant search results:
                ${searchResults.map(r => `Source: ${r.metadata.title}\nContent: ${r.text}\n`).join('\n')}
                
                Analyze the claim and provide:
                1. Whether the claim is verified (true/false)
                2. Supporting evidence
                3. Confidence level (0-1)
                4. If false, suggest a correction
                
                Format as JSON:
                {
                    "isVerified": boolean,
                    "evidence": "string",
                    "confidence": number,
                    "suggestedCorrection": "string"
                }`;

            const verificationResult = await this.lmStudioService.sendMessageToLLM(
                task.claim,
                [{ role: "system", content: verificationPrompt }],
                undefined,
                8192,
                512,
                {
                    type: "object",
                    properties: {
                        isVerified: { type: "boolean" },
                        evidence: { type: "string" },
                        confidence: { type: "number" },
                        suggestedCorrection: { type: "string" }
                    }
                }
            );

            task.verification = JSON.parse(verificationResult);
            task.complete = true;
            
            await this.projects.completeTask(task.id);

        } catch (error) {
            Logger.error('Error verifying fact:', error);
            throw error;
        }
    }

    protected async projectCompleted(project: FactCheckProject): Promise<void> {
        const verificationSummary = Object.values(project.tasks)
            .map(task => {
                const v = task.verification;
                return `
Claim: ${task.claim}
Status: ${v.isVerified ? '✅ Verified' : '❌ Not Verified'}
Confidence: ${Math.round(v.confidence * 100)}%
Evidence: ${v.evidence}
${!v.isVerified ? `Suggested Correction: ${v.suggestedCorrection}` : ''}
`;
            })
            .join('\n---\n');

        project.verificationResults = verificationSummary;

        const responseMessage = `
Fact Check Results:
${verificationSummary}`;

        await this.chatClient.postInChannel(project.channelId, responseMessage);
    }

    @HandleActivity(FactCheckerActivityType.VerifyContent, "Verify factual claims in content", ResponseType.CHANNEL)
    private async handleVerifyContent(params: HandlerParams) {
        const content = params.userPost.message;
        
        // Extract claims to verify
        const extractClaimsPrompt = `
            Analyze this content and extract specific factual claims that need verification.
            Format each claim as a separate string in a JSON array.
            Focus on objective, verifiable statements.
            
            Content: ${content}
            
            Return format: ["claim 1", "claim 2", ...]`;

        const claimsJson = await this.lmStudioService.sendMessageToLLM(
            content,
            [{ role: "system", content: extractClaimsPrompt }],
            undefined,
            8192,
            512,
            { type: "array", items: { type: "string" } }
        );

        const claims = JSON.parse(claimsJson);

        // Create a new project for this verification
        const project: FactCheckProject = {
            id: this.projects.newProjectId(),
            name: `Fact Check - ${new Date().toISOString()}`,
            contentToVerify: content,
            channelId: params.userPost.channel_id,
            tasks: {}
        };

        // Create tasks for each claim
        for (const claim of claims) {
            const task: FactCheckTask = {
                id: randomUUID(),
                description: `Verify claim: ${claim}`,
                claim: claim,
                creator: FACT_CHECKER_USER_ID,
                projectId: project.id,
                complete: false,
                type: 'fact-check'
            };
            project.tasks[task.id] = task;
        }

        await this.projects.addProject(project);

        // Assign tasks to self
        for (const taskId of Object.keys(project.tasks)) {
            await this.projects.assignTaskToAgent(taskId, FACT_CHECKER_USER_ID);
        }

        const response = `I'll verify ${claims.length} factual claims from this content. I'll post the results here once the verification is complete.`;
        
        await this.reply(params.userPost, { 
            message: response,
            artifactIds: []
        }, {
            'project-id': project.id,
            'activity-type': FactCheckerActivityType.VerifyContent
        });
    }
}
