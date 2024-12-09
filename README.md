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

[Your License Here]

## Support

[Your Support Information Here]