import JSON5 from 'json5';
import { marked, RendererObject } from 'marked';
import { JSONSchema } from 'openai/lib/jsonschema';
import { LinkRef } from 'src/helpers/scrapeHelper';
import Ajv from "ajv";
import addFormats from "ajv-formats";

export interface CodeBlock {
    readonly type: string;
    readonly attribute?: string;
    readonly code: string;
}

export interface XmlBlock {
    readonly tag: string;
    readonly content: string;
}

export interface Link {
    text: string;
    href: string;
}

export namespace StringUtils {
    export function truncate(string: string, maxLength: number, truncationMsg = (maxLength: number, originalLength: number) => `[Truncated to ${maxLength}. Original length: ${originalLength}`) {
        if (typeof string === "string") {
            const originalLength = string.length;
            return string.substring(0, maxLength) + (originalLength > maxLength ? truncationMsg(maxLength, originalLength) : "");
        } else {
            return string;
        }
    }

    export function extractCodeBlocks(text: string, type?: string): CodeBlock[] {
        const codeBlockRegex = /```([a-zA-Z]+)(?:\[([^\]]+)\])?\n([\s\S]*?)(```|$)/g;
        const matches: CodeBlock[] = [];
        let match: RegExpExecArray | null;

        while ((match = codeBlockRegex.exec(text)) !== null) {
            // If the match ends with the closing ```, use the full match
            // If it ends with $ (end of string), it's an incomplete block
            const isComplete = match[4] === '```';
            const code = isComplete ? match[3].trim() : match[3].trim() + '\n```';

            matches.push({
                type: match[1],
                attribute: match[2],
                code: code
            });
        }

