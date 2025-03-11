---
agent: ResearchAssistant
title: "No Existing Knowledge Procedure"
---

# Overview

## Description
Search, process links, and provide final response.

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

4. **Generate Spreadsheet**  
   Action Type: generate-spreadsheet  
   Create a spreadsheet including the URL and your findings from each relevant search result.
