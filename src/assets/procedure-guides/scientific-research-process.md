---
agent: Research Manager
title: Advanced Research Report Process
---

1. Develop screening criteria based on request
  Action Type: [generate-spreadsheet]
  Generate a list of screening criteria with a Name, Definition, and Instructions columns. Instructions should be a detailed prompt to be used by future LLM calls. Conider needed criteria around population characteristics, study design, primary and secondary outcome measures, and study duration.

2. Screen top 50 papers
  Action Type: [delegation]
  Ask @science-assistant to use PubMed to only perform search, but not review any further.

3. Use the screening criteria to assess each paper.
  Action Type: [csv-processor]
- Ask @science-reviewer to review the absract of each paper provided in the spreadsheet and assess it against the screening criteria items.

FUTURE (Skip these steps for now):
Populating criteria
Screening for match criteria 
Extract from up to 10 papers




