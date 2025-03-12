import * as fs from 'fs/promises';
import * as path from 'path';
import { Sequelize } from 'sequelize';
import { getDataPath } from '../helpers/paths';
import Logger from '../helpers/logger';
import { IVectorDatabase } from '../llm/IVectorDatabase';
import { ILLMService } from '../llm/ILLMService';
import { Artifact, ArtifactItem, ArtifactType } from './artifact';
import { AsyncQueue } from '../helpers/asyncQueue';
import { asUUID, createUUID, UUID } from 'src/types/uuid';
import * as pdf from 'pdf-parse';
import { asError, isError } from 'src/types/types';
import { ModelMessageResponse } from 'src/schemas/ModelResponse';
import { ArtifactModel } from './artifactModel';
import { DatabaseMigrator } from 'src/database/migrator';

// Get appropriate file extension and type based on MIME type
const getFileInfo = (mimeType?: string): { extension: string, type: string } => {
  if (!mimeType) return { extension: 'md', type: 'document' };
  
  const mimeToInfo: Record<string, { extension: string, type: string }> = {
    'application/json': { extension: 'json', type: 'data' },
    'text/plain': { extension: 'txt', type: 'document' },
    'text/markdown': { extension: 'md', type: 'document' },
    'text/html': { extension: 'html', type: 'webpage' },
    'text/css': { extension: 'css', type: 'code' },
    'text/javascript': { extension: 'js', type: 'code' },
    'text/csv': { extension: 'csv', type: 'csv' },
    'image/jpeg': { extension: 'jpg', type: 'image' },
    'image/png': { extension: 'png', type: 'image' },
    'image/gif': { extension: 'gif', type: 'image' },
    'image/svg+xml': { extension: 'svg', type: 'image' },
    'image/webp': { extension: 'webp', type: 'image' },
    'application/pdf': { extension: 'pdf', type: 'document' },
    'application/xml': { extension: 'xml', type: 'data' },
    'application/yaml': { extension: 'yaml', type: 'data' },
    'application/x-yaml': { extension: 'yaml', type: 'data' },
    'application/vnd.ms-excel': { extension: 'xls', type: 'data' },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { extension: 'xlsx', type: 'data' },
    'application/vnd.ms-powerpoint': { extension: 'ppt', type: 'presentation' },
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': { extension: 'pptx', type: 'presentation' },
    'application/msword': { extension: 'doc', type: 'document' },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extension: 'docx', type: 'document' }
  };

  // Check for exact MIME type match
  if (mimeToInfo[mimeType]) {
    return mimeToInfo[mimeType];
  }

  // Check for MIME type category match
  const category = mimeType.split('/')[0];
  switch (category) {
    case 'text':
      return { extension: 'txt', type: 'document' };
    case 'image':
      return { extension: mimeType.split('/')[1] || 'bin', type: 'image' };
    case 'audio':
      return { extension: mimeType.split('/')[1] || 'bin', type: 'audio' };
    case 'video':
      return { extension: mimeType.split('/')[1] || 'bin', type: 'video' };
    default:
      return { extension: 'bin', type: 'file' };
  }
};

export class ArtifactManager {
  private storageDir: string;
  private sequelize: Sequelize;
  private vectorDb: IVectorDatabase;
  private llmService?: ILLMService;
  private fileQueue: AsyncQueue;
  private saveQueue: AsyncQueue;

  private migrator: DatabaseMigrator;

  private initialized: boolean = false;

   constructor(vectorDb: IVectorDatabase, llmService?: ILLMService, storageDir?: string) {
       this.storageDir = storageDir || path.join(getDataPath(), 'artifacts');
       this.vectorDb = vectorDb;
       this.fileQueue = new AsyncQueue();
       this.saveQueue = new AsyncQueue();
       this.llmService = llmService;

       // Initialize SQLite database
       const dbPath = path.join(this.storageDir, 'artifacts.db');
       this.sequelize = new Sequelize({
           dialect: 'sqlite',
           storage: dbPath,
           logging: msg => Logger.verbose(msg)
       });

       // Initialize migrator
       const migrationsDir = path.join(this.storageDir, 'migrations');
       this.migrator = new DatabaseMigrator(this.sequelize, migrationsDir);

       // Initialize models
       ArtifactModel.initialize(this.sequelize);
   }

