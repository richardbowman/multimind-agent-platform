---
title: "Survey available research literature"
agent: ScienceAssistant
---
## Overview
Find available research on a topic. Try to find at least 20 papers (or whatever is specified in goal)

## Approach

1. Screen papers
  Action Type: [pubmed-search]
  Perform a search based on the research request

2. Broaden search if insufficient results found
  Action Type: [pubmed-search]
  Try to broaden the search by using less AND, repeat this up to 5 more times as needed.

4. Combine screenings
  Action Type: [csv-merge]
  Combine all of the search results together