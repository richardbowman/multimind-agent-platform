export interface CodeExecutionSchema {
    type: 'object';
    properties: {
        code: {
            type: 'string';
            description: 'The JavaScript code to execute';
        };
        explanation: {
            type: 'string';
            description: 'Explanation of what the code does';
        };
    };
    required: ['code', 'explanation'];
}

export const codeExecutionSchema: CodeExecutionSchema = {
    type: 'object',
    properties: {
        code: {
            type: 'string',
            description: 'The JavaScript code to execute'
        },
        explanation: {
            type: 'string',
            description: 'Explanation of what the code does'
        }
    },
    required: ['code', 'explanation']
};
