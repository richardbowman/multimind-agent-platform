import * as fs from 'fs/promises';
import * as path from 'path';
import { getDataPath } from '../helpers/paths';
import Logger from '../helpers/logger';
import { IVectorDatabase } from '../llm/IVectorDatabase';
import { Artifact, ArtifactItem } from './artifact';
import { AsyncQueue } from '../helpers/asyncQueue';
import { asUUID, createUUID, UUID } from 'src/types/uuid';
import * as pdf from 'pdf-parse';
import { asError, isError } from 'src/types/types';

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
  private artifactMetadataFile: string;
  private vectorDb: IVectorDatabase;
  private fileQueue: AsyncQueue;

  constructor(vectorDb: IVectorDatabase, storageDir?: string) {
    this.storageDir = storageDir || path.join(getDataPath(), 'artifacts');
    this.artifactMetadataFile = path.join(this.storageDir, 'artifact.json');
    this.vectorDb = vectorDb;
    this.fileQueue = new AsyncQueue();

    // Ensure the .output directory exists
    this.fileQueue.enqueue(() =>
      fs.mkdir(this.storageDir, { recursive: true })
    ).catch(err => Logger.error('Error creating output directory:', err));
  }

  async getArtifacts(filter: { type?: string } = {}): Promise<ArtifactItem[]> {
    const artifacts = await this.listArtifacts();

    if (filter.type) {
      return artifacts.filter(artifact => artifact.type === filter.type);
    }

    return artifacts;
  }

  private async loadArtifactMetadata(): Promise<Record<string, any>> {
    try {
      const data = await this.fileQueue.enqueue(() =>
        fs.readFile(this.artifactMetadataFile, 'utf-8')
      );
      return JSON.parse(data);
    } catch (error) {
      if (asError(error).code === 'ENOENT') {
        // Create initial empty metadata file
        const emptyMetadata = {};
        await this.saveArtifactMetadata(emptyMetadata);
        return emptyMetadata;
      }
      Logger.error('Error loading artifact metadata:', error);
      throw error;
    }
  }

  private async saveArtifactMetadata(metadata: Record<string, any>): Promise<void> {
    await this.fileQueue.enqueue(() =>
      fs.writeFile(this.artifactMetadataFile, JSON.stringify(metadata, null, 2))
    );
  }

  async saveArtifact(artifactParam: Partial<Artifact>): Promise<Artifact> {
    // Set type based on MIME type if provided
    const mimeType = artifactParam.metadata?.mimeType;
    const fileInfo = getFileInfo(mimeType);
    // Use the type from fileInfo if no type was explicitly set
    const type = artifactParam.type || fileInfo.type || 'file';
    
    const artifact = {
      id: createUUID(),
      type,
      ...artifactParam,
    } as Artifact;
    
    const artifactDir = path.join(this.storageDir, artifact.id);
    
    // Load existing metadata
    let metadata = await this.loadArtifactMetadata();
    let version = 1;
    if (metadata[artifact.id]) {
      const existingVersion = metadata[artifact.id].version || 0;
      version = existingVersion + 1;
    }
    
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

    await this.fileQueue.enqueue(() =>
      //TODO: need to handle calendrevents
      fs.writeFile(filePath, Buffer.isBuffer(artifact.content) ? artifact.content : Buffer.from(artifact.content!))
    );

    // Update or add the artifact metadata
    metadata[artifact.id] = {
      ...artifact.metadata, // Include additional metadata attributes if any
      contentPath: filePath,
      type: artifact.type,
      version,
      tokenCount: artifact.tokenCount,
      mimeType: artifact.metadata?.mimeType
    };

    // Save updated metadata
    await this.saveArtifactMetadata(metadata);

    await this.indexArtifact(artifact);

    return artifact;
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

    const metadata = await this.loadArtifactMetadata();
    if (!metadata[artifactId]) {
      Logger.warn(`Artifact not found in metadata: ${artifactId}`);
      return null;
    }

    let contentPath = metadata[artifactId].contentPath;
    if (version) {
      contentPath = path.join(this.storageDir, artifactId, `${metadata[artifactId].type}_v${version}.md`);
    }

    try {
      const content = (await this.fileQueue.enqueue(() => fs.readFile(contentPath))).toString();
      const type = metadata[artifactId].type; // Retrieve the artifact type from metadata
      return { id: artifactId, type, content, metadata: metadata[artifactId] };
    } catch (error) {
      if (asError(error).code === 'ENOENT') {
        Logger.warn(`Artifact file not found: ${contentPath}`);
        return null;
      }
      throw error; // Re-throw other errors
    }
  }

  async listArtifacts(): Promise<ArtifactItem[]> {
    const metadata = await this.loadArtifactMetadata();
    const artifacts: ArtifactItem[] = [];
    for (const artifactId in metadata) {
      try {
        const uuid = asUUID(artifactId);
        const type = metadata[uuid].type; // Retrieve the artifact type from metadata
        artifacts.push({ id: uuid, type, metadata: metadata[uuid] });
      } catch (error) {
        Logger.verbose(`Artifact not loadable: ${artifactId}`, error);
      }
    }
    return artifacts;
  }

  async deleteArtifact(artifactId: string): Promise<void> {
    // Load current metadata
    const metadata = await this.loadArtifactMetadata();

    // Check if artifact exists
    if (!metadata[artifactId]) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    try {
      // Get the artifact directory path
      const artifactDir = path.join(this.storageDir, artifactId);

      // Delete all files in the artifact directory
      await this.fileQueue.enqueue(() =>
        fs.rm(artifactDir, { recursive: true, force: true })
      );

      // Remove from metadata
      delete metadata[artifactId];
      await this.saveArtifactMetadata(metadata);

      // Remove from Chroma if it exists

      Logger.info(`Successfully deleted artifact: ${artifactId}`);
    } catch (error) {
      Logger.error('Error deleting artifact:', error);
      throw new Error(`Failed to delete artifact ${artifactId}: ${asError(error).message}`);
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
}