   async initialize(): Promise<void> {
       if (this.initialized) return;

       // Ensure the .output directory exists and run migrations
       await this.fileQueue.enqueue(async () => {
           await fs.mkdir(this.storageDir, { recursive: true });
           await this.migrator.migrate();
       }).catch(err => Logger.error('Error initializing database:', err));

       // Wait for initial migration to complete
       await this.sequelize.sync();

       this.initialized = true;
   }

  async getArtifacts(filter: { type?: string, subtype?: string, [key: string]: any } = {}): Promise<ArtifactItem[]> {
    const artifacts = await this.listArtifacts();

    return artifacts.filter(artifact => {
      // Match type if specified
      const typeMatch = !filter.type || artifact.type === filter.type;
      
      // Match subtype if specified
      const subtypeMatch = !filter.subtype || artifact.metadata?.subtype === filter.subtype;
      
      // Match other metadata keys
      const metadataMatch = Object.keys(filter)
        .filter(key => key !== 'type' && key !== 'subtype')
        .every(key => {
          const filterValue = filter[key];
          const metadataValue = artifact.metadata?.[key];
          
          // Handle array values with $in operator
          if (Array.isArray(filterValue)) {
            return filterValue.includes(metadataValue);
          }
          
          // Handle object operators like $eq, $gt, etc.
          if (typeof filterValue === 'object' && filterValue !== null) {
            return Object.entries(filterValue).every(([operator, value]) => {
              switch (operator) {
                case '$eq': return metadataValue === value;
                case '$ne': return metadataValue !== value;
                case '$gt': return metadataValue > value;
                case '$gte': return metadataValue >= value;
                case '$lt': return metadataValue < value;
                case '$lte': return metadataValue <= value;
                case '$in': return Array.isArray(value) && value.includes(metadataValue);
                case '$nin': return Array.isArray(value) && !value.includes(metadataValue);
                case '$exists': return value ? metadataValue !== undefined : metadataValue === undefined;
                default: return false;
              }
            });
          }
          
          // Simple equality match
          return metadataValue === filterValue;
        });

      return typeMatch && subtypeMatch && metadataMatch;
    });
  }

  private async getArtifactRecord(id: UUID): Promise<ArtifactModel | null> {
    return ArtifactModel.findByPk(id, {
      rejectOnEmpty: false
    });
  }

  private async getAllArtifactRecords(): Promise<ArtifactModel[]> {
    return ArtifactModel.findAll();
  }