        return type ? matches.filter(m => m.type === type) : matches;
    }

    /**
     * Extracts JSON from code blocks and parses it
     * @param text Input text containing JSON code blocks
     * @returns Array of parsed JSON objects
     * @throws SyntaxError if JSON parsing fails
     */
    export function extractAndParseJsonBlocks(text: string): any[] {
        return extractCodeBlocks(text, 'json').map(m => JSON5.parse(m.code));
    }

    /**
     * Validates a JSON object against a schema using AJV
     * @param json The JSON object to validate
     * @param schema The JSON schema to validate against
     * @throws Error if validation fails
     */
    export function validateJsonAgainstSchema<T>(json: any, schema: JSONSchema): asserts json is T {
        // Initialize JSON schema validator with custom date-time format
        const ajv = new Ajv({
            allErrors: true,
            strict: false,
            formats: {
                'date-time': {
                    validate: (dateTimeStr: string) => {
                        // Try parsing as ISO date string
                        const date = new Date(dateTimeStr);
                        return !isNaN(date.getTime());
                    }
                }
            }
        });
        addFormats(ajv);
        ajv.addFormat("date-time", {
            validate: (dateTimeStr: string) => {
                // Try parsing as ISO date string
                const date = new Date(dateTimeStr);
                return !isNaN(date.getTime());
            }
        });
        const validate = ajv.compile(schema);
        // Validate response against schema
        const isValid = validate(json);
        if (!isValid) {
            const errors = validate.errors?.map(err =>
                `Schema validation error at ${err.instancePath}: ${err.message}`
            ).join('\n');
            throw new Error(`Response does not conform to schema:\n${errors}`);
        }
    }

    /**
     * Extracts first JSON from code blocks and optionally parses it against a schema
     * @param text Input text containing JSON code blocks
     * @returns Array of parsed JSON objects
     * @throws SyntaxError if JSON parsing fails
     */
    /**
     * Checks if the text contains a valid JSON code block
     * @param text Input text to check
     * @returns true if text contains a valid JSON code block, false otherwise
     */
    export function hasJsonBlock(text: string): boolean {
        try {
            const blocks = extractCodeBlocks(text, 'json');
            if (blocks.length === 0) return false;
            // Try parsing the first block to validate it's JSON
            JSON5.parse(blocks[0].code);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Extracts first JSON from code blocks and optionally parses it against a schema
     * @param text Input text containing JSON code blocks
     * @returns Array of parsed JSON objects
     * @throws SyntaxError if JSON parsing fails
     */
    /**
     * Maps a JSON object to a typed object after validating against a schema
     * @param json The JSON object to map
     * @param schema The JSON schema to validate against
     * @returns The typed object if validation succeeds
     * @throws Error if validation fails
     */
    export function mapToTyped<T>(json: any, schema: JSONSchema): T {
        validateJsonAgainstSchema<T>(json, schema);
        return json as T;
    }

    export function extractAndParseJsonBlock<T extends Object>(text: string, schema?: JSONSchema): T {
        if (!hasJsonBlock(text)) {
            throw new Error("No JSON blocks found in response");
        }
        
        const blocks = extractCodeBlocks(text, 'json').map(m => JSON5.parse(m.code));
        if (blocks.length == 1) {
            if (schema) {
                validateJsonAgainstSchema(blocks[0], schema);
            }
            return blocks[0];
        } else {
            throw new Error("No JSON blocks found in response");
        }
    }

    /**
     * Extracts text content that is not within code blocks
     * @param text Input text containing code blocks
     * @returns String with all content outside of code blocks
     */
    /**
     * Extracts XML blocks from text
     * @param text Input text containing XML blocks
     * @returns Array of XML blocks with tag and content
     */
    export function extractXmlBlocks(text: string): XmlBlock[] {
        const xmlBlockRegex = /<([a-zA-Z]+)[^>]*>([\s\S]*?)<\/\1>/g;
        const matches: XmlBlock[] = [];
        let match: RegExpExecArray | null;
        const seen = new Set();

        while ((match = xmlBlockRegex.exec(text)) !== null) {
            const tag = match[1];
            let content = match[2].trim();

            // Handle nested tags by recursively extracting inner content
            // First add the outer block
            matches.push({
                tag,
                content
            });

            // Then recursively handle inner blocks
            const innerBlocks = extractXmlBlocks(content);
            for (const inner of innerBlocks) {
                if (!seen.has(inner.tag)) {
                    matches.push(inner);
                    seen.add(inner.tag);
                }
            }
        }
        return matches;
    }

    /**
     * Extracts a specific XML block by tag name
     * @param text Input text containing XML blocks
     * @param tagName The XML tag to search for
     * @returns The content of the first matching XML block or undefined if not found
     */
    export function extractXmlBlock(text: string, tagName: string): string | undefined {
        const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`);
        const match = regex.exec(text);
        return match ? match[1].trim() : undefined;
    }

    /**
     * Extracts text content that is not within code blocks or specified XML blocks
     * @param text Input text containing code blocks and XML blocks
     * @param xmlTagsToRemove Optional array of XML tags to remove from the content
     * @returns String with all content outside of code blocks and specified XML blocks
     */
    export function extractNonCodeContent(text: string, xmlTagsToRemove: string[] = [], codeBlockTypesToRemove: string[] = []): string {
        let cleanedText = text;

        // Remove specified XML blocks if any
        if (xmlTagsToRemove.length > 0) {
            const xmlRegex = new RegExp(`<(${xmlTagsToRemove.join('|')})[^>]*>[\\s\\S]*?<\\/\\1>`, 'g');
            cleanedText = cleanedText.replace(xmlRegex, '');
        }

        // Remove code blocks - all if no types specified, or specific types if provided
        if (codeBlockTypesToRemove.length > 0) {
            // Remove only specified code block types
            const codeBlockRegex = new RegExp(`\`\`\`(${codeBlockTypesToRemove.join('|')})(?:\\[.*?\\])?\\n[\\s\\S]*?\`\`\``, 'g');
            cleanedText = cleanedText.replace(codeBlockRegex, '');
        } else {
            // Remove all code blocks
            const codeBlockRegex = /```[^`]+(?:\[.*?\])?\n[\s\S]*?```/g;
            cleanedText = cleanedText.replace(codeBlockRegex, '');
        }

        // Clean up extra whitespace
        return cleanedText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n')
            .trim();
    }

    /**
     * Truncates text with an ellipsis if it exceeds the specified maxLength
     * @param text Input text to be truncated
     * @param maxLength Maximum length of the text before truncation
     * @returns Truncated text with ellipsis if necessary
     */
    export function truncateWithEllipsis(text: string, maxLength: number, truncateMessage?: string): string {
        if (text?.length > maxLength) {
            return text.substring(0, maxLength - 3) + `...${truncateMessage}`;
        } else {
            return text;
        }
    }

    /**
     * Extracts text from a caption like "Report Title: XXXX"
     * @param text Input text containing the caption
     * @param caption The caption to search for, e.g., "Report Title"
     * @returns The text extracted from the caption or an empty string if not found
     */
    export function extractCaptionedText(text: string, caption: string): string {
        const captionRegex = new RegExp(`${caption}:\\s*(.*?)\\n`);
        const match = captionRegex.exec(text);
        return match ? match[1].trim() : '';
    }

    /**
     * Extracts URLs from a string
     * @param text Input text containing URLs
     * @returns Array of URLs found in the text
     */
    export function extractUrls(text: string): string[] {
        const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
        return text.match(urlRegex) || [];
    }

    /**
     * Extracts links from a Markdown document using the marked parser
     * @param markdown Input Markdown document
     * @returns Array of links found in the Markdown document, each containing text and href
     */
    export function extractLinksFromMarkdown(markdown: string): LinkRef[] {
        const links: LinkRef[] = [];

        const renderer: RendererObject = {
            link(args) {
                const { href, text } = args;
                links.push({ text, href });
                return '';
            }
        };

        marked.use({ renderer });
        marked.parse(markdown);

        return links;
    }

    /**
     * Checks if a string is a valid date
     * @param dateString The string to validate as a date
     * @returns true if the string can be parsed as a valid date, false otherwise
     */
    export function isValidDate(dateString: string): boolean {
        // Try parsing as ISO date first
        const isoDate = Date.parse(dateString);
        if (!isNaN(isoDate)) return true;

        // Try parsing as other common formats
        const formats = [
            'MM/dd/yyyy',
            'dd/MM/yyyy',
            'yyyy-MM-dd',
            'MMMM d, yyyy',
            'MMM d, yyyy'
        ];

        for (const format of formats) {
            const parsedDate = new Date(dateString);
            if (!isNaN(parsedDate.getTime())) {
                return true;
            }
        }

        return false;
    }
}
