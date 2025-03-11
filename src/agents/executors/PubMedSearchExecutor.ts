import { ModelHelpers } from "src/llm/modelHelpers";
 import { SearchQueryResponse } from "src/schemas/SearchQueryResponse";
 import { StepExecutorDecorator } from "../decorators/executorDecorator";
 import { ExecuteParams } from "../interfaces/ExecuteParams";
 import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
 import { StepExecutor } from "../interfaces/StepExecutor";
 import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType } from "../interfaces/StepResult";
 import { getGeneratedSchema } from "src/helpers/schemaUtils";
 import { StructuredOutputPrompt } from "src/llm/ILLMService";
 import { SchemaType } from "src/schemas/SchemaTypes";
 import { ExecutorType } from "../interfaces/ExecutorType";
 import axios from 'axios';

 interface PubMedSearchResult {
     id: string;
     title: string;
     abstract?: string;
     authors: string[];
     journal: string;
     publicationDate: string;
     doi?: string;
     pmid: string;
 }

 @StepExecutorDecorator(ExecutorType.PUBMED_SEARCH, 'Performs PubMed searches for scientific literature')
 export class PubMedSearchExecutor implements StepExecutor<StepResponse> {
     private modelHelpers: ModelHelpers;
     private readonly baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

     constructor(params: ExecutorConstructorParams) {
         this.modelHelpers = params.modelHelpers;
     }

     async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
         const { searchQuery, category } = await this.generateSearchQuery(params.goal, params.stepGoal, params.previousResponses);
         const searchResults = await this.searchPubMed(searchQuery);

         return {
             finished: true,
             type: 'pubmed_search_results',
             replan: ReplanType.Allow,
             response: {
                 status: `Query found ${searchResults.length} PubMed articles`,
                 data: {
                     type: StepResponseType.SearchResults,
                     searchResults: searchResults.map(result => ({
                         title: result.title,
                         url: result.doi ? `https://doi.org/${result.doi}` : `https://pubmed.ncbi.nlm.nih.gov/${result.pmid}`,
                         snippet: result.abstract || '',
                         source: 'PubMed',
                         metadata: {
                             authors: result.authors,
                             journal: result.journal,
                             publicationDate: result.publicationDate
                         }
                     })),
                     query: searchQuery
                 }
             }
         };
     }

     private async searchPubMed(query: string): Promise<PubMedSearchResult[]> {
         try {
             // First search PubMed to get article IDs
             const searchResponse = await axios.get(`${this.baseUrl}/esearch.fcgi`, {
                 params: {
                     db: 'pubmed',
                     term: query,
                     retmode: 'json',
                     retmax: 10
                 },
                 headers: {
                     'User-Agent': 'PubMedSearchExecutor/1.0 (your-email@example.com)'
                 }
             });

             const idList = searchResponse.data?.esearchresult?.idlist || [];
             if (idList.length === 0) return [];

             // Fetch details for the found articles
             // Add retry logic with exponential backoff
             const maxRetries = 3;
             let retryCount = 0;
             let detailsResponse;
             
             while (retryCount < maxRetries) {
                 try {
                     detailsResponse = await axios.get(`${this.baseUrl}/efetch.fcgi`, {
                         params: {
                             db: 'pubmed',
                             id: idList.join(','),
                             retmode: 'xml'
                         },
                         timeout: 10000 // 10 second timeout
                     });
                     break;
                 } catch (error) {
                     retryCount++;
                     if (retryCount === maxRetries) {
                         throw error;
                     }
                     // Exponential backoff
                     await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
                 }
             }

             // Parse XML response
             const parser = new DOMParser();
             const xmlDoc = parser.parseFromString(detailsResponse.data, 'text/xml');
             const articles = xmlDoc.getElementsByTagName('PubmedArticle');

             return Array.from(articles).map(article => {
                 const getText = (tagName: string) =>
                     article.getElementsByTagName(tagName)[0]?.textContent || '';

                 const authors = Array.from(article.getElementsByTagName('Author'))
                     .map(author => {
                         const lastName = author.getElementsByTagName('LastName')[0]?.textContent || '';
                         const foreName = author.getElementsByTagName('ForeName')[0]?.textContent || '';
                         return `${foreName} ${lastName}`.trim();
                     });

                 return {
                     id: getText('PMID'),
                     title: getText('ArticleTitle'),
                     abstract: getText('AbstractText'),
                     authors,
                     journal: getText('Title'),
                     publicationDate: getText('PubDate'),
                     doi: getText('ELocationID'),
                     pmid: getText('PMID')
                 };
             });
         } catch (error) {
             console.error('PubMed search error:', error);
             return [];
         }
     }

     private async generateSearchQuery(goal: string, task: string, previousResponses?: any): Promise<SearchQueryResponse> {
         const schema = await getGeneratedSchema(SchemaType.SearchQueryResponse);

         const previousFindings = previousResponses?.data?.analysis?.keyFindings || [];
         const previousGaps = previousResponses?.data?.analysis?.gaps || [];

         const systemPrompt = `You are a scientific research assistant. Our overall goal is ${goal}.
     Consider these specific goals we're trying to achieve: ${task}

     Previous Research Findings:
     ${previousFindings.map((f: any) => `- ${f.finding}`).join('\n')}

     Identified Gaps:
     ${previousGaps.map((g: string) => `- ${g}`).join('\n')}

     Generate a focused PubMed search query using appropriate medical/scientific terminology.
     Include relevant MeSH terms and Boolean operators when appropriate.`;

         const instructions = new StructuredOutputPrompt(schema, systemPrompt);
         const response = await this.modelHelpers.generate<SearchQueryResponse>({
             message: `Task: ${task}`,
             instructions
         });

         return response;
     }
 }
