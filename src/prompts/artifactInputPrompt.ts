

export class ArtifactInputPrompt {
    private instructions: string;

    constructor(instructions: string) {
        this.instructions = instructions;
    }

    public toString() : string {
        const instructionsWithExample = `
        ${this.instructions}
        Respond with your response message in a JSON object, the title of the document, and the content of the document.
        {
            "message": "Your message here",
            "artifactTitle": "Title of your document",
            "artifactContent": "Markdown formatted content"
        }`;
        return instructionsWithExample;
    }
}