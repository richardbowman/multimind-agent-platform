# Configurable Agents

The platform provides a flexible system for creating and configuring agents to handle specific tasks. This guide covers how to define and customize agents.

## Predefined Agents

The system comes with several preconfigured agents:

### Core Agents
- **Research Assistant**: Conducts web research and information gathering
- **Research Manager**: Manages and coordinates research activities
- **Content Manager**: Manages content creation and organization
- **Content Writer**: Writes and generates content
- **Project Manager**: Manages projects and coordinates tasks
- **Onboarding Consultant**: Handles user onboarding processes
- **Solver Agent**: Solves problems and provides solutions

## Agent Configuration

Each agent in `agents.json` has these properties:

```json
{
    "className": "AgentClassName",
    "sourcePath": "../agents/agentPath",
    "userId": "unique-agent-id",
    "handle": "@agentname",
    "description": "Agent purpose and capabilities",
    "enabled": true,
    "config": {
        // Agent-specific configuration
    }
}
```

## Creating New Agents

1. **Define the Agent Class**
   - Extend `ConfigurableAgent` or `StepBasedAgent`
   - Implement required methods
   - Add custom behavior

```typescript
export class MyCustomAgent extends ConfigurableAgent {
    constructor(params: AgentConstructorParams) {
        super(params);
        this.setPurpose('My agent purpose');
    }

    protected async initializeFromConfig(config: any) {
        // Initialize from configuration
    }
}
```

2. **Add to agents.json**
   - Create new entry with unique ID
   - Set source path to agent file
   - Define configuration options

```json
"MyCustomAgent": {
    "className": "MyCustomAgent",
    "sourcePath": "../agents/myCustomAgent",
    "userId": "unique-id",
    "handle": "@custom",
    "description": "Handles custom tasks",
    "enabled": true,
    "config": {
        "option1": "value1",
        "option2": "value2"
    }
}
```

3. **Configure Default Channels**
   - Add channel mapping in `defaultChannels`
   - Specify which channel the agent should monitor

```json
"defaultChannels": {
    "custom": "channel-id"
}
```

## Agent Configuration Options

Common configuration options include:

- **maxSearches**: Maximum web searches per request
- **maxDepth**: Maximum search depth
- **timeout**: Request timeout in milliseconds
- **model**: LLM model to use
- **temperature**: LLM temperature setting

## Best Practices

1. **Clear Purpose**
   - Define a specific purpose for each agent
   - Avoid overlapping responsibilities

2. **Modular Design**
   - Break complex tasks into smaller steps
   - Use step executors for reusable components

3. **Configuration**
   - Make frequently changed settings configurable
   - Provide sensible defaults
   - Validate configuration values

4. **Error Handling**
   - Implement robust error handling
   - Provide meaningful error messages
   - Include fallback behaviors

## Example Workflow

1. Define agent class:
```typescript
export class DataAnalyzer extends ConfigurableAgent {
    constructor(params: AgentConstructorParams) {
        super(params);
        this.setPurpose('Analyze and visualize data');
    }
}
```

2. Add to agents.json:
```json
"DataAnalyzer": {
    "className": "DataAnalyzer",
    "sourcePath": "../agents/dataAnalyzer",
    "userId": "data-analyzer-id",
    "handle": "@analyzer",
    "description": "Analyzes and visualizes data",
    "enabled": true,
    "config": {
        "maxRows": 1000,
        "chartTypes": ["bar", "line", "pie"]
    }
}
```

3. Configure default channel:
```json
"defaultChannels": {
    "analysis": "channel-id-for-analysis"
}
```

4. Use in conversations:
```
[You] @analyzer Can you visualize this data?
[DataAnalyzer] Sure! What type of chart would you like?
```