  async saveArtifact(artifactParam: Partial<Artifact>): Promise<Artifact> {
    return this.saveQueue.enqueue(async () => {
      // Set type based on MIME type if provided
      const mimeType = artifactParam.metadata?.mimeType;
      const fileInfo = getFileInfo(mimeType);
      // Use the type from fileInfo if no type was explicitly set
      // Use the type from fileInfo if no type was explicitly set
      const type = artifactParam.type || fileInfo.type || 'file';
      // Extract subtype if provided in metadata
      const subtype = artifactParam.metadata?.subtype || undefined;
      
      let record: ArtifactModel;
      let version: number;
      
      if (artifactParam.id) {
        // Update existing artifact
        record = await ArtifactModel.findByPk(artifactParam.id);
        if (!record) {
          throw new Error(`Artifact ${artifactParam.id} not found`);
        }
        version = record.version + 1;
        
        await record.update({
          type,
          tokenCount: artifactParam.tokenCount,
          mimeType: artifactParam.metadata?.mimeType,
          subtype,
          metadata: artifactParam.metadata
        });
      } else {
        // Create new artifact
        record = await ArtifactModel.create({
          type,
          contentPath: '', // Temporary placeholder
          version: 1,
          tokenCount: artifactParam.tokenCount,
          mimeType: artifactParam.metadata?.mimeType,
          subtype,
          metadata: artifactParam.metadata
        });
        version = 1;
      }

      const artifact = {
        id: record.id,
        type,
        ...artifactParam,
      } as Artifact;
      
      const artifactDir = path.join(this.storageDir, record.id);
      
      
      const filePath = path.join(artifactDir, `${artifact.type}_v${version}.${fileInfo.extension}`);
      try {
        await this.fileQueue.enqueue(() =>
          fs.mkdir(artifactDir, { recursive: true })
        );
      } catch (error) {
        Logger.error('Error creating directory:', error);
      }

      // Validate content is not undefined or empty
      if (!artifact.content) {
        throw new Error(`Cannot save artifact ${artifact.id}: content is undefined or empty`);
      }

      // Ensure content is always a string or Buffer
      const content = typeof artifact.content === 'string' ?
        artifact.content :
        Buffer.isBuffer(artifact.content) ?
          artifact.content :
          JSON.stringify(artifact.content);

      // If it's a CSV, parse and store metadata
      if ((type === ArtifactType.Spreadsheet || mimeType === 'text/csv') && typeof content === 'string') {
        try {
          const lines = content.split('\n');
          const headers = lines[0].split(',');
          const rowCount = Math.max(0,lines.length - 1); // Exclude an assumed header row
          
          artifact.metadata = {
            ...artifact.metadata,
            csvHeaders: headers,
            rowCount
          };
        } catch (error) {
          Logger.error('Error parsing CSV metadata:', error);
        }
      }

      await this.fileQueue.enqueue(() =>
        //TODO: need to handle calendrevents
        fs.writeFile(filePath, Buffer.isBuffer(artifact.content) ? artifact.content : Buffer.from(artifact.content!))
      );

      // Create or update the artifact record
      // Update the record with the actual content path
      await record.update({
        contentPath: filePath
      });

      // Generate and store summary if LLM service is available
      if (this.llmService) {
        try {
          const summary = await this.generateSummary(artifact);
          if (summary) {
            await ArtifactModel.update(
              { metadata: { ...artifact.metadata, summary } },
              { where: { id: artifact.id } }
            );
          }
        } catch (error) {
          Logger.error('Error generating artifact summary:', error);
        }
      }

      await this.indexArtifact(artifact);
      
      return artifact;
    });
  }

  protected async indexArtifact(artifact: Artifact): Promise<void> {
    // Skip if mime type indicates non-text content
    const mimeType = artifact.metadata?.mimeType || '';
    if (mimeType.startsWith('image/') || 
        mimeType.startsWith('audio/') || 
        mimeType.startsWith('video/') ||
        mimeType === 'application/octet-stream') {
      Logger.info(`Skipping indexing of non-text artifact: ${artifact.id} (${mimeType})`);
      return;
    }

    let contentToIndex = artifact.content.toString();

    // Check token count before indexing
    const tokenCount = await this.vectorDb.getTokenCount(contentToIndex);
    if (tokenCount > 100000) { // Skip documents larger than 100k tokens
      Logger.warn(`Skipping indexing of large artifact: ${artifact.id} (${tokenCount} tokens)`);
      return;
    }

    // Extract text from PDF if the MIME type is application/pdf
    if (mimeType === 'application/pdf') {
      try {
        const pdfData = await fs.readFile(artifact.metadata?.url || artifact.metadata?.contentPath!);
        const pdfText = await pdf(pdfData);
        contentToIndex = pdfText.text;

        // Update metadata to include extracted text
        let metadata = await this.loadArtifactMetadata();
        metadata[artifact.id] = {
          ...metadata[artifact.id],
          extractedText: contentToIndex
        };
        await this.saveArtifactMetadata(metadata);
      } catch (error) {
        Logger.error('Error extracting text from PDF:', error);
        return;
      }
    }

    // Index text content into vector DB
    await this.vectorDb.handleContentChunks(
      contentToIndex,
      artifact.metadata?.url,
      artifact.metadata?.task,
      artifact.metadata?.projectId,
      artifact.metadata?.title,
      artifact.type,
      artifact.id
    );
  }

