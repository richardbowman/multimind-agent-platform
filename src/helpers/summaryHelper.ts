import LMStudioService from "../llm/lmstudioService";

class SummaryHelper {
    async summarizeContent(task: string, content: string, lmStudioService: LMStudioService): Promise<string> {
        const systemPrompt = `You are a research assistant. Our overall goal was ${task}.
        Create a report of any information from this web search result you think will be relevant to our goal for the research manager to review including the original URL. Please skip any errors, and you can just return an empty response for non-relevant information.`;

        const userPrompt = "Web Search Result:" + content;

        const history = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ];

        return await lmStudioService.sendMessageToLLM(userPrompt, history);
    }

    async createOverallSummary(goal: string, task: string, summaries: string[], lmStudioService: LMStudioService): Promise<string> {
        const systemPrompt = `You are a research assistant. Our overall goal was ${goal}, and we're currently trying to research ${task}.
        Create a report of the most important information from these individual web page reports that you think will be relevant to our goal for the research manager to review including the original URLs. Please skip errors and focus on relevant information.`;
        const userPrompt = summaries.join("\n\n");

        const history = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ];

        return await lmStudioService.sendMessageToLLM(userPrompt, history);
    }
}

export default SummaryHelper;