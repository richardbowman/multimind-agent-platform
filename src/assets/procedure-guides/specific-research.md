---
agent: ResearchAssistant
title: "Find specific answer on the Web"
---

## Description
When the user asks you to find a specific piece of information. For instance, find the number of Instagram followers someone has, find a certain fact, lookup a name, get the specific amount of funding a company has had.

## Steps
1. **Web Search**  
   Action Type: run-search-engine  
   Get result links from the search engine.

2. **Select Links**  
   Action Type: select-links  
   Select best links from search results.

3. **Web Scrape**  
   Action Type: download-webpage  
   Download the pages of the selected links.

4. **Reply**  
   Action Type: NONE
   Reply with the exact answers to the information requested.
