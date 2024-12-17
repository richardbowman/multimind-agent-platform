# AI Research Assistant Platform

A sophisticated platform that combines web scraping, AI-powered research, and content management capabilities through a Mattermost-based chat interface.

## Features

- **Web Research Automation**
  - Automated web scraping with Puppeteer
  - Smart content summarization
  - Semantic search using ChromaDB for stored research
  - Configurable search depth and limits

- **Content Development**
  - Blog post outline generation
  - Content structure recommendations
  - Iterative outline revision
  - Section-by-section content development

- **Project Management**
  - Task decomposition and distribution
  - Multi-agent collaboration
  - Progress tracking
  - Artifact management and storage

- **Email Draft Assistance**
  - Email draft generation
  - Iterative refinement based on feedback
  - Copy-editing capabilities

## System Architecture

### Core Components

1. **Agent System**
   - Research Manager
   - Content Manager
   - Project Manager
   - Custom workflow engine

2. **Services**
   - ChromaDB for vector storage
   - LLM integration (supports multiple models)
   - Mattermost client for chat interface

3. **Helpers**
   - ScrapeHelper for web content extraction
   - SummaryHelper for content summarization
   - SystemPromptBuilder for LLM interactions

## Setup

### Prerequisites

- Node.js
- Mattermost server (for chat interface)
- ChromaDB instance
- Access to LLM API (supports multiple models)

### Environment Configuration

Create a `.env` file based on `env.defaults`:

```env
CHROMA_COLLECTION=webpage_scrapes
MAX_SEARCHES=1
MAX_FOLLOWS=0
MAX_RESEARCH_REQUESTS=1
EMBEDDING_MODEL=text-embedding-nomic-embed-text-v1.5
CHAT_MODEL=qwen2.5-coder-14b-instruct
CONTEXT_SIZE=16384
```

### Installation

1. Clone the repository:
```bash
git clone [repository-url]
```

2. Install dependencies:
```bash
npm install
```

3. Configure your environment variables

4. Start the service:
```bash
npm start
```

## Usage

### Chat Commands

- Start new conversations with `/new`
- Request research with natural language queries
- Generate content outlines
- Request email drafts
- Manage projects and tasks through chat interface

### Project Workflows

1. **Research Workflow**
   - Submit research request
   - Automated web scraping
   - Content summarization
   - Final report generation

2. **Content Development Workflow**
   - Submit content request
   - Outline generation
   - Revision and refinement
   - Section development

3. **Email Drafting Workflow**
   - Submit draft request
   - Initial draft generation
   - Iterative refinement

## Development

### Creating a StepBasedAgent

The `StepBasedAgent` class provides a framework for creating agents that break down complex tasks into discrete steps. Here's how to structure one:

1. **Create Step Executors**
   - Implement the `StepExecutor` interface for each step type
   - Each executor should handle one specific type of task
   - Example types: thinking, research, validation, etc.

```typescript
export class ThinkingExecutor implements StepExecutor {
    async execute(goal: string, step: string, projectId: string): Promise<StepResult> {
        // Implementation
    }
}
```

2. **Register Executors**
   - In your agent constructor, register each executor:
```typescript
constructor() {
    super();
    this.registerStepExecutor('thinking', new ThinkingExecutor());
    this.registerStepExecutor('validation', new ValidationExecutor());
}
```

3. **Define Purpose**
   - Set your agent's purpose using `setPurpose()`
   - This guides the step planning process
```typescript
this.setPurpose(`You are an agent that...`);
```

4. **Handle Activities**
   - Use `@HandleActivity` decorators to process different types of interactions
   - Common patterns:
     - `start-thread`: Initial conversation
     - `response`: Follow-up messages
```typescript
@HandleActivity("start-thread", "Start conversation", ResponseType.CHANNEL)
protected async handleConversation(params: HandlerParams): Promise<void> {
    // Implementation
}
```

5. **Workflow**
   - The agent automatically:
     - Plans steps using registered executors
     - Executes steps in sequence
     - Validates results
     - Plans additional steps if needed
   - Override methods like `planSteps()` or `executeStep()` for custom behavior

6. **Best Practices**
   - Always include validation steps
   - Use logging to track execution flow
   - Handle user input appropriately
   - Structure steps from simple to complex
   - Consider dependencies between steps

### Project Structure

- `/src`
  - `/agents` - Agent implementations
  - `/llm` - LLM service integrations
  - `/helpers` - Utility classes
  - `/workflows` - Custom workflow definitions

### Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## Development with LLMs
```
aider --model bedrock/us.anthropic.claude-3-5-haiku-20241022-v1:0 --weak-model us.anthropic.claude-3-5-haiku-20241022-v1:0
```

## License

[Your License Here]

## Support

[Your Support Information Here]
