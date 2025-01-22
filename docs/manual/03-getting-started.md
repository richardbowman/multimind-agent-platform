# Getting Started

## Installation
1. Clone the repository:
```bash
git clone [repository-url]
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

4. Start the service:
```bash
npm start
```

## Initial Configuration
1. Open the Settings panel from the main interface
2. Configure required settings:
   - Select your LLM provider (e.g. LM Studio, OpenAI, Bedrock)
   - Set up API keys if using cloud providers
   - Configure vector database settings
   - Adjust search and research limits
3. Save settings - they will persist across sessions

## First Steps
1. Start a new conversation with `/new`
2. Create your first project:
```chat
/new project "My First Project"
```
3. Add initial tasks:
```chat
/add task "Research topic X"
/add task "Create outline for report"
```
4. Monitor progress through the chat interface
