# LLM Schema and Structured Output Guide

This document explains how to use the schema generator and StructuredOutput patterns with LLMs in this codebase.

## Schema Definition Pattern


1. Create a new schema file in `src/schemas/`:
   * Name: `<Purpose>Response.ts`
   * Export an interface describing the response structure
   * Add JSDoc comments for all properties
   * Add to `SchemaType` enum in `SchemaTypes.ts`

Example schema file:

```typescript
export interface ExampleResponse {
    /**
     * Description of what this property contains
     */
    propertyName: string;
    
    /**
     * Array of relevant items
     */
    items: Array<{
        id: string;
        value: number;
    }>;
}
```

## Schema Usage Pattern


1. Get schema with `getGeneratedSchema()`:

```typescript
const schema = await getGeneratedSchema(SchemaType.ExampleResponse);
```


2. Create StructuredOutputPrompt:

```typescript
const systemPrompt = `You are an assistant that...`;
const instructions = new StructuredOutputPrompt(schema, systemPrompt);
```


3. Generate response with modelHelpers:

```typescript
const response = await this.modelHelpers.generate<ExampleResponse>({
    message: userInput,
    instructions
});
```

## Best Practices

### Schema Design

* Use descriptive property names
* Add JSDoc comments for all properties
* Use proper TypeScript types
* Include examples in comments when helpful
* Mark optional properties with `?`
* Use arrays for multiple items
* Use nested objects for complex structures

### Prompt Design

* Clearly explain the task in system prompt
* Include examples when helpful
* Specify required format in system prompt
* Use schema properties in prompt instructions
* Handle edge cases in prompt

### Error Handling

* Validate responses match schema
* Handle malformed responses gracefully
* Log schema validation errors
* Provide fallback behavior
* Track token usage

## Example Workflow


1. Define schema:

```typescript
// src/schemas/ExampleResponse.ts
export interface ExampleResponse {
    /**
     * Array of example items
     */
    items: Array<{
        id: string;
        value: number;
    }>;
}
```


2. Add to SchemaTypes:

```typescript
// src/schemas/SchemaTypes.ts
export enum SchemaType {
    // ...
    ExampleResponse = 'ExampleResponse'
}
```


3. Use in executor:

```typescript
const schema = await getGeneratedSchema(SchemaType.ExampleResponse);

const systemPrompt = `You are an example assistant...`;
const instructions = new StructuredOutputPrompt(schema, systemPrompt);

const response = await this.modelHelpers.generate<ExampleResponse>({
    message: userInput,
    instructions
});

// Validate and use response
if (response.items && Array.isArray(response.items)) {
    // Process items
}
```

## Common Patterns

### Array Responses

Use arrays for multiple items:

```typescript
items: Array<{
    id: string;
    value: number;
}>;
```

### Nested Objects

Use nested objects for complex data:

```typescript
metadata: {
    source: string;
    timestamp: number;
    tags: string[];
}
```

### Enums

Use string enums for constrained values:

```typescript
status: "pending" | "complete" | "failed";
```

### Optional Properties

Mark optional properties with `?`:

```typescript
optionalField?: string;
```

### Token Tracking

Include token usage metadata:

```typescript
_usage: {
    inputTokens: number;
    outputTokens: number;
}
```


