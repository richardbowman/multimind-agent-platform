# multimind-agent-platform

View the documentation site https://multimind.app/ to get started.

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

### Initial Configuration

1. Start the application
2. Open the Settings panel
3. Configure your preferred:
   - LLM provider and model
   - Vector database settings
   - Search and research limits
   - API keys for cloud services
4. Save settings - they will persist across sessions

### Installation

1. Clone the repository:
```bash
git clone [repository-url]
```

2. Install dependencies:
```bash
yarn
```

3. Configure your environment variables

4. Start the service:
```bash
yarn start
```

## Documentation

The full user manual is available in the [docs/manual](docs/manual) directory:

- [Introduction](docs/manual/01-introduction.md) - Overview of the platform
- [Core Concepts](docs/manual/02-core-concepts.md) - Key components and terminology
- [Getting Started](docs/manual/03-getting-started.md) - Installation and initial setup
- [Agent Capabilities](docs/manual/04-agent-capabilities.md) - Detailed guide to each agent's features
- [Chat Usage](docs/manual/05-chat-usage.md) - How to effectively communicate with agents
- [Artifacts](docs/manual/06-artifacts.md) - Managing generated content and outputs
- [Configurable Agents](docs/manual/07-configurable-agents.md) - Defining and customizing agents

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

## License

MIT
