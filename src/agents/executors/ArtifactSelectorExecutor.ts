import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { StepResponse, StepResponseType, StepResult, StepResultType } from "../interfaces/StepResult";
import { ArtifactManager } from "src/tools/artifactManager";
import { Artifact } from "src/tools/artifact";
import { ModelHelpers } from "src/llm/modelHelpers";
import { ContentType } from "src/llm/promptBuilder";
import { ModelType } from "src/llm/LLMServiceFactory";
import { ExecutorType } from "../interfaces/ExecutorType";
import TurndownService from 'turndown';
import { LinkRef } from "src/helpers/scrapeHelper";

export interface ArtifactSelectionResponse extends StepResponse {
    type: StepResponseType.WebPage;
    data: {
        selectedArtifacts: Artifact[];
        selectionReason: string;
        extractedLinks: LinkRef[];
    };
}

@StepExecutorDecorator(ExecutorType.ARTIFACT_SELECTOR, 'Selects relevant artifacts from existing collection')
export class ArtifactSelectorExecutor implements StepExecutor<ArtifactSelectionResponse> {
    private artifactManager: ArtifactManager;
    private modelHelpers: ModelHelpers;
    turndownService: any;

    constructor(params: ExecutorConstructorParams) {
        this.artifactManager = params.artifactManager;
        this.modelHelpers = params.modelHelpers;
    }

    async execute(params: ExecuteParams): Promise<StepResult<ArtifactSelectionResponse>> {
        if (!this.turndownService) {
            this.turndownService = new TurndownService();
            const gfm = await import('remark-gfm');
            this.turndownService.use(gfm);
        }

        // Get all available artifacts
        const allArtifacts = await this.artifactManager.getArtifacts();

        if (!allArtifacts.length) {
            return {
                finished: true,
                response: {
                    type: StepResponseType.WebPage,
                    message: 'No artifacts available to select from',
                    data: {
                        selectedArtifacts: [],
                        selectionReason: 'No artifacts available'
                    }
                }
            };
        }

        // Generate prompt to select relevant artifacts
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`Your task is to select the most relevant artifacts from the available collection based on the user's request.`);
        prompt.addContext({contentType: ContentType.PURPOSE});
        prompt.addContext({contentType: ContentType.GOALS_FULL, params});
        prompt.addContext({contentType: ContentType.EXECUTE_PARAMS, params});
        
        // Add artifact summaries to the prompt
        const artifactSummaries = allArtifacts.map(artifact => 
            `Artifact ID: ${artifact.id}\n` +
            `Type: ${artifact.type}\n` +
            `Summary: ${artifact.metadata?.title || 'No title'}\n` +
            `Created: ${new Date(artifact.metadata?.createDate || Date.now()).toLocaleDateString()}\n`
        ).join('\n---\n');

        prompt.addInstruction(`Available Artifacts:\n${artifactSummaries}`);
        prompt.addInstruction(`Please select the most relevant artifacts for the current task and explain your reasoning.`);

        const selectionResponse = await this.modelHelpers.generate({
            instructions: prompt.build(),
            message: params.stepGoal,
            model: ModelType.REASONING
        });

        // Parse the response to get selected artifact IDs
        const selectedIds = this.extractArtifactIds(selectionResponse.message);
        const selectedArtifacts = allArtifacts.filter(artifact => selectedIds.includes(artifact.id));

        // Extract links from all selected artifacts
        const allLinks = selectedArtifacts.flatMap(artifact =>
            this.extractLinksFromArtifact(artifact)
        );

        return {
            finished: true,
            type: StepResultType.WebScrapeStepResult,
            artifactIds: selectedArtifacts.map(a => a.id),
            response: {
                type: StepResponseType.WebPage,
                message: `Selected ${selectedArtifacts.length} artifacts with ${allLinks.length} links:\n\n${selectionResponse.message}`,
                data: {
                    selectedArtifacts,
                    selectionReason: selectionResponse.message,
                    extractedLinks: allLinks
                }
            }
        };
    }

    private extractArtifactIds(message: string): string[] {
        // Simple regex to extract artifact IDs from the message
        const idRegex = /Artifact ID:\s*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/gi;
        const matches = message.match(idRegex);
        return matches 
            ? matches.map(m => m.replace('Artifact ID:', '').trim())
            : [];
    }

    private async extractLinksFromArtifact(artifact: Artifact): Promise<LinkRef[]> {
        if (typeof artifact.content !== 'string') {
            return [];
        }

        // Convert HTML to Markdown to easily extract links
        const markdown = this.turndownService.turndown(artifact.content);

        // Extract all markdown links [text](url)
        const linkRegex = /\[(.*?)\]\((.*?)\)/g;
        let matches;
        const links: LinkRef[] = [];

        while ((matches = linkRegex.exec(markdown)) !== null) {
            const [_, title, url] = matches;
            if (url.trim()) {
                links.push({
                    title: title.trim() || url, // Use URL as title if no title provided
                    url: url.trim()
                });
            }
        }

        return links;
    }
}
