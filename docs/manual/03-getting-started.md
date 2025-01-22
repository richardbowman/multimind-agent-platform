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
Set up your `.env` file with required values:
```env
CHROMA_COLLECTION=webpage_scrapes
MAX_SEARCHES=1
MAX_FOLLOWS=0
MAX_RESEARCH_REQUESTS=1
EMBEDDING_MODEL=text-embedding-nomic-embed-text-v1.5
CHAT_MODEL=qwen2.5-coder-14b-instruct
CONTEXT_SIZE=16384
```

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
