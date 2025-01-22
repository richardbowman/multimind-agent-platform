# Chat Usage Guide

## Channel Communication Basics

The chat interface is the primary way to interact with the platform. Here's how it works:

1. **Channels** are created for each project or topic
2. **Threads** are used to maintain context for specific conversations
3. **Agents** respond in threads they started or were mentioned in
4. **Messages** can include:
   - Plain text
   - Attachments
   - Structured data
   - Commands

## Response Patterns

### Default Responder
Each channel has a default responder agent that handles:
- Initial messages in the main channel
- Messages not directed at specific agents
- General inquiries about the channel's purpose

Example:
```
[You] What's the status of the project?
[Default Responder] Let me check... (creates thread)
```

### Direct Mentions
Use @agentname to direct messages to specific agents:
- Creates a new thread if one doesn't exist
- Ensures the mentioned agent responds
- Useful for specialized tasks

Example:
```
[You] @research Can you find recent AI trends?
[Research Agent] Sure! I'll start researching... (creates thread)
```

### Thread Behavior
Once a thread is started:
- The same agent continues responding in that thread
- Context is maintained across messages
- Other agents can be invited with @mention

Example thread:
```
[Research Agent] Here's my initial findings...
[You] Can you expand on point 3?
[Research Agent] Certainly! Here's more detail...
[You] @content Can you help format this?
[Content Agent] I'll help format the findings...
```

## Best Practices

1. **Use threads** for ongoing conversations
2. **Mention agents** when you need specific expertise
3. **Let the default responder** handle general inquiries
4. **Check existing threads** before starting new ones
5. **Use clear commands** for better understanding

## Common Commands

- `/new [project/task/document]` - Start new items
- `/status` - Check project status
- `/help` - Get assistance
- `/invite @agent` - Add agent to thread
- `/close` - Mark thread as resolved

## Example Workflow

1. Start in main channel:
```
[You] I need help with market research
[Default Responder] I'll create a research project... (creates thread)
```

2. Continue in thread:
```
[Research Agent] What markets are you interested in?
[You] Technology sector, specifically AI
[Research Agent] Gathering data... (shows progress)
```

3. Add specialized help:
```
[You] @content Can you format this report?
[Content Agent] Formatting the research findings...
```

4. Close when done:
```
[You] /close
[Default Responder] Marking research complete
```
