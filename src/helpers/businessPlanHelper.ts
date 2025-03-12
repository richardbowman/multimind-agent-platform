import { Artifact } from "../tools/artifact";
import { OnboardingProject } from "../agents/onboardingConsultant";
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ArtifactManager } from "../tools/artifactManager";
import { ModelHelpers } from "../llm/modelHelpers";
import crypto from 'crypto';

export async function updateBusinessPlan(
    project: OnboardingProject, 
    modelHelpers: ModelHelpers,
    artifactManager: ArtifactManager,
    existingPlan?: Artifact,
    operationalGuide?: any
): Promise<string> {
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

    const response = await modelHelpers.generate({
        message: JSON.stringify({
            goals: Object.values(project.tasks).filter(t => t.category === 'business-goal'),
            existingPlan: existingContent,
            projectId: project.id,
            latestUpdate: project.props?.latestUpdate || '',
            operationalGuide: operationalGuide
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
    const artifact = await artifactManager.saveArtifact({
        id: existingPlan?.id,
        type: 'business-plan',
        content: response.content,
        metadata: {
            title: response.title,
            lastUpdated: new Date().toISOString()
        }
    });

    return artifact.id;
}