  async loadArtifact(artifactId: UUID, version?: number): Promise<Artifact | null> {
    if (artifactId === null || artifactId === undefined) {
      return null;
    }

    const record = await this.getArtifactRecord(artifactId);
    if (!record) {
      Logger.warn(`Artifact not found: ${artifactId}`);
      return null;
    }

    let contentPath = record.contentPath;
    if (version) {
      contentPath = path.join(this.storageDir, artifactId, `${record.type}_v${version}.md`);
    }

    try {
      const content = (await this.fileQueue.enqueue(() => fs.readFile(contentPath))).toString();
      return { 
        id: artifactId, 
        type: record.type as ArtifactType, 
        content, 
        metadata: record.metadata 
      };
    } catch (error) {
      if (asError(error).code === 'ENOENT') {
        Logger.warn(`Artifact file not found: ${contentPath}`);
        return null;
      }
      throw error; // Re-throw other errors
    }
  }

  async bulkLoadArtifacts(artifactsInput: (UUID | ArtifactItem)[]): Promise<Artifact[]> {
    const records = await ArtifactModel.findAll({
      where: {
        id: artifactsInput.map(input => typeof input === 'string' ? input : input.id)
      }
    });

    const artifacts: Artifact[] = [];

    // Create a list of read operations
    const readOperations = records.map(async record => {
      const contentPath = record.contentPath;
      try {
        const content = (await this.fileQueue.enqueue(() => fs.readFile(contentPath))).toString();
        return { 
          id: record.id, 
          type: record.type as ArtifactType, 
          content, 
          metadata: record.metadata 
        };
      } catch (error) {
        if (asError(error).code === 'ENOENT') {
          Logger.warn(`Artifact file not found: ${contentPath}`);
          return null;
        }
        throw error;
      }
    });

    // Execute all read operations in parallel
    const results = await Promise.all(readOperations);
    return results.filter(artifact => artifact !== null) as Artifact[];
  }

  async listArtifacts(): Promise<ArtifactItem[]> {
    const records = await this.getAllArtifactRecords();
    const artifacts: ArtifactItem[] = records.map(record => ({
      id: record.id,
      type: record.type as ArtifactType,
      metadata: record.metadata
    }));
    return artifacts;
  }

  async deleteArtifact(artifactId: string): Promise<void> {
    this.saveQueue.enqueue(async () => {
      // Check if artifact exists
      const record = await this.getArtifactRecord(artifactId);
      if (!record) {
        throw new Error(`Artifact ${artifactId} not found`);
      }

      try {
        // Get the artifact directory path
        const artifactDir = path.join(this.storageDir, artifactId);

        // Delete all files in the artifact directory
        await this.fileQueue.enqueue(() =>
          fs.rm(artifactDir, { recursive: true, force: true })
        );

        // Remove from database
        await ArtifactModel.destroy({ where: { id: artifactId } });

        // Remove from vector database
        try {
          await this.vectorDb.deleteDocuments({ artifactId });
        } catch (error) {
          Logger.error('Error deleting artifact from vector database:', error);
        }

        Logger.info(`Successfully deleted artifact: ${artifactId}`);
      } catch (error) {
        Logger.error('Error deleting artifact:', error);
        throw new Error(`Failed to delete artifact ${artifactId}: ${asError(error).message}`);
      }
    });
  }

