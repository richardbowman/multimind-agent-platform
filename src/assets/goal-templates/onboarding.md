# Onboarding Channel Template

**ID**: `#onboarding`

## Description
Template for initializing an onboarding for new projects

## Supporting Agents
- `@onboarding`

## Default Responder
`@onboarding`

## Initial Tasks

### 1. Find an on-boarding template based on my high-level goal
**Type**: onboarding  
**Depends On**: None  
**Metadata**:
```json
{
  "agent": "@onboarding"
}
```

### 2. Generate an onboarding plan using the onboarding agent
**Type**: onboarding  
**Depends On**: 
- `gather-existing-documents`  
**Metadata**:
```json
{
  "agent": "@onboarding"
}
```

### 3. Create necessary communication channels for usage based on the user goal
**Type**: communication  
**Depends On**: 
- `generate-channel`
