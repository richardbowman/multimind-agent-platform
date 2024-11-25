// systemPromptBuilder.ts (1-20)
export class SystemPromptBuilder {
    private currentDate: string;
    
    private PROMPT_WRAPPER = "The current date is {currentDate}.\n\n{prompt}"

    constructor() {
        this.currentDate = new Date().toISOString();
    }

    public build(promptTemplate: string): string {
        return this.PROMPT_WRAPPER.replace("{prompt}", promptTemplate).replace("{currentDate}", this.currentDate);
    }

    public parseMarkdownList(markdown: string): string[] {
        const regex = /^-\s+(.*)$/gm;
        let match;
        const tasks: string[] = [];

        while ((match = regex.exec(markdown)) !== null) {
            tasks.push(match[1].trim());
        }

        return tasks;
    }
}