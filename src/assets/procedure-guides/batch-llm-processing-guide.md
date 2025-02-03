# Batch LLM Processing Guide for Solver Agent

## Best Practices for Processing Large Datasets with LLM Calls

When performing batch LLM processing on datasets using the Solver agent's NodeExecutorExecutor, follow this workflow:

### 1. Initial Analysis Step
- First create a step to analyze the dataset structure
- Extract headers and row count
- Example code:
```javascript
const { parse } = safeRequire('csv-parse/sync');

// Get first CSV artifact
const csvArtifact = ARTIFACTS.find(a => a.type === 'csv');
if (!csvArtifact) throw new Error('No CSV artifact found');

// Parse headers and count rows
const records = parse(csvArtifact.content, {
    columns: true,
    skip_empty_lines: true,
    bom: true
});

provideResult({
    headers: Object.keys(records[0]),
    totalRows: records.length
});
```

### 2. Batch Processing Strategy
- Divide the dataset into manageable chunks (e.g., 10-20 rows per batch)
- Create separate steps for each batch
- Example batch parameters:
```javascript
{
    batchSize: 10,
    startRow: 0, // First batch starts at 0
    endRow: 9    // First batch ends at 9
}
```

### 3. Batch Processing Code Template
```javascript
const { parse } = safeRequire('csv-parse/sync');

// Get first CSV artifact
const csvArtifact = ARTIFACTS.find(a => a.type === 'csv');
if (!csvArtifact) throw new Error('No CSV artifact found');

// Parse only the batch range
const records = parse(csvArtifact.content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    from: params.startRow,
    to: params.endRow
});

// Process each record with LLM
const results = [];
for (const record of records) {
    const analysis = await generate(
        `Analyze this record: ${JSON.stringify(record)}`,
        `Perform ${params.analysisType} analysis`
    );
    results.push({
        ...record,
        analysis
    });
}

// Append results to output artifact
const outputArtifact = ARTIFACTS.find(a => a.id === params.outputArtifactId);
if (!outputArtifact) throw new Error('Output artifact not found');

const existingData = JSON.parse(outputArtifact.content || '[]');
const updatedData = [...existingData, ...results];

ARTIFACTS.push({
    id: params.outputArtifactId,
    type: 'data',
    content: JSON.stringify(updatedData),
    metadata: {
        title: 'Processed Analysis Results',
        description: 'Batch processed LLM analysis'
    }
});

provideResult({
    processedRows: results.length
});
```

### 4. Result Aggregation
- Create an initial empty result artifact
- Each batch appends its results to this artifact
- Example result artifact creation:
```javascript
ARTIFACTS.push({
    type: 'data',
    content: '[]', // Start with empty array
    metadata: {
        title: 'LLM Analysis Results',
        description: 'Aggregated results from batch processing'
    }
});
```

### 5. Error Handling
- Implement retry logic for failed batches
- Validate data consistency between batches
- Example error handling:
```javascript
try {
    // Batch processing code
} catch (error) {
    console.error(`Batch processing failed: ${error.message}`);
    provideResult({
        error: error.message,
        failedBatch: {
            startRow: params.startRow,
            endRow: params.endRow
        }
    });
}
```

### 6. Performance Considerations
- Keep batch sizes small (10-20 rows)
- Monitor execution time
- Use parallel processing when possible
- Example parallel batch configuration:
```javascript
{
    batchSize: 10,
    parallelBatches: 3 // Process 3 batches simultaneously
}
```

### 7. Final Aggregation Step
- After all batches complete, create a final step to:
  - Validate all rows were processed
  - Generate summary statistics
  - Format final output
- Example final step:
```javascript
const outputArtifact = ARTIFACTS.find(a => a.id === params.outputArtifactId);
if (!outputArtifact) throw new Error('Output artifact not found');

const results = JSON.parse(outputArtifact.content);

provideResult({
    totalProcessed: results.length,
    summary: {
        // Generate summary statistics
    }
});
```

### 8. Common Analysis Types
- Sentiment analysis
- Categorization
- Entity extraction
- Data enrichment
- Text summarization

Remember to:
- Keep batch sizes within time limits
- Validate data consistency
- Handle errors gracefully
- Monitor resource usage
