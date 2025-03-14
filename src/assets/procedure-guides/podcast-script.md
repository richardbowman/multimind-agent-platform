---
agent: ContentManager
title: "Podcast Script Writing Procedure"
---

# Overview

## Description
Create engaging podcast scripts using a structured approach. Develop episode outlines first, then write full scripts with proper formatting and timing.

## Steps

1. **Understand Goals**  
   Action Type: understand-goals  
   Confirm the podcast format, target audience, episode length and key topics with the user.

2. **Episode Planning**  
2a. Action Type: outline  
   Develop episode structure with:  
   - Opening hook  
   - Main segments  
   - Transitions  
   - Call to action  
   - Closing remarks  

2b. Action Type: reply
   Confirm the outline with the user before continuing.

3. **Script Writing**  
   Action Type: assign-writers  
   Assign content writers to develop full scripts for each segment:  
   a. Write host dialogue and guest questions  
   b. Add timing markers (e.g. [00:00] Intro)  
   c. Include sound effect cues  
   d. Format for readability  

4. **Final Production**  
   Action Type: content-combination  
   Combine all script segments into a final markdown document with:  
   - Proper formatting and timing markers  
   - Consistent style throughout  
   - Clear section transitions  
   - Ready for teleprompter use  

## Roles

- **ContentManager**: Oversees the process, manages episode structure, and coordinates with ContentWriter
- **ContentWriter**: Handles the actual script writing and formatting

## Important Notes

1. Use a consistent script template:  
   ```
   [00:00] Segment Title
   Host: Dialogue text
   [SFX: Sound effect description]
   Guest: Response text
   ```

2. Maintain a tracking system to ensure:  
   - Consistent episode structure  
   - Proper timing across segments  
   - Balanced content distribution  

3. For multi-episode series:  
   - Develop series arc first  
   - Create episode outlines in bulk  
   - Maintain continuity between episodes
