# TODO List




## 2024-01-14

- [ ] research assistant planning is weird when run from tasks, it only plans a single step
- [ ] when the research assistants are all done, the research manager doesn’t finish by running its last task even though its in the plan (i have to send a message)


## 2024-01-09

- [ ] at one point, i think i was trimming, but getitng token limit errors.
- [ ] enhance how steps can get configs speciifc to different agents, like i'd like to limit the solver's knowledge check to certain "instructions" document types
- [ ] custom channels
- [ ] channel templates


## 2024-12-17

- [x] move to Electron app
- [ ] move to puppeteer-core and use local Chrome
- [ ] right now, if the server restarts, the client can't restart/resync
- [x] Remove already processed links from link selection
- [ ] Move "Received get_logs request with type:" logs to the API type log
- [ ] instead of scraper scrolling all the way to bottom, what if it scrolled page by page

Errors

* In the process that uses schema “Array of selected URLs most relevant to the research goal”, seeing “You are a research assistant. Our overall goal is **undefined**:” in logs
* <https://openai.com/index/best-practices-for-deploying-language-models/>
  * this page just had this saved… “Application error: a client-side exception has occurred (see the browser console for more information).”
* Also seems like its potentially making up links… getting a number of bad website URLs
* \
  * [	https://www.openai.com/blog/new-model-release](https://www.openai.com/blog/new-model-release)
  * [	https://huggingface.co/blog/latest-llm-releases](https://huggingface.co/blog/latest-llm-releases)
  * [	https://developer.ibm.com/languages/python/tutorials/llms-introduction/](https://developer.ibm.com/languages/python/tutorials/llms-introduction/)


Error processing page https://www.theverge.com/2024/10/24/24278999/openai-plans-orion-ai-model-release-december
Error: Cannot save artifact cc441bec-1817-43fe-9c77-a4915ac91cc2: content is undefined
Stack: Error: Cannot save artifact cc441bec-1817-43fe-9c77-a4915ac91cc2: content is undefined
at ArtifactManager.saveArtifact (/home/rickbowman/Projects/multi-agent/src/tools/artifactManager.ts:79:13)
at async ScrapeHelper.scrapePage (/home/rickbowman/Projects/multi-agent/src/helpers/scrapeHelper.ts:111:13)
at async WebSearchExecutor.processPage (/home/rickbowman/Projects/multi-agent/src/agents/research/WebResearchExecutor.ts:54:43)

Error: ENOENT: no such file or directory, open '/home/rickbowman/Projects/multi-agent/.output/artifacts/artifact.json'
Stack: Error: ENOENT: no such file or directory, open '/home/rickbowman/Projects/multi-agent/.output/artifacts/artifact.json'
at async open (node:internal/fs/promises:639:25)

- [ ] we should add timing to model logs (and add usage tokens to LM Studio logging)
- [ ] context window is being exceeded for web summarization - we’ll have to chunk these
- [ ] add brave-search (<https://github.com/erik-balfe/brave-search>)
- [ ] add direct Anthropic support (<https://www.npmjs.com/package/@anthropic-ai/sdk>)

## 2024-12-16

- [ ] in progress was incorrectly implemented in ChatPanel, its not looking at tasks
- [ ] /retry doesn’t work after reload, its not actually looking at current chanenl
- [ ] duplicate posts for user post
- [ ] onboarding agent seems to work but don’t see reply
- [ ] allow a specialized model for coding in solver, added the variable LMSTUDIO_CODE_MODEL
- [ ] live posts don’t trigger the thread view switch
- [ ] i think modelhelpers is augmenting every schema with artifactIds??
- [ ] fix where we store model output tokens, right now we’re jamming a _usage on the actual responses, but we should make a new generate signature that can return these

## 2024-12-15

- [ ] added some very rough features like model response caches
- [ ] research manager is losing its steps when it kicks off children, it never moves on to aggregate.
- [ ] i'm not geting any research summaries saved, or webpage summaries.
- [ ] research assistants are not doing a multistep process, the plan only comes back with web-research (are they using single step planner?)

## 2024-12-14

- [x] add to solver a code executor
- [ ] add a form capability for question generation to use in onboarding


## 2024-12-13

- [ ] need to finish transitioning project manager.
- [ ] the content manager is getting "stuck" when the sub project completes it doesnt seem to be able to push forward with more step-based processing
- [ ] implement dynamic RAG injection strategy like LM studio has based on content size
- [ ] i think the Bedrock processing is not using message history in the structured generation calls, i also found it wasnt even including system prompts

## 2024-12-12

## 2024-12-10

## 2024-12-08

## 2024-12-06

- [ ] multi-step awareness
- [x] using projects for research manager / content manager to control flow
- [x] task dependencies

## 2024-11-27

## 2024-11-26

- [x] show user names and channel names instead of IDs
- [ ] add content sections to RAG, include context in writing process \[I THINK WE HAVE THIS?\]

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


