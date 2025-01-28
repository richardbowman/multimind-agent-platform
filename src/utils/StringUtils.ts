export namespace StringUtils {
    export function truncate(string: string, maxLength: number, truncationMsg = (maxLength : number, originalLength : number) => `[Truncated to ${maxLength}. Original length: ${originalLength}`) {
        if (typeof string === "string") {
            const originalLength = string.length;
            return string.substring(0, maxLength) + (originalLength > maxLength ? truncationMsg(maxLength, originalLength) : "");
        } else {
            return string;
        }
    }

    export function extractCodeBlocks(text: string): string[] {
        const codeBlockRegex =
    /```(?:javascript|typescript|python|java|bash|json|html|css|markdown|yaml|xml)[\s\S]*?\n([\s\S]*?)```/g;
        const matches : string[] = [];
        let match : RegExpExecArray|null;
    
        while ((match = codeBlockRegex.exec(text)) !== null) {
            matches.push(match[1].trim());
        }
    
        return matches;
    }

    /**
     * Extracts JSON from code blocks and parses it
     * @param text Input text containing JSON code blocks
     * @returns Array of parsed JSON objects
     * @throws SyntaxError if JSON parsing fails
     */
    export function extractAndParseJsonBlocks(text: string): any[] {
        const jsonBlockRegex = /```json[\s\S]*?\n([\s\S]*?)```/g;
        const matches: any[] = [];
        let match: RegExpExecArray|null;

        while ((match = jsonBlockRegex.exec(text)) !== null) {
            try {
                const jsonString = match[1].trim();
                const parsed = JSON.parse(jsonString);
                matches.push(parsed);
            } catch (error) {
                throw new SyntaxError(`Failed to parse JSON block: ${error.message}`);
            }
        }

        return matches;
    }

    /**
     * Extracts text content that is not within code blocks
     * @param text Input text containing code blocks
     * @returns String with all content outside of code blocks
     */
    export function extractNonCodeContent(text: string): string {
        // Replace all code blocks (with any language specifier) with empty strings
        const withoutCodeBlocks = text.replace(/```[\s\S]*?```/g, '');
        return withoutCodeBlocks.trim();
    }
}
