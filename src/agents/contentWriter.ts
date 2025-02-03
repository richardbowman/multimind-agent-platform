import { Agent, HandlerParams } from './agents';
import { StructuredOutputPrompt } from 'src/llm/ILLMService';
import Logger from 'src/helpers/logger';
import { ContentProject, ContentTask } from './contentManager';
import { CreateProjectParams, TaskType } from 'src/tools/taskManager';
import { TaskCategories } from './interfaces/taskCategories';
import { createUUID } from 'src/types/uuid';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { ContentSectionResponse } from 'src/schemas/ContentSectionResponse';
import { ContentType, PromptBuilder } from 'src/llm/promptBuilder';
import { contentType } from 'mime-types';

export class ContentWriter extends Agent {
    protected handlerThread(params: HandlerParams): Promise<void> {
        return this.handleChannel(params);
    }

    protected async handleChannel(params: HandlerParams): Promise<void> {
        let projectIds = params.userPost.props["project-ids"];
        if (!projectIds) {
            Logger.warn("No project ID provided in content creation message");
        }

        try {
            let project = projectIds ? await this.projects.getProject(projectIds[0]) : undefined;
            if (!project || !project.metadata.tags?.includes("writing-request")) {
                // Create new project if it doesn't exist
                const newProject : CreateProjectParams = {
                    name: "Solve the user's writing request",
                    metadata: {
                        tags: ["writing-request"],
                        owner: this.userId,
                        originalPostId: params.userPost.id
                    }
                };
                
                project = await this.projects.createProject(newProject);
                Logger.info(`Created new project ${project.id}`);
            }

            // Create a new content task from the message
            const task = await this.projects.addTask(project, {
                description: "Content Section: " + params.userPost.message,
                type: TaskType.Standard,
                category: TaskCategories.Writing,
                creator: this.userId,
                props: {
                    'artifact-ids': params.artifacts?.map(a => a.id),
                    'project-ids': params.projects?.map(p => p.id),
                    'thread-chain': [params.rootPost, ...params.threadPosts||[]]
                }
            });
            await this.processTask(task);
        } catch (error) {
            Logger.error("Error handling content creation message", error);
        }
    }

    async processTask(task: ContentTask) {
        try {
            // Get relevant search results
            const searchResults = await this.vectorDBService.query([task.description], undefined, 10);
            
            // Create structured prompt
            const schema = await getGeneratedSchema(SchemaType.ContentSectionResponse);

            const prompt = this.modelHelpers.createPrompt();

            prompt.addContent(ContentType.PURPOSE);
            prompt.addInstruction(`You are a professional content writer. Use the provided search results to:
            1. Write a response message summarizing your findings
            2. Create a structured content outline with headings and subheadings
            3. Include citations for all referenced material

            Follow these guidelines:
            - Response message should be 2-3 sentences summarizing the key points
            - Structure content with clear, descriptive headings
            - Use bullet points for key information in subheadings
            - Cite sources using the provided search results
            - Maintain professional tone and style`);

            if (task.props && task.props['thread-chain']) {
                prompt.addContent(ContentType.CONVERSATION, task.props['thread-chain']);
            }
            
            if (task.props && task.props['artifact-ids']) {
                const artifacts = await this.mapRequestedArtifacts(task.props['artifact-ids']);
                prompt.addContent(ContentType.ARTIFACTS_EXCERPTS, artifacts);
            }

            prompt.addContent(ContentType.FINAL_INSTRUCTIONS);

            const instructions = new StructuredOutputPrompt(schema, prompt);

            // Generate structured response
            const response = await this.modelHelpers.generate<ContentSectionResponse>({
                message: task.description,
                instructions,
                searchResults: searchResults
            });

            // Update task with structured results
            this.projects.updateTask(task.id, {
                props: {
                    ...task.props,
                    result: {
                        ...task.props?.result,
                        response: {
                            message: response.responseMessage,
                            contentBlockId: createUUID(),
                            citations: response.citations,
                            structure: response.structure,
                            _usage: response._usage
                        }
                    } 
                }
            });
        } catch (error) {
            Logger.error(`Error processing task "${task.title} ${task.description}"`, error);
            
            // Mark task as failed with error details
            await this.projects.updateTask(task.id, {
                props: {
                    ...task.props,
                    status: 'failed',
                    error: {
                        message: error.message,
                        stack: error.stack,
                        timestamp: Date.now()
                    }
                }
            });
        } finally {
            try {
                // Ensure task is marked complete even if error occurred
                await this.projects.completeTask(task.id);
            } catch (finalError) {
                Logger.error('Error completing task', finalError);
            }
        }
    }

    protected async projectCompleted(project: ContentProject): Promise<void> {
        // Check if this was a project created from a message
        const sourceMessage = project.metadata?.originalPostId;
        if (!sourceMessage) {
            return;
        }

        // Get all completed tasks for this project
        const tasks = await this.projects.getAllTasks(project.id);
        const completedTasks = tasks.filter(task => task.complete && task.props?.result?.response);

        // Merge all sections while preserving structure and citations
        const mergedContent = {
            title: project.name,
            sections: [] as Array<{
                heading: string;
                content: string;
                citations: Array<{
                    sourceId: string;
                    excerpt: string;
                    reference?: string;
                }>;
            }>,
            totalTokenUsage: {
                inputTokens: 0,
                outputTokens: 0
            }
        };

        // Process each task's response
        for (const task of completedTasks) {
            const response = task.props?.result?.response;
            if (response) {
                // Add main section using structured heading
                mergedContent.sections.push({
                    heading: response.structure?.heading || task.title || 'Untitled Section',
                    content: response.message,
                    citations: response.citations || []
                });

                // Add any subheadings from structure
                if (response.structure?.subheadings) {
                    mergedContent.sections.push(...response.structure.subheadings.map(sh => ({
                        heading: sh.title,
                        content: sh.content,
                        citations: response.citations || []
                    })));
                }

                // Accumulate token usage
                if (response._usage) {
                    mergedContent.totalTokenUsage.inputTokens += response._usage.inputTokens || 0;
                    mergedContent.totalTokenUsage.outputTokens += response._usage.outputTokens || 0;
                }
            }
        }

        // Format final content with citations
        const formattedContent = mergedContent.sections
            .map(section => `## ${section.heading}\n\n${section.content}\n\n`)
            .join('\n\n');

        const formattedReferences = mergedContent.sections.map(section => section.citations).flat().filter(c => c && c.excerpt)
            .map((cite, i) => `${i + 1}. [Source ${cite.sourceId}] ${cite.excerpt}`)
            .join('\n\n');

        const formattedFullContent = formattedContent + '### References\n\n' + formattedReferences;


        const replyTo = await this.getMessage(sourceMessage);

        // Reply to the original message
        if (replyTo) {
            await this.reply(
                replyTo,
                {
                    message: `Content generation completed!\n\n${formattedFullContent}\n\n` +
                        `Total token usage: ${mergedContent.totalTokenUsage.inputTokens} input, ` +
                        `${mergedContent.totalTokenUsage.outputTokens} output`
                },
                {
                    "project-ids": [project.id],
                    "artifact-ids": completedTasks
                        .map(t => t.props?.result?.response?.contentBlockId)
                        .filter(Boolean)
                }
            );
        } else {
            Logger.warn("Content generation completed, but could not find a post to reply with the information.");
        }
    }


}
