# MultiMind Introduction

## Overview
I designed Multimind to be easier to install and manage than Open WebUI, and more capable than LM Studio. The idea is that the app is well-packaged and easy to deploy with support for:
- integrated organizational tools for agents to use (chat messaging, tasks, and artifacts \[documents\])
- supports cloud-hosted and local models
- local STT and TTS (via whisper and piper).
- built-in vector database for RAG, and local embedding support via Llama CPP.

## Key Features

- **Conversational Interface**: Interact through chat messages
- **Task Management**: Agents use task management to structure their multi-step workflows.
- **Document Generation**: Agents can create structured documents such as spreadsheets, diagrams, and Markdown documents.
- **Research Capabilities**: Web search and content summarization via embedded browser
- **Configuration-driven agents**: An agent builder allows customization or creation of new agents using their access to composable steps. 

## Recommended Models
For best results, we recommend using one of these high-quality language models:

- **OpenAI GPT-4o** (via OpenAI API)
- **Anthropic Claude 3.5 Sonnet** (via Anthropic API)
- **DeepSeek V3** (via DeepSeek API)
- **Qwen 2.5 72B Instruct** (qwen/qwen-2.5-72b-instruct, available via OpenRouter)
- **NVIDIA Nemotron 70B Instruct** (nvidia/llama-3.1-nemotron-70b-instruct, available via OpenRouter)

## System Requirements

- **Operating System**: Windows 11, Mac OS X Sonoma, or a Linux distribution capable of running AppImage packaged applications
- **Supported LLM provider**:
  - **Cloud providers**: Open Router, Anthropic, OpenAI, AWS Bedrock
  - **Local providers**: LM Studio, Embedded Local Llama.CPP
- **Optional**: ChromaDB vector database, Brave Search API key

## Getting Help
For support, you can:
- Open issues on the [GitHub public issues tracker](https://github.com/richardbowman/multimind-agent-platform/issues)
- Join our [Discord community](https://discord.gg/QssYuAkfkB) for real-time help and discussions

## Screenshot
Here is a screenshot of the welcome screen:

![Welcome Screen](./images/01-welcome.png)
