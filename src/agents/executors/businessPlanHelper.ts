import { Artifact } from "src/tools/artifact";
import { OnboardingProject } from "../onboardingConsultant";

export async function updateBusinessPlan(project: OnboardingProject, existingPlan?: Artifact): Promise<string> {
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