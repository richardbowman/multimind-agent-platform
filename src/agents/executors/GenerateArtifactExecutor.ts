import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult } from '../interfaces/StepResult';
import { ModelMessageResponse, RequestArtifacts } from '../../schemas/ModelResponse';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { randomUUID } from 'crypto';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Artifact } from 'src/tools/artifact';
import Logger from '../../helpers/logger';
import { ExecutorType } from '../interfaces/ExecutorType';
import { TaskManager } from 'src/tools/taskManager';
import { PromptBuilder, ContentType } from 'src/llm/promptBuilder';
import { createUUID, UUID } from 'src/types/uuid';
import { contentType } from 'mime-types';
import { ArtifactGenerationResponse } from 'src/schemas/ArtifactGenerationResponse';
import { StructuredOutputPrompt } from 'src/llm/ILLMService';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { StringUtils } from 'src/utils/StringUtils';
import JSON5 from 'json5';
/**
 * Executor that generates and manages Markdown document artifacts.
 * Key capabilities:
 * - Creates new Markdown documents with structured content
 * - Revises existing artifacts while maintaining version history
 * - Generates appropriate titles and metadata
 * - Handles both creation and update workflows
 * - Supports artifact versioning and tracking
 * - Manages artifact storage and retrieval
 * - Provides confirmation messages for operations
 * - Handles errors gracefully with logging
 * - Generates unique IDs for new artifacts
 * - Preserves existing IDs during revisions
 */
@StepExecutorDecorator(ExecutorType.GENERATE_ARTIFACT, 'Create/revise a Markdown document, Mermaid diagram, or spreadsheet (CSV)')
export class GenerateArtifactExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private artifactManager: ArtifactManager;

    private taskManager?: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

        this.artifactManager = params.artifactManager!;
        this.taskManager = params.taskManager;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const promptBuilder = this.modelHelpers.createPrompt();

        // Add core instructions
        promptBuilder.addInstruction("Generate or modify a Markdown document based on the goal.");
        promptBuilder.addInstruction(`You have these options:
1. Create a NEW document (leave artifactId blank and set operation to "create")
2. Replace an EXISTING document (specify artifactId and set operation to "replace")
3. Append to an EXISTING document (specify artifactId and set operation to "append")`);

        promptBuilder.addInstruction(`Provide:
- artifactId: ID of document to modify (only required for replace/append operations)
- operation: Must be "create" for new documents, "replace" or "append" for existing ones
- title: Document title
- type: Document type - must be one of: "markdown", "csv", or "mermaid"`);

        promptBuilder.addInstruction(`CONTENT FORMATTING RULES:
- For markdown: Use standard Markdown syntax
- For csv: Provide comma-separated values with header row
- For mermaid: Provide Mermaid diagram syntax only`);

        promptBuilder.addInstruction(`IMPORTANT RULES:
- For NEW documents: Use operation="create" and omit artifactId
- For EXISTING documents: Use operation="replace" or "append" and provide artifactId`);

        // Add Q&A context from project metadata
        try {
            const project = this.taskManager?.getProject(params.projectId);
            if (project?.metadata?.answers) {
                promptBuilder.addContent(ContentType.DOCUMENTS, {
                    title: "Q&A Context",
                    content: project.metadata.answers.map((a: any) => 
                        `Q: ${a.question}\nA: ${a.answer}`
                    ).join('\n\n')
                });
            }
        } catch (error) {
            Logger.warn('Failed to fetch Q&A context:', error);
        }

        // Add existing artifacts from previous results
        promptBuilder.addContent(ContentType.ARTIFACTS_EXCERPTS, params.context?.artifacts);

        // Add execution parameters
        promptBuilder.addContent(ContentType.EXECUTE_PARAMS, {
            goal: params.goal,
            stepGoal: params.stepGoal
        });

        // Add previous results if available
        if (params.previousResult) {
            promptBuilder.addContent(ContentType.STEP_RESULTS, params.previousResult);
        }

        const schema = await getGeneratedSchema(SchemaType.ArtifactGenerationResponse);

        promptBuilder.addInstruction(`OUTPUT INSTRUCTIONS:
1. To create the requested artifact, you will use two code blocks, one to contain attributes about the document, and the other for the content.
2. Use one enclosed code block with the hidden indicator \`\`\`json[hidden] that matches this JSON Schema:
${JSON.stringify(schema, null, 2)}
for the file attributes`);

        promptBuilder.addInstruction(`3. Provide the content in a separately enclosed code block using the appropriate syntax:
- For markdown: \`\`\`markdown
- For csv: \`\`\`csv
- For mermaid: \`\`\`mermaid`);

promptBuilder.addInstruction(`4. You may only provide one content type per response. If you need to provide multiple content types, please respond suggesting other content types to generate.`);

        const prompt = promptBuilder.build();
        
        try {
            const unstructuredResult = await this.modelHelpers.generate<ModelMessageResponse>({
                message: params.message || params.stepGoal,
                instructions: prompt,
                threadPosts: params.context?.threadPosts
            });
            
            const json = StringUtils.extractAndParseJsonBlocks(unstructuredResult.message)[0];
            const md = StringUtils.extractCodeBlocks(unstructuredResult.message).filter(b => b.type !== 'json')[0];

            const result = {
                ...json,
                content: md.code
            } as ArtifactGenerationResponse & { content: string };

            // Prepare the artifact
            let finalContent = result.content;
            let finalType = result.type?.toLowerCase();
            let finalArtifactId : UUID = undefined;

            if (result.artifactId && result.operation === 'append' && result.artifactId) {
                try {
                    finalArtifactId = params.context?.artifacts[result.artifactId].id;
                    const existingArtifact = await this.artifactManager.loadArtifact(finalArtifactId);
                    finalContent = `${existingArtifact?.content||""}\n${result.content}`;
                    finalType = existingArtifact?.type;
                } catch (error) {
                    Logger.error(`Could not find existing artifact for append operation ${result.artifactId}`, error);
                }
            } else {
                // Validate document type
                const validTypes = ['markdown', 'csv', 'mermaid'];
                if (!validTypes.includes(finalType)) {
                    throw new Error(`Invalid document type: ${finalType}. Must be one of: ${validTypes.join(', ')}`);
                }
            }

            const artifact: Partial<Artifact> = {
                id: finalArtifactId,
                type: finalType,
                content: finalContent,
                metadata: {
                    title: result.title,
                    operation: result.operation || 'create',
                    previousVersion: result.artifactId ? result.artifactId : undefined,
                    projectId: params.projectId
                }
            };

            // Save the artifact
            await this.artifactManager.saveArtifact(artifact);

            return {
                type: "generate-artifact",
                finished: true,
                artifactIds: [artifact.id],
                response: unstructuredResult,
            };

        } catch (error) {
            Logger.error('Error generating artifact:', error);
            return {
                type: "generate-artifact",
                finished: true,
                needsUserInput: true,
                response: {
                    message: 'Failed to generate the artifact. Please try again later.'
                }
            };
        }
    }
}
