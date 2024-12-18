# TODO List


Error processing page https://www.unite.ai/best-large-language-models-llms/ Error: Trying to keep the first 22333 tokens when context the overflows. However, the model is loaded with context length of only 16384 tokens, which is not enough. Try to load the model with a larger context length, or provide a shorter input


Errors

* In the process that uses schema “Array of selected URLs most relevant to the research goal”, seeing “You are a research assistant. Our overall goal is **undefined**:” in logs
* <https://openai.com/index/best-practices-for-deploying-language-models/>
  * this page just had this saved… “Application error: a client-side exception has occurred (see the browser console for more information).”
* Also seems like its potentially making up links… getting a number of bad website URLs
* \
  * [	https://www.openai.com/blog/new-model-release](https://www.openai.com/blog/new-model-release)
  * [	https://huggingface.co/blog/latest-llm-releases](https://huggingface.co/blog/latest-llm-releases)
  * [	https://developer.ibm.com/languages/python/tutorials/llms-introduction/](https://developer.ibm.com/languages/python/tutorials/llms-introduction/)


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


