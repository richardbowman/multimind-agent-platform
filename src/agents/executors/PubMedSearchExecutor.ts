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
 import { DOMParser } from 'xmldom';
import { withRetry } from "src/helpers/retry";
import { ArtifactType } from "src/tools/artifact";
import crypto from 'crypto';
import { CSVUtils, CSVContents } from "src/utils/CSVUtils";

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

         // Convert results to CSV using CSVUtils
         const csvContents: CSVContents = {
             metadata: {
                 query: searchQuery,
                 resultCount: searchResults.length,
                 generatedAt: new Date().toISOString()
             },
             rows: searchResults.map(result => ({
                 Title: result.title,
                 Authors: result.authors.join('; '),
                 Journal: result.journal,
                 'Publication Date': result.publicationDate,
                 DOI: result.doi || '',
                 PMID: result.pmid,
                 Abstract: result.abstract || '',
                 URL: result.doi ? `https://doi.org/${result.doi}` : `https://pubmed.ncbi.nlm.nih.gov/${result.pmid}`
             }))
         };
         
         const csvContent = await CSVUtils.toCSV(csvContents);

         return {
             finished: true,
             type: 'pubmed_search_results',
             replan: ReplanType.Allow,
             response: {
                 status: `Query found ${searchResults.length} PubMed articles`,
                 data: {
                     type: StepResponseType.Artifact,
                     artifact: {
                         id: crypto.randomUUID() as UUID,
                         type: ArtifactType.Spreadsheet,
                         content: Buffer.from(csvContent, 'utf-8'),
                         metadata: {
                             query: searchQuery,
                             resultCount: searchResults.length,
                             generatedAt: new Date().toISOString()
                         }
                     }
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
             const detailsResponse = await withRetry(
                 () => axios.get(`${this.baseUrl}/efetch.fcgi`, {
                     params: {
                         db: 'pubmed',
                         id: idList.join(','),
                         retmode: 'xml'
                     }
                 }),
                 (response) => response.status === 200 && response.data?.length > 0,
                 {
                     timeoutMs: 10000,
                     maxRetries: 3
                 }
             );

             // Parse XML response using xmldom
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
