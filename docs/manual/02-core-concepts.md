# Core Concepts

## Agents
The system uses specialized agents to handle different tasks:
- **Research Manager**: Handles web searches and content analysis
- **Content Manager**: Manages document generation and editing
- **Project Manager**: Organizes tasks and workflows

## Projects
Projects are the main organizational unit:
- Contain related tasks and documents
- Have metadata like status, priority, and tags
- Can be nested or linked to other projects

## Tasks
Tasks represent individual work items:
- Types: Standard, Recurring, Steps, Goals
- Can be assigned to users or agents
- Track progress and completion status

## Artifacts
Generated content and outputs:
- Documents, reports, emails
- Stored in vector database for search
- Version controlled and linked to tasks

## Conversations
Threaded chat system:
- Maintains context across messages
- Links to projects and tasks
- Supports attachments and structured data
