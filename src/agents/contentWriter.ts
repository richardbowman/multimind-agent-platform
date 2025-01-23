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

export class ContentWriter extends Agent {
    protected handlerThread(params: HandlerParams): Promise<void> {
        return this.handleChannel(params);
    }

    protected async handleChannel(params: HandlerParams): Promise<void> {
        let projectId = params.userPost.props["project-id"];
        if (!projectId) {
            Logger.warn("No project ID provided in content creation message");
        }

        try {
            let project = projectId ? await this.projects.getProject(projectId) : undefined;
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
                creator: this.userId
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
            const systemPrompt = `You are a professional content writer. Use the provided search results to write a high-quality section on "${task.title}". 
            Follow these guidelines:
            - Use clear, professional language
            - Cite relevant information from search results
            - Structure content with proper headings and paragraphs
            - Maintain consistent tone and style`;

            const instructions = new StructuredOutputPrompt(schema, systemPrompt);

            // Generate structured response
            const response = await this.modelHelpers.generate<ContentSectionResponse>({
                message: task.description,
                instructions,
                artifacts: searchResults.map(s => ({
                    id: s.id,
                    type: 'search-result',
                    content: `Title: ${s.metadata.title}\nContent: ${s.text}`,
                    metadata: s.metadata
                }))
            });

            // Update task with structured results
            this.projects.updateTask(task.id, {
                props: {
                    ...task.props,
                    result: {
                        ...task.props?.result,
                        response: {
                            message: response.content,
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
                // Add main section
                mergedContent.sections.push({
                    heading: task.title || 'Untitled Section',
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
            .map(section => {
                let content = `## ${section.heading}\n\n${section.content}\n\n`;
                if (section.citations.length > 0) {
                    content += '### References\n\n';
                    content += section.citations
                        .map((cite, i) => `${i + 1}. [Source ${cite.sourceId}] ${cite.excerpt}`)
                        .join('\n');
                    content += '\n\n';
                }
                return content;
            })
            .join('\n\n');

        const replyTo = await this.getMessage(sourceMessage);

        // Reply to the original message
        if (replyTo) {
            await this.reply(
                replyTo,
                {
                    message: `Content generation completed!\n\n${formattedContent}\n\n` +
                        `Total token usage: ${mergedContent.totalTokenUsage.inputTokens} input, ` +
                        `${mergedContent.totalTokenUsage.outputTokens} output`
                },
                {
                    "project-id": project.id,
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
