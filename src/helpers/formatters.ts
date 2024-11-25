// Utility function to format Markdown
export function formatMarkdownForTerminal(text: string): string {
    // Handle bold text
    const boldRegex = /\*\*(.*?)\*\*/g;
    text = text.replace(boldRegex, '{bold}$1{/bold}');

    // Handle italic text
    const italicRegex = /\*(.*?)\*/g;
    text = text.replace(italicRegex, '{italic}$1{/italic}');

    // Handle code text
    const codeRegex = /`(.+?)`/g;
    text = text.replace(codeRegex, '{cyan-fg}$1{/cyan-fg}');

    return text;
}