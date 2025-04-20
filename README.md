# multimind-agent-platform

## About the project

Hi, I wanted to share a project I've been working on for the last couple of months (I lovingly refer to it as my Frankenstein). My starting goal was to replace tools like Ollama, LM Studio, and Open Web UI with a simpler experience. It actually started as a terminal UI. Primarily, I was frustrated trying to keep so many various Docker containers synced and working together across my couple of workstations. My app, MutliMind, accomplishes that by integrating LanceDB for Vector storage, LlamaCPP for model execution (in addition to Anthropic, Open AI, OpenRouter) into a single installable executable. It also embeds Whisper for STT and Piper for TTS for fully local voice communication.

It has evolved into offering agentic workflows, primarily focused around document creation, web-based research, early scientific research (using PubMed), and the ability to perform bulk operations against tables of data. It doesn't require any other tools (it can use Brave Search API but default is to scrape Duck Duck Go results). It has built-in generation and rendering of CSV spreadsheets, Markdown documents, Mermaid diagrams, and RevealJS presentations. It has a limited code generation ability - ability to run JavaScript functions which can be useful for things like filtering a CSV doc, and a built-in website generator. The built-in RAG is also used to train the models on how to be successful using the tools to achieve various activities.

It's in early stages still, and because of its evolution to support agentic workflows, it works better with at least mid-sized models (Gemma 27b works well). Also, it has had little testing outside of my personal use.

But, I'd love feedback and alpha testers. It includes a very simple license that makes it free for personal use, and there is no telemetry - it runs 100% locally except for calling 3rd-party cloud services if you configure those. The download should be signed for Windows, and I'll get signing working for Mac soon too.

## Getting started:

You can download a build for Windows or Mac from https://www.multimind.app/ (if there is interest in Linux builds I'll create those too). [I don't have access to a modern Mac - but prior builds have worked for folks].

The easiest way is to provide an Open Router key in the pre-provided Open Router Provider entry by clicking Edit on it and entering the key. For embeddings, the system defaults to downloading Nomic Embed Text v1.5 and running it locally using Llama CPP (Vulkan/CUDA/Metal accelerated if available).

When it is first loading, it will need to process for a while to create all of the initial knowledge and agent embedding configurations in the database. When this completes, the other tabs should enable and allow you to begin interacting with the agents.

The app is defaulted to using Gemini Flash for the default model. If you want to go local, Llama CPP is already configured, so if you want to add a Conversation-type model configuration (choosing llama_cpp as the provider), you can search for available models to download via Hugging Face.

Speech: you can initiate press-to-talk by pressing Ctrl-Space in a channel. It should wait for silence and then process.

## Support and Feedback:

You can track me down on Discord: https://discord.com/invite/QssYuAkfkB

The documentation is very rough and out-of-date, but would love early feedback and use cases that would be great if it could solve:  https://multimind.app/


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

AGPL3
