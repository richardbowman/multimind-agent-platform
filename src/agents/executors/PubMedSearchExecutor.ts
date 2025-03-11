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
import { AsyncQueue } from "src/helpers/asyncQueue";
import { ArtifactType, DocumentSubtype, SpreadsheetSubType } from "src/tools/artifact";
import crypto from 'crypto';
import { CSVUtils, CSVContents } from "src/utils/CSVUtils";
import { createUUID } from "src/types/uuid";

interface PubMedSearchResult {
    id: string;
    title: string;
    abstract?: string;
    authors: string[];
    journal: string;
    publicationDate: string;
    doi?: string;
    pmid: string;
    pmcid?: string;
    fullTextUrl?: string;
    fullText?: string;
}

 @StepExecutorDecorator(ExecutorType.PUBMED_SEARCH, 'Performs PubMed searches for scientific literature')
 export class PubMedSearchExecutor implements StepExecutor<StepResponse> {
     private modelHelpers: ModelHelpers;
     private readonly baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

     constructor(params: ExecutorConstructorParams) {
         this.modelHelpers = params.modelHelpers;
     }

     private convertArticleToMarkdown(body: Element): string {
        if (!body) return '';
        
        let markdown = '';
        
        // Process sections
        const sections = body.getElementsByTagName('sec');
        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            const title = section.getElementsByTagName('title')[0]?.textContent;
            
            if (title) {
                markdown += `## ${title}\n\n`;
            }
            
            // Process paragraphs
            const paragraphs = section.getElementsByTagName('p');
            for (let p = 0; p < paragraphs.length; p++) {
                const para = paragraphs[p];
                markdown += `${para.textContent}\n\n`;
            }
            
            // Process tables
            const tables = section.getElementsByTagName('table-wrap');
            for (let t = 0; t < tables.length; t++) {
                const table = tables[t];
                const tableTitle = table.getElementsByTagName('caption')[0]?.textContent;
                const tableContent = table.getElementsByTagName('table')[0];
                
                if (tableTitle) {
                    markdown += `### ${tableTitle}\n\n`;
                }
                
                if (tableContent) {
                    markdown += this.convertTableToMarkdown(tableContent);
                }
            }
            
            // Process figures
            const figures = section.getElementsByTagName('fig');
            for (let f = 0; f < figures.length; f++) {
                const figure = figures[f];
                const figTitle = figure.getElementsByTagName('caption')[0]?.textContent;
                const graphic = figure.getElementsByTagName('graphic')[0];
                
                if (figTitle) {
                    markdown += `### ${figTitle}\n\n`;
                }
                
                if (graphic) {
                    const href = graphic.getAttribute('xlink:href');
                    if (href) {
                        markdown += `![Figure](${href})\n\n`;
                    }
                }
            }
        }
        
        return markdown.trim();
    }

    private convertTableToMarkdown(table: Element): string {
        let markdown = '';
        const rows = table.getElementsByTagName('row');
        
        // Process header
        const header = table.getElementsByTagName('thead')[0];
        if (header) {
            const headerCells = header.getElementsByTagName('cell');
            const headers = Array.from(headerCells).map(cell => cell.textContent?.trim() || '');
            markdown += `| ${headers.join(' | ')} |\n`;
            markdown += `| ${headers.map(() => '---').join(' | ')} |\n`;
        }
        
        // Process body
        for (let r = 0; r < rows.length; r++) {
            const cells = rows[r].getElementsByTagName('cell');
            const rowData = Array.from(cells).map(cell => cell.textContent?.trim() || '');
            markdown += `| ${rowData.join(' | ')} |\n`;
        }
        
        return markdown + '\n';
    }

     async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
         const { searchQuery, category } = await this.generateSearchQuery(params.goal, params.stepGoal, params.previousResponses);
        const searchResults = await this.searchPubMed(searchQuery);
            
        // Fetch full text for articles with PMC IDs with rate limiting
        const asyncQueue = new AsyncQueue({ concurrency: 3, timeout: 10000 });
        const resultsWithFullText = [];
        
        for (const result of searchResults) {
            if (result.pmcid) {
                try {
                    const fullTextResponse = await asyncQueue.enqueue(() => 
                        axios.get(`${this.baseUrl}/efetch.fcgi`, {
                            params: {
                                db: 'pmc',
                                id: result.pmcid,
                                retmode: 'xml'
                            },
                            headers: {
                                'User-Agent': 'PubMedSearchExecutor/1.0 (your-email@example.com)'
                            }
                        })
                    );
                    
                    // Parse XML and convert to formatted Markdown
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(fullTextResponse.data, 'text/xml');
                    const body = xmlDoc.getElementsByTagName('body')[0];
                    result.fullText = this.convertArticleToMarkdown(body);
                    result.fullTextUrl = `https://www.ncbi.nlm.nih.gov/pmc/articles/${result.pmcid}/`;
                } catch (error) {
                    console.error(`Error fetching full text for ${result.pmcid}:`, error);
                }
            }
            resultsWithFullText.push(result);
        }

         // Convert results to CSV using CSVUtils
        // Create document artifacts for full text
        const documentArtifacts = resultsWithFullText
            .filter(result => result.fullText)
            .map(result => ({
                id: createUUID(),
                type: ArtifactType.Document,
                content: result.fullText!,
                metadata: {
                    subtype: DocumentSubtype.PubMedFullArticle,
                    title: result.title,
                    authors: result.authors.join(', '),
                    journal: result.journal,
                    publicationDate: result.publicationDate,
                    doi: result.doi,
                    pmid: result.pmid,
                    pmcid: result.pmcid,
                    generatedAt: new Date().toISOString()
                }
            }));

        const csvContents: CSVContents = {
            metadata: {
                query: searchQuery,
                resultCount: resultsWithFullText.length,
                generatedAt: new Date().toISOString()
            },
            rows: resultsWithFullText.map(result => ({
                 Title: result.title,
                 Authors: result.authors.join('; '),
                 Journal: result.journal,
                 'Publication Date': result.publicationDate,
                 DOI: result.doi || '',
                 PMID: result.pmid,
                 Abstract: result.abstract || '',
                URL: result.doi ? `https://doi.org/${result.doi}` : `https://pubmed.ncbi.nlm.nih.gov/${result.pmid}`,
                FullText: result.fullTextUrl || '',
                DocumentLink: result.fullText ? `[${result.title}](/artifact/${documentArtifacts.find(a => a.metadata.pmid === result.pmid)?.id})` : ''
             }))
         };
         
         const csvContent = await CSVUtils.toCSV(csvContents);

        if (resultsWithFullText.length === 0) {
            return {
                finished: true,
                type: 'pubmed_search_results',
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.Message,
                    status: `No PubMed articles found for query: ${searchQuery}`
                }
            };
        }

        return {
            finished: true,
            type: 'pubmed_search_results',
            replan: ReplanType.Allow,
            response: {
                type: StepResponseType.GeneratedArtifact,
                status: `Query "${searchQuery}" found ${resultsWithFullText.length} PubMed articles`,
                artifacts: [
                    {
                        type: ArtifactType.Spreadsheet,
                        content: csvContent,
                        metadata: {
                            title: `PubMed Search Results - ${searchQuery}`,
                            subtype: SpreadsheetSubType.SearchResults,
                            query: searchQuery,
                            resultCount: resultsWithFullText.length,
                            generatedAt: new Date().toISOString(),
                            linkedDocuments: documentArtifacts.map(a => a.id)
                        }
                    },
                    ...documentArtifacts
                ]
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
                     retmax: 100
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

                const articleIds = Array.from(article.getElementsByTagName('ArticleId'))
                    .reduce((acc, el) => {
                        const idType = el.getAttribute('IdType');
                        const value = el.textContent || '';
                        if (idType && value) {
                            acc[idType] = value;
                        }
                        return acc;
                    }, {} as Record<string, string>);

                return {
                    id: articleIds.pubmed || getText('PMID'),
                    title: getText('ArticleTitle'),
                    abstract: getText('AbstractText'),
                    authors,
                    journal: getText('Title'),
                    publicationDate: getText('PubDate'),
                    doi: articleIds.doi || Array.from(article.getElementsByTagName('ELocationID'))
                        .find(el => el.getAttribute('EIdType') === 'doi')
                        ?.textContent || '',
                    pmid: articleIds.pubmed || getText('PMID'),
                    pmcid: articleIds.pmc,
                    fullTextUrl: articleIds.pmc ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${articleIds.pmc}/` : undefined
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
