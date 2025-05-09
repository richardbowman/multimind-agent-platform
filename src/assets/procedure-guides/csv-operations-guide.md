---
title: "CSV Operations Guide"
description: "Best practices and examples for working with CSV files in the Solver agent's NodeExecutorExecutor"
created: "2025-02-04T00:00:00.000Z"
tags:
  - "CSV"
  - "data processing"
  - "NodeExecutorExecutor"
  - "Solver agent"
  - "data validation"
author: "Solver Agent Team"
version: "1.0.0"
relatedGuides:
  - "batch-llm-processing-guide.md"
  - "data-validation-guide.md"
---

# CSV Operations Guide for Solver Agent

## Best Practices for Working with CSV Files in NodeExecutorExecutor

When processing CSV files using the Solver agent's NodeExecutorExecutor, follow these steps:

### 1. Solver Agent Order of Operations
- Always start with an initial code step where the only goal is to print the headers and first few rows to understand the data format
- Use the following code to extract headers and sample rows:
```javascript
const { parse } = safeRequire('csv-parse/sync');

function getSampleData(csvContent, sampleRows = 2) {
    const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true,
        bom: true
    });
    
    const headers = Object.keys(records[0]);
    const sample = records.slice(0, sampleRows);
    
    return {
        headers,
        sample
    };
}

const csvArtifact = ARTIFACTS.find(a => a.type === 'csv');
if (!csvArtifact) throw new Error('No CSV artifact found');

const { headers, sample } = getSampleData(csvArtifact.content);

provideResult(`The file contains the following headers:\n${headers.join('\n')}\n\nSample rows:\n${JSON.stringify(sample, null, 2)}`);
```

### 2. Handle BOM (Byte Order Mark)
- Always set `bom: true` when parsing CSV files
- Use the following configuration:
```javascript
const records = parse(csvContent, {
    bom: true,
    // other options...
});
```

### 3. Data Validation
- Check for empty rows and columns
- Validate data types for each column
- Handle missing values appropriately

### 4. Error Handling
- Implement try-catch blocks for CSV operations
- Validate CSV content before processing
- Handle encoding errors gracefully

### 5. Performance Considerations
- Process data in chunks when possible
- Use streaming for large files (when available)
- Monitor memory usage

### 6. Common Pitfalls
- Forgetting to handle BOM characters
- Not checking for empty files
- Ignoring encoding issues
- Not validating column counts

### 7. NodeExecutorExecutor Specific Notes
- Access CSV files through the ARTIFACTS global variable
- Create new artifacts for processed data:
```javascript
ARTIFACTS.push({
    type: 'csv',
    content: processedData,
    metadata: {
        title: 'Processed CSV Data',
        description: 'Generated from analysis'
    }
});
```

### 8. Charting Example
```javascript
// Create a chart from processed data
const { ChartJSNodeCanvas } = safeRequire('chartjs-node-canvas');
const Chart = safeRequire('chart.js/auto');

const width = 800;
const height = 600;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

const chartConfig = {
    type: 'bar',
    data: {
        labels: processedData.map(d => d.label),
        datasets: [{
            label: 'My Dataset',
            data: processedData.map(d => d.value),
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1
        }]
    },
    options: {
        scales: {
            y: {
                beginAtZero: true
            }
        }
    }
};

const imageBuffer = await chartJSNodeCanvas.renderToBuffer(chartConfig);

// Save chart as image artifact
ARTIFACTS.push({
    type: 'image',
    content: imageBuffer,
    metadata: {
        title: 'Data Visualization Chart',
        description: 'Generated chart from processed data',
        mimeType: 'image/png'
    }
});
```

### 9. Example Workflow
```javascript
// Get first CSV artifact
const csvArtifact = ARTIFACTS.find(a => a.type === 'csv');
if (!csvArtifact) throw new Error('No CSV artifact found');

// Parse CSV content
const records = parse(csvArtifact.content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true
});

// Process data
const processedData = records.map(record => ({
    ...record,
    processedField: someProcessingFunction(record.someField)
}));

// Save processed data as new artifact
ARTIFACTS.push({
    type: 'csv',
    content: stringify(processedData, { header: true }),
    metadata: {
        title: 'Processed CSV Data',
        description: 'Generated from analysis'
    }
});

// Return summary
provideResult({
    recordCount: records.length,
    processedCount: processedData.length
});
```

Remember to always test your CSV processing code with various file formats and edge cases.
