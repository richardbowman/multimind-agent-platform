import LMStudioService from "../llm/lmstudioService";

class SummaryHelper {
    async summarizeContent(task: string, content: string, lmStudioService: LMStudioService): Promise<string> {
        const systemPrompt = `You are a research assistant. The goal is to summarize a web search result for the user's goal of: ${task}.
        Create a report in Markdown of all of the specific information from the provided web page that is relevant to our goal.
        If the page has no relevant information to the goal, respond with NOT RELEVANT.`;

        const userPrompt = "Web Search Result:" + content;

        const history = [
            { role: "system", content: systemPrompt }
        ];

        const summary = await lmStudioService.sendMessageToLLM(userPrompt, history);

        return summary;
    }

    async createOverallSummary(goal: string, task: string, summaries: string[], lmStudioService: LMStudioService): Promise<string> {
        const systemPrompt = `You are a research assistant. Our overall goal was ${goal}, and we're currently trying to research ${task}.
        Create a report of the most important information from these individual web page reports that you think will be relevant to our goal for the research manager to review including the original URLs. Please skip errors and focus on relevant information.`;
        const userPrompt = "Web Search Results:" + summaries.join("\n\n");

        const history = [
            { role: "system", content: systemPrompt }
        ];

        return await lmStudioService.sendMessageToLLM(userPrompt, history);
    }
}

export default SummaryHelper;