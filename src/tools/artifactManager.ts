import * as fs from 'fs/promises';
import * as path from 'path';
import { getDataPath } from '../helpers/paths';
import Logger from '../helpers/logger';
import { IVectorDatabase } from '../llm/IVectorDatabase';
import { Artifact } from './artifact';
import { AsyncQueue } from '../helpers/asyncQueue';

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

  async getArtifacts(filter: { type?: string } = {}): Promise<Artifact[]> {
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
      if (error.code === 'ENOENT') {
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

  async saveArtifact(artifact: Artifact): Promise<Artifact> {
    const artifactDir = path.join(this.storageDir, artifact.id);

    // Load existing metadata
    let metadata = await this.loadArtifactMetadata();
    let version = 1;
    if (metadata[artifact.id]) {
      const existingVersion = metadata[artifact.id].version || 0;
      version = existingVersion + 1;
    }

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

    const filePath = path.join(artifactDir, `${artifact.type}_v${version}.md`);
    await this.fileQueue.enqueue(() =>
      fs.writeFile(filePath, Buffer.isBuffer(artifact.content) ? artifact.content : Buffer.from(artifact.content))
    );

    // Update or add the artifact metadata
    metadata[artifact.id] = {
      contentPath: filePath,
      type: artifact.type,
      version,
      tokenCount: artifact.tokenCount,
      ...artifact.metadata // Include additional metadata attributes if any
    };

    // Save updated metadata
    await this.saveArtifactMetadata(metadata);

    await this.indexArtifact(artifact);

    return artifact;
  }

  protected async indexArtifact(artifact: Artifact): Promise<void> {
    // Index the artifact into Chroma
    await this.vectorDb.handleContentChunks(
      artifact.content.toString(),
      artifact.metadata?.url,
      artifact.metadata?.task,
      artifact.metadata?.projectId,
      artifact.metadata?.title,
      artifact.type,
      artifact.id
    );
  }

  async loadArtifact(artifactId: string, version?: number): Promise<Artifact | undefined> {
    if (artifactId === null || artifactId === undefined) {
      return;
    }

    const metadata = await this.loadArtifactMetadata();
    if (!metadata[artifactId]) {
      Logger.warn(`Artifact not found in metadata: ${artifactId}`);
      return undefined;
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
      if (error.code === 'ENOENT') {
        Logger.warn(`Artifact file not found: ${contentPath}`);
        return null;
      }
      throw error; // Re-throw other errors
    }
  }

  async listArtifacts(): Promise<Artifact[]> {
    const metadata = await this.loadArtifactMetadata();
    const artifacts: Artifact[] = [];
    for (const artifactId in metadata) {
      const contentPath = metadata[artifactId].contentPath;
      try {
        const content = await fs.readFile(contentPath);
        const type = metadata[artifactId].type; // Retrieve the artifact type from metadata
        artifacts.push({ id: artifactId, type, content, metadata: metadata[artifactId] });
      } catch (error) {
        Logger.warn(`Artifact file not found: ${contentPath}`);
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
      throw new Error(`Failed to delete artifact ${artifactId}: ${error.message}`);
    }
  }

  async indexArtifacts(reindex: boolean = false): Promise<void> {
    const artifacts = await this.listArtifacts();
    Logger.info(`Indexing ${artifacts.length} artifacts`);

    for (let i = 0; i < artifacts.length; i++) {
      Logger.progress(`Indexing ${i} of ${artifacts.length} artifacts`, i/artifacts.length)
      await this.indexArtifact(artifacts[i]);
    }

    Logger.info('Finished indexing artifacts');
  }
}
