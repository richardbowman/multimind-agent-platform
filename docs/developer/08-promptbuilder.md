# PromptBuilder Guide

The PromptBuilder provides a structured way to construct LLM prompts with consistent formatting and content organization. It handles content rendering, instruction management, and context tracking.

## Key Features

- **Content Type System**: Predefined content types for common prompt elements
- **Custom Renderers**: Add your own content renderers for specific needs
- **Instruction Management**: Easily add and organize instructions
- **Context Tracking**: Maintain conversation and execution context
- **Step Result Handling**: Specialized rendering for different step types

## Basic Usage

1. Create a new PromptBuilder instance:
```typescript
const promptBuilder = new PromptBuilder();
```

2. Add content using predefined content types:
```typescript
promptBuilder.addContent(ContentType.ARTIFACTS, artifacts);
promptBuilder.addContent(ContentType.CONVERSATION, chatPosts);
```

3. Add instructions and context:
```typescript
promptBuilder.addInstruction("You are a helpful assistant");
promptBuilder.addContext("Current date: 2025-01-23");
```

4. Build the final prompt:
```typescript
const prompt = promptBuilder.build();
```

## Content Types

The system provides these standard content types:

| Type            | Description                          |
|-----------------|--------------------------------------|
| ARTIFACTS       | Attached files or data artifacts     |
| CONVERSATION    | Chat history and context             |
| SEARCH_RESULTS  | Web search or database query results |
| CODE            | Source code snippets                 |
| DOCUMENTS       | Long-form text documents             |
| TASKS           | Task lists and project details       |
| GOALS           | Project goals and objectives         |
| STEP_RESULTS    | Previous step execution results      |
| EXECUTE_PARAMS  | Current execution parameters         |

## Custom Renderers

You can add custom content renderers for specific needs:

```typescript
promptBuilder.registerRenderer(ContentType.CUSTOM_TYPE, (content) => {
  return `Custom Content:\n${JSON.stringify(content)}`;
});
```

## Step Result Handling

The PromptBuilder includes special handling for different step types:

```typescript
// Register a custom step result renderer
promptBuilder.registerStepResultRenderer(
  StepResultType.Validation,
  (step) => `Validation Result: ${step.response?.message}`
);

// Add step results
promptBuilder.addContent(ContentType.STEP_RESULTS, steps);
```

## Best Practices

1. **Organize Content**: Use appropriate content types to keep prompts structured
2. **Reuse Renderers**: Create reusable renderers for common content formats
3. **Maintain Context**: Add relevant execution context to each prompt
4. **Use Instructions**: Clearly define the LLM's role and constraints
5. **Validate Outputs**: Test rendered prompts to ensure proper formatting

## Example Usage

Here's a complete example showing how to build a validation prompt:

```typescript
const promptBuilder = new PromptBuilder();

// Add core instructions
promptBuilder.addInstruction("You are validating whether a proposed solution addresses the original goal");

// Add execution parameters
promptBuilder.addContent(ContentType.EXECUTE_PARAMS, params);

// Add previous results
promptBuilder.addContent(ContentType.STEP_RESULTS, steps);

// Add evaluation guidelines
promptBuilder.addInstruction(`Evaluation Guidelines:
1. Consider if the solution makes reasonable progress
2. Allow for iterative improvement
3. Focus on critical issues`);

// Build the final prompt
const prompt = promptBuilder.build();
```

This will generate a well-structured prompt with clear sections and consistent formatting.
