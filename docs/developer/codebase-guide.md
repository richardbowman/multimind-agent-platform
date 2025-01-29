# Codebase Development Guide

This document outlines the patterns and conventions to follow when working with this codebase.

## Schema Patterns

### Schema Definitions


1. All schemas must be defined in `src/schemas/` directory
2. Each schema should have:
   * A TypeScript interface
   * Added to `SchemaType` enum in `SchemaTypes.ts`
3. Schema files should:
   * Be named `<SchemaName>Response.ts` for response types
   * Export both interface and schema (if needed)
   * Include JSDoc comments for all properties

Example schema file:

```typescript
export interface ExampleResponse {
    /**
     * Description of property
     */
    property: string;
}
```

### Schema Usage


1. Always use `getGeneratedSchema()` to get schema definitions
2. Use `StructuredOutputPrompt` for LLM requests
3. Schema types should match the response interface

## Executor Patterns

### Executor Structure


1. Must implement `StepExecutor` interface
2. Use `@StepExecutorDecorator` for registration
3. Follow dependency injection pattern in constructor
4. Use `modelHelpers.generate()` for LLM interactions

### Common Patterns


1. URL handling:
   * Use `scrapeHelper.normalizeUrl()`
   * Track visited URLs with Set
   * Validate URLs with `new URL()`
2. Artifact management:
   * Use `artifactManager.saveArtifact()`
   * Include metadata with:
     * URL
     * Task/step
     * Project ID
     * Token usage
3. Error handling:
   * Use Logger.error()
   * Return meaningful error responses
   * Catch and handle specific errors

## Testing Guidelines


1. Tests should:
   * Mock external dependencies
   * Test error cases
   * Verify schema usage
   * Check token tracking
2. Use Jest for testing
3. Follow Arrange-Act-Assert pattern

## Documentation Standards


1. Add JSDoc comments for:
   * All public methods
   * Interface properties
   * Complex logic
2. Use markdown format for documentation
3. Keep documentation in `/docs` folder
4. Update documentation with changes

## Code Style


1. Follow TypeScript best practices
2. Use async/await for promises
3. Prefer functional patterns over imperative
4. Keep methods focused and small
5. Use descriptive variable names
6. Follow existing code style and patterns

```

This guide documents the key patterns and conventions used in the codebase. Let me know if you'd like me to add any additional sections or details!
```


