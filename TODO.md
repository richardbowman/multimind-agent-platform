# TODO List

 - [~] not started
 - [~] means in-progress
 - [x] complete

## 2024-12-14
- [x] add to solver a code executor
- [ ] add a form capability for question generation to use in onboarding


## 2024-12-13
- [ ] need to finish transitioning project manager.
- [ ] the content manager is getting "stuck" when the sub project completes it doesnt seem to be able to push forward with more step-based processing
- [ ] implement dynamic RAG injection strategy like LM studio has based on content size
- [ ] i think the Bedrock processing is not using message history in the structured generation calls, i also found it wasnt even including system prompts 

## 2024-12-12
 - [ ] make the GoalConfirmer update the project info with its refined understanding
 - [~] added Vectra support (fix issue with hardcoding Bedrock embedding)
 - [ ] turn planning into a executor
 - [ ] give planning a cost function (X total cycles, at Y right now)
 - [ ] allow any agent to respond on any channel
 - [ ] create an agent decider process that decides which agent will respond versus the user having to rememer who to @
 - [x] add Vectra support
 - [~] add google search through playwright
 - [ ] fix up the project manager to use the new structure of Executors.
   - [ ] this will cause refactoring of other agents so that the other agents can be kicked off via project tasks vs. chat
   - [ ] we'll also need to handle these follow-on projects completions so that the PM can bring everything together
- [ ] right now we skip scraping pages we've already scraped which doesn't work well for news.
   

## 2024-12-10
- [x] Chain of thought /multi-LLM call steps - implemented new Planner
  - [ ] still need to refactor all agents and eliminate old code for old handler-based approach
- [~] Allow the LLM to define a goal - almost done, added a goal executor but need to use its goal
- [~] And then check if it met the goal or not yet - validation does this, except we need to test how well it can really short-circuit or replan based on its results.
- [x] @researchAssistant.ts right now, we store webpage summaries as just chunks without using our artifact manager.
- [x] start using the @ArtifactManager to store the summaries. also use this to make sure we don't perform duplicative searches across research tasks by checking to see if we've summarized a certain site already
- [~] Can stop to answer questions - yes, but its a weird flow internally - when the response comes in, right now it replans. it's not the clearest flow on what executor should handle follow-ups
  - [ ] help the planner know if we are in a thread? 
  - [ ] add back conversation thread summary and context for planner (we had this in the old handlers, not sure if we have it now)

## 2024-12-08

- [ ] structured artifacts - add ability for artifacts to reference other artifacts {#embed XXXX} so that we can more easily understand the sections and revise them
- [ ] content sections
- [ ] lists / requirements documents
- [ ] tables / spreadsheets
- [~] onboarding agent - works pretty well, but it doens't have a final step that explains to the user how to get started. I think we need a stronger Instructions.md doc that we index that it can leverage.
- [~] welcoming users
- [ ] understanding when onboarding is complete

## 2024-12-06

- [ ] multi-step awareness
- [x] using projects for research manager / content manager to control flow
- [x] task dependencies

## 2024-11-27

- [x] need a tool to define a desired conversation flow - moved towards a Planner 
- [~] there should be “stages” (in progress as of 12/12 - it can only handle one goal to plan towards)

## 2024-11-26

- [x] show user names and channel names instead of IDs
- [ ] add content sections to RAG, include context in writing process [I THINK WE HAVE THIS?]

## 2024-11-25

- [x] page summaries missing from ChromaDB
- [x] make chroma inspector easier with filter id
- [x] include chunk IDs and page titles in body
- [ ] group the chroma viewer by URL?
- [ ] should agents communicate in English or JSON?
  - [x] implement structured output <https://lmstudio.ai/docs/advanced/structured-output>
- [x] implement annotation routing for agents

## 2024-11-24

- [x] save web pages with their title in chroma
- [ ] figure out if its really getting good content in there
- [ ] dont send whole conversation chain to chroma for questioning


