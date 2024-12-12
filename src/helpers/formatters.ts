// Utility function to format Markdown
export function formatMarkdownForTerminal(text: string): string {
    // Handle headers (h1 to h6)
    text = text.replace(/^#{6}\s+(.+)$/gm, '{gray-fg}$1{/gray-fg}');
    text = text.replace(/^#{5}\s+(.+)$/gm, '{gray-fg}$1{/gray-fg}');
    text = text.replace(/^#{4}\s+(.+)$/gm, '{yellow-fg}$1{/yellow-fg}');
    text = text.replace(/^#{3}\s+(.+)$/gm, '{yellow-fg}$1{/yellow-fg}');
    text = text.replace(/^#{2}\s+(.+)$/gm, '{green-fg}{bold}$1{/bold}{/green-fg}');
    text = text.replace(/^#{1}\s+(.+)$/gm, '{magenta-fg}{bold}$1{/bold}{/magenta-fg}');

    // Handle bold text
    const boldRegex = /\*\*(.*?)\*\*/g;
    text = text.replace(boldRegex, '{bold}$1{/bold}');

    // Handle italic text
    const italicRegex = /\*(.*?)\*/g;
    text = text.replace(italicRegex, '{blue-fg}$1{/blue-fg}');

    // Handle code text
    const codeRegex = /`(.+?)`/g;
    text = text.replace(codeRegex, '{cyan-fg}$1{/cyan-fg}');

    return text;
}
