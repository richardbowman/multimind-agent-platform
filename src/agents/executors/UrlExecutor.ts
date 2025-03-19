import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponseType, StepResult } from '../interfaces/StepResult';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { LinkRef } from '../../helpers/scrapeHelper';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { StructuredOutputPrompt } from 'src/llm/ILLMService';
import Logger from '../../helpers/logger';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { UrlExtractionResponse } from 'src/schemas/UrlExtractionResponse';
import { ExecutorType } from '../interfaces/ExecutorType';

/**
 * Processes user messages to clean up URL refences and extract valid URLs.
 */
@StepExecutorDecorator(ExecutorType.URL_EXTRACT, 'Process user messages to clean up URL refences and extract valid URLs.')
export class UrlExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers!;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const { step, projectId, message, context } = params;
        
        try {
            // Extract URLs from params with context URLs as fallback
            const urls = await this.extractUrls(params);
            const contextUrls = context?.artifacts
                ?.filter(a => a.metadata?.url)
                .map(a => a.metadata?.url) || [];

            const allUrls = [...new Set([...urls, ...contextUrls])];
            
            if (allUrls.length === 0) {
                return {
                    finished: true,
                    replan: ReplanType.Allow,
                    response: {
                        type: StepResponseType.Error,
                        message: `No valid URLs found in step: ${step}`
                    }
                };
            }

            return {
                finished: true,
                type: 'url_extraction',
                replan: ReplanType.Allow,
                response: {
                    status: allUrls.length > 0 
                        ? "Found links:\n"+allUrls.map(a => " - " + a).join('\n')
                        : "I couldn't find any links.",
                    data: {
                        selectedUrls: allUrls
                    }
                }
            };
        } catch (error) {
            Logger.error(`Error looking for links`, error);
            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.Error,
                    message: `Error looking for links: ${error}`
                }
            };
        }
    }

    private async extractUrls(params: ExecuteParams): Promise<string[]> {
        try {
            // Get available links from previous results
            const availableLinks = (params.previousResponses || [])
                .flatMap(r => r.data?.availableLinks || [])
                .filter(Boolean);

            const previousMessages = (params.previousResponses || [])
                .map(r => r.message)
                .filter(Boolean);

            if (!params.message) return [];

            const schema = await getGeneratedSchema(SchemaType.UrlExtractionResponse);
            
            const systemPrompt = `You are a URL extraction assistant. Analyze the user's message and extract any URLs or website references that should be visited:
            - Include full URLs with https:// prefix
            - Convert domain names (test.com) to full URLs
            - Include any relevant paths
            - Preserve any URL parameters
            - Return empty array if no URLs found

            Additional context:
            - Step: ${params.step || 'none'}
            - Available links from previous results: ${availableLinks.join(', ') || 'none'}
            - Previous messages: ${previousMessages.join('\n') || 'none'}`;

            const instructions = new StructuredOutputPrompt(schema, systemPrompt);
            const response = await this.modelHelpers.generate<UrlExtractionResponse>({
                message: params.message, // Just use the user's message as input
                instructions
            });

            // Validate and normalize URLs
            const validUrls = (response.urls || [])
                .filter(url => {
                    try {
                        new URL(url);
                        return true;
                    } catch {
                        return false;
                    }
                })
                .map(url => {
                    const parsed = new URL(url);
                    // Ensure https protocol
                    parsed.protocol = 'https:';
                    return parsed.toString();
                });

            return validUrls;
        } catch (error) {
            Logger.error('Error extracting URLs', error);
            return [];
        }
    }
}
