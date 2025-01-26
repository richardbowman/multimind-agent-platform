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
}