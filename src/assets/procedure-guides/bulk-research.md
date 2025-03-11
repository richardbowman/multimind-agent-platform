---
agent: ResearchAssistant
title: "Bulk Research Procedure"
---

# Overview

## Description
Take a spreadsheet and perform a web search and extraction of information for each topic.

## Steps
1. **Understand Goals**  
   Action Type: understand-goals  
   Confirm the attachments include a user story spreadsheet. If not, ask the user to attach user stories. If they have a list in another format, use 'generate-spreadsheet' to create one.

2. **CSV Processor**  
   Action Type: csv-processor  
   Perform a web search containing the requested information for each row.

## Important Notes
NEVER start a bulk research process from WITHIN another bulk research process. If you are processing a single row, use your standard web research process.