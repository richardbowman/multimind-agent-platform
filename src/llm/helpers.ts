import { ILLMService } from "./ILLMService";

export class ModelHelpers {
    protected model: ILLMService;

    constructor(model: ILLMService) {
        this.model = model;
    }

    protected async generateStructured(structure: StructuredOutputPrompt, params: GenerateParams): Promise<ModelResponse> {
        // Fetch the latest memory artifact for the channel
        let augmentedInstructions = structure.getPrompt();
        if (this.isMemoryEnabled) {
            const memoryArtifact = await this.fetchLatestMemoryArtifact(params.userPost.channel_id);

            // Append the memory content to the instructions if it exists
            if (memoryArtifact && memoryArtifact.content) {
                const memoryContent = memoryArtifact.content.toString();
                augmentedInstructions += `\n\nContext from previous interactions:\n${memoryContent}`;
            }
        }

        // Deduplicate artifacts first, then search results
        const deduplicatedArtifacts = params.artifacts ? this.deduplicateArtifacts(params.artifacts) : [];
        const deduplicatedSearchResults = params.searchResults ? this.deduplicateSearchResults(params.searchResults, deduplicatedArtifacts) : undefined;

        if (deduplicatedSearchResults) {
            augmentedInstructions += `\n\nSearch results from knowledge base:\n${deduplicatedSearchResults.map(s => `<searchresult>Result ID: ${s.id}\nResult Title:${s.metadata.title}\nResult Content:\n${s.text}</searchresult>\n\n`)}`;
        }

        if (deduplicatedArtifacts) {
            for (const artifact of deduplicatedArtifacts) {
                const artifactContent = artifact.content ? artifact.content.toString() : 'No content available';
                augmentedInstructions += `\n\n<artifact>Artifact ID: ${artifact.id}\nTitle: ${artifact.metadata?.title || 'No title'}\nContent:\n${artifactContent}</artifact>`;
            }
        }

        // Augment instructions with context and generate a response
        const history = params.threadPosts || params.projectChain?.posts.slice(0, -1) || [];

        const augmentedStructuredInstructions = new StructuredOutputPrompt(structure.getSchema(), augmentedInstructions);

        const { contextWindow, maxTokens } = params;

        const response = await this.lmStudioService.generateStructured(params.userPost?params.userPost:params.message?  params:{ message: ""}, augmentedStructuredInstructions, history, contextWindow, maxTokens);
        response.artifactIds = params.artifacts?.map(a => a.id);
        return response;
    }

    protected async generate(params: GenerateInputParams): Promise<ModelResponse> {
        if (params.instructions instanceof StructuredOutputPrompt) {
            return this.generateStructured(params.instructions, params);
        } else {
            return this.generateOld(params.instructions.toString(), params);
        }
        
    }

    /**
     * @deprecated
     */
    protected async generateOld(instructions: string, params: GenerateParams): Promise<ModelResponse> {
        // Fetch the latest memory artifact for the channel
        let augmentedInstructions = `AGENT PURPOSE: ${this.purpose}\n\nINSTRUCTIONS: ${instructions}`;

        if (this.isMemoryEnabled && (params as HandlerParams).userPost) {
            const memoryArtifact = await this.fetchLatestMemoryArtifact((params as HandlerParams).userPost.channel_id);

            // Append the memory content to the instructions if it exists
            if (memoryArtifact && memoryArtifact.content) {
                const memoryContent = memoryArtifact.content.toString();
                augmentedInstructions += `\n\nContext from previous interactions:\n${memoryContent}`;
            }
        }

        // Deduplicate artifacts first, then search results
        const deduplicatedArtifacts = params.artifacts ? this.deduplicateArtifacts(params.artifacts) : [];
        const deduplicatedSearchResults = params.searchResults ? this.deduplicateSearchResults(params.searchResults, deduplicatedArtifacts) : undefined;

        if (deduplicatedSearchResults) {
            augmentedInstructions += `\n\nSearch results from knowledge base:\n${deduplicatedSearchResults.map(s => `<searchresult>Result ID: ${s.id}\nResult Title:${s.metadata.title}\nResult Content:\n${s.text}</searchresult>\n\n`)}`;
        }

        if (deduplicatedArtifacts) {
            for (const artifact of deduplicatedArtifacts) {
                const artifactContent = artifact.content ? artifact.content.toString() : 'No content available';
                augmentedInstructions += `\n\n<artifact>Artifact ID: ${artifact.id}\nTitle: ${artifact.metadata?.title || 'No title'}\nContent:\n${artifactContent}</artifact>`;
            }
        }

        // Augment instructions with context and generate a response
        const history = (params as HandlerParams).threadPosts || (params as ProjectHandlerParams).projectChain?.posts.slice(0, -1) || [];
        const response = await this.lmStudioService.generate(augmentedInstructions, (params as HandlerParams).userPost||{message:params.message||""}, history);
        (response as RequestArtifacts).artifactIds = params.artifacts?.map(a => a.id);
        
        return response;
    }
}