  private async generateSummary(artifact: Artifact): Promise<string | null> {
    if (!this.llmService) return null;
    
    // Skip non-text artifacts
    const mimeType = artifact.metadata?.mimeType || '';
    if (mimeType.startsWith('image/') || 
        mimeType.startsWith('audio/') || 
        mimeType.startsWith('video/') ||
        mimeType === 'application/octet-stream') {
      return null;
    }

    try {
      const content = artifact.content.toString();
      const prompt = `Please generate a concise 2-3 sentence summary of the following content. Focus on the key points and main ideas:\n\n${content.substring(0, 8000)}`; // Limit to first 8000 chars

      const response = await this.llmService.sendLLMRequest<ModelMessageResponse>({
        messages: [{ role: 'user', content: prompt }],
        opts: {
          temperature: 0.2,
          maxPredictedTokens: 200
        },
        context: {
          agentName: "ArtifactManager",
          stepType: "generateSummary"
        }
      });

      return response.response.message;
    } catch (error) {
      Logger.error('Error generating summary:', error);
      return null;
    }
  }

  async indexArtifacts(reindex: boolean = false): Promise<void> {
    const artifacts = await this.listArtifacts();
    Logger.info(`Indexing ${artifacts.length} artifacts`);

    for (let i = 0; i < artifacts.length; i++) {
      const artifact = await this.loadArtifact(artifacts[i].id);
      if (artifact) {
        Logger.progress(`Indexing ${i} of ${artifacts.length} artifacts`, (i+1)/artifacts.length, "index-artifacts");
        await this.indexArtifact(artifact);
      } else {
        Logger.progress(`Skipping ${i} of ${artifacts.length} artifacts, content not available`, (i+1)/artifacts.length, "index-artifacts");
      }
    }

    Logger.info('Finished indexing artifacts');
  }

  /**
   * Search for artifacts using vector similarity
   * @param query The search query text
   * @param filter Optional filter criteria for metadata
   * @param limit Maximum number of results to return (default: 5)
   * @param minScore Minimum similarity score (0-1) for results (default: 0.5)
   * @returns Array of matching artifacts with their similarity scores
   */
  async searchArtifacts(
    query: string,
    filter?: Record<string, any>,
    limit: number = 5, 
    minScore: number = 0.5
  ): Promise<Array<{ artifact: ArtifactItem, score: number }>> {
    try {
      // Convert filter to vector DB query format
      const where: Record<string, any> = {};
      if (filter) {
        for (const [key, value] of Object.entries(filter)) {
          if (Array.isArray(value)) {
            // Handle array values with $in operator
            where[key] = { $in: value };
          } else if (typeof value === 'object' && value !== null) {
            // Handle nested objects
            where[key] = value;
          } else {
            // Handle simple equality with $eq operator
            where[key] = { $eq: value };
          }
        }
      }

      // Search the vector database
      let results;
      try {
        results = await this.vectorDb.query([query], where, limit);
      } catch (e) {
        const message = `Vectra search failed: ${asError(e).message} for "${query}" and where clause "${JSON.stringify(where, null, 2)}" with limit ${limit}`;
        Logger.error(message, e)
        throw new Error(message);
      }

      // Map results to artifacts with scores
      const artifacts: Array<{ artifact: ArtifactItem, score: number }> = [];
      for (const result of results) {
        if (result.score >= minScore) {
          const artifact = await this.loadArtifact(result.metadata.artifactId as UUID);
          if (!artifact) {
            Logger.warn(`Artifact not found in database: ${result.metadata.artifactId}`);
            continue;
          }
          if (artifact) {
            artifacts.push({
              artifact: {
                id: artifact.id,
                type: artifact.type,
                metadata: artifact.metadata
              },
              score: result.score
            });
          }
        }
      }

      // Sort by score descending
      artifacts.sort((a, b) => b.score - a.score);

      return artifacts;
    } catch (error) {
      Logger.error('Error searching artifacts:', error);
      throw new Error(`Failed to search artifacts: ${asError(error).message}`);
    }
  }
}
