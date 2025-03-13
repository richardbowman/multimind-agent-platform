import { StringUtils } from 'src/utils/StringUtils';

describe('StringUtils', () => {
    describe('extractXmlBlocks', () => {
        it('should extract all XML blocks', () => {
            const text = `
                <thinking>This is a thought</thinking>
                <analysis>Some analysis here</analysis>
                <thinking>Another thought</thinking>
            `;
            const result = StringUtils.extractXmlBlocks(text);
            expect(result).toEqual([
                { tag: 'thinking', content: 'This is a thought' },
                { tag: 'analysis', content: 'Some analysis here' },
                { tag: 'thinking', content: 'Another thought' }
            ]);
        });

        it('should handle nested XML blocks', () => {
            const text = `
                <outer>
                    <inner>Nested content</inner>
                </outer>
            `;
            const result = StringUtils.extractXmlBlocks(text);
            expect(result).toEqual([
                { tag: 'outer', content: '<inner>Nested content</inner>' },
                { tag: 'inner', content: 'Nested content' }
            ]);
        });

        it('should return empty array when no XML blocks found', () => {
            const text = 'Just plain text without XML tags';
            const result = StringUtils.extractXmlBlocks(text);
            expect(result).toEqual([]);
        });
    });

    describe('extractXmlBlock', () => {
        it('should extract specific XML block content', () => {
            const text = `
                <thinking>First thought</thinking>
                <analysis>Some analysis</analysis>
                <thinking>Second thought</thinking>
            `;
            const result = StringUtils.extractXmlBlock(text, 'thinking');
            expect(result).toBe('First thought');
        });

        it('should return undefined when specific tag not found', () => {
            const text = '<analysis>Some analysis</analysis>';
            const result = StringUtils.extractXmlBlock(text, 'thinking');
            expect(result).toBeUndefined();
        });
    });

    describe('extractNonCodeContent', () => {
        it('should remove code blocks', () => {
            const text = `
                Some text
                \`\`\`js
                const code = true;
                \`\`\`
                More text
            `;
            const result = StringUtils.extractNonCodeContent(text);
            expect(result).toBe('Some text\nMore text');
        });

        it('should remove specified XML blocks', () => {
            const text = `
                Intro
                <thinking>Thought</thinking>
                Middle
                <analysis>Analysis</analysis>
                Outro
            `;
            const result = StringUtils.extractNonCodeContent(text, ['thinking', 'analysis']);
            expect(result).toBe('Intro\nMiddle\nOutro');
        });

        it('should handle both code and XML blocks', () => {
            const text = `
                Start
                \`\`\`js
                const code = true;
                \`\`\`
                <thinking>Thought</thinking>
                End
            `;
            const result = StringUtils.extractNonCodeContent(text, ['thinking']);
            expect(result).toBe('Start\nEnd');
        });

        it('should remove specified code block types', () => {
            const text = `
                Start
                \`\`\`js
                const code = true;
                \`\`\`
                \`\`\`json
                {"key": "value"}
                \`\`\`
                End
            `;
            const result = StringUtils.extractNonCodeContent(text, [], ['json']);
            expect(result).toBe('Start\nEnd');
        });

        it('should remove both specified code block types and XML blocks', () => {
            const text = `
                Start
                \`\`\`js
                const code = true;
                \`\`\`
                \`\`\`json
                {"key": "value"}
                \`\`\`
                <thinking>Thought</thinking>
                End
            `;
            const result = StringUtils.extractNonCodeContent(text, ['thinking'], ['json']);
            expect(result).toBe('Start\nEnd');
        });

        it('should return original text when no blocks to remove', () => {
            const text = 'Just plain text';
            const result = StringUtils.extractNonCodeContent(text);
            expect(result).toBe('Just plain text');
        });
    });

    describe('extractCodeBlocks', () => {
        it('should extract all code blocks', () => {
            const text = `
                \`\`\`js
                const a = 1;
                \`\`\`
                \`\`\`python
                b = 2
                \`\`\`
            `;
            const result = StringUtils.extractCodeBlocks(text);
            expect(result).toEqual([
                { type: 'js', code: 'const a = 1;', attribute: undefined },
                { type: 'python', code: 'b = 2', attribute: undefined }
            ]);
        });

        it('should extract code blocks with attributes', () => {
            const text = `
                \`\`\`js[main.js]
                const a = 1;
                \`\`\`
            `;
            const result = StringUtils.extractCodeBlocks(text);
            expect(result).toEqual([
                { type: 'js', code: 'const a = 1;', attribute: 'main.js' }
            ]);
        });
    });

    describe('hasJsonBlock', () => {
        it('should return true when valid JSON block exists', () => {
            const text = `
                \`\`\`json
                {"key": "value"}
                \`\`\`
            `;
            expect(StringUtils.hasJsonBlock(text)).toBe(true);
        });

        it('should return false when no JSON block exists', () => {
            const text = 'Just plain text';
            expect(StringUtils.hasJsonBlock(text)).toBe(false);
        });

        it('should return false when invalid JSON exists in block', () => {
            const text = `
                \`\`\`json
                {invalid: json}
                \`\`\`
            `;
            expect(StringUtils.hasJsonBlock(text)).toBe(false);
        });
    });

    describe('extractAndParseJsonBlocks', () => {
        it('should extract and parse JSON blocks', () => {
            const text = `
                \`\`\`json
                {"key": "value"}
                \`\`\`
            `;
            const result = StringUtils.extractAndParseJsonBlocks(text);
            expect(result).toEqual([{ key: 'value' }]);
        });

        it('should handle multiple JSON blocks', () => {
            const text = `
                \`\`\`json
                {"a": 1}
                \`\`\`
                \`\`\`json
                {"b": 2}
                \`\`\`
            `;
            const result = StringUtils.extractAndParseJsonBlocks(text);
            expect(result).toEqual([{ a: 1 }, { b: 2 }]);
        });
    });

    describe('truncate', () => {
        it('should truncate long strings', () => {
            const text = 'This is a long string';
            const result = StringUtils.truncate(text, 10);
            expect(result).toMatch(/\[Truncated to 10/);
        });

        it('should not truncate short strings', () => {
            const text = 'Short';
            const result = StringUtils.truncate(text, 10);
            expect(result).toBe('Short');
        });
    });

    describe('extractUrls', () => {
        it('should extract URLs from text', () => {
            const text = 'Visit https://example.com and http://test.com';
            const result = StringUtils.extractUrls(text);
            expect(result).toEqual(['https://example.com', 'http://test.com']);
        });

        it('should return empty array when no URLs found', () => {
            const text = 'No URLs here';
            const result = StringUtils.extractUrls(text);
            expect(result).toEqual([]);
        });
    });
});
