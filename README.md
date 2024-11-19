# Webpage Scraping and Research Assistant

## Overview

This project is designed to assist in scraping webpage content and performing research tasks using various machine learning models. It leverages Puppeteer for web scraping, a Mattermost client for communication, and ChromaDB for storing embeddings of the scraped data. The core components include an orchestrator that manages the workflow of tasks and multiple assistant classes that handle specific research activities.

## Key Components

### Main Logic

1. **orchestrator.ts**:
   - The main orchestrator class initializes and manages communication via Mattermost.
   - It fetches researcher messages from a specified channel and uses them to start the research workflow.

2. **orchestratorWorkflow.ts**:
    - This class handles the workflow of a research task, including decomposing tasks into smaller parts, distributing them among assistants, aggregating results, and generating final reports or replies.
    - It interacts with `ChromaDBService` to store and retrieve embeddings of the data.

3. **assistant.ts**:
   - Represents an assistant class that performs research tasks.
   - Specific implementations and methods are not detailed in the provided code.


### Helpers

1. **ScrapeHelper.ts**:
   - This module uses Puppeteer to scrape web pages and extract their text content.
   - It provides a method `scrapePageWithPuppeteer` that takes a URL, launches a headless browser, navigates to the page, and returns the cleaned text.

2. **LMStudioService.ts**:
   - This service class likely interacts with a language modeling studio or API.
   - Its specific functionalities are not detailed in the provided code, but it could be involved in text processing tasks.

3. **ChromaDBService.ts**:
   - This service class provides methods for interacting with ChromaDB.
   - It is used to manage embeddings and their storage/retrieval, including adding documents and querying related content.

4. **searchHelper.ts**:
   - This helper class likely performs search operations using the stored embeddings.
   - Specific implementations and methods are not detailed in the provided code.

5. **summaryHelper.ts**:
   - This helper class likely generates summaries of research findings or scraped content.
   - Specific implementations and methods are not detailed in the provided code.

## Usage

### Prerequisites
- Node.js installed on your machine.
- Required packages: puppeteer, mattermost-client, chromadb (or compatible DB).

### Setup
1. Clone the repository to your local machine.
2. Install dependencies using `npm install`.
3. Configure environment variables as needed in `env.defaults`.

### Running the Project
1. Start the main orchestrator by running a command like `npm start`.
2. The orchestrator will fetch messages from the specified Mattermost channel, decompose tasks, and manage the research workflow.

## Dependencies

This project relies on several key dependencies:

- **puppeteer**: For web scraping.
- **mattermost-client**: To interact with Mattermost servers.
- **chromadb** (or compatible DB): For storing embeddings of scraped data.
- **other dependencies**: Refer to `package.json` for a full list.

To install these dependencies, run:
```bash
npm install