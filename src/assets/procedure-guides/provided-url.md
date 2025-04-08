---
agent: Research Assistant
title: Provided URL Procedure
---

# Overview

## Description
If the task includes a specific complete URL, download and process relevant links.

## Steps
1. **URL Extract**  
   Action Type: url-extract  
   Extract the URLs from the task information.

2. **Web Scrape**  
   Action Type: download-webpage  
   Scrape provided URL.

3. **Select Links**  
   Action Type: select-links  
   Select child links from this page.

4. **Web Scrape**  
   Action Type: download-webpage  
   Scrape selected child links.

5. **Generate Document**  
   Action Type: generate-document  
   Create a document of the relevant information from the webpage.
