import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Logger from '../helpers/logger';
import ChromaDBService from '../llm/chromaService';
import { Artifact } from './artifact';

export class ArtifactManager {
  private storageDir: string;
  private artifactMetadataFile: string;
  private chromaService: ChromaDBService;

  constructor(chromaService: ChromaDBService, storageDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.output')) {
    this.storageDir = storageDir;
    this.artifactMetadataFile = path.join(this.storageDir, 'artifact.json');
    this.chromaService = chromaService;

    // Ensure the .output directory exists
    fs.mkdir(this.storageDir, { recursive: true }).catch(err => Logger.error('Error creating output directory:', err));
  }

  private async loadArtifactMetadata(): Promise<Record<string, any>> {
    try {
      const data = await fs.readFile(this.artifactMetadataFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {}; // Return an empty object if the metadata file does not exist
      }
      Logger.error('Error loading artifact metadata:', error);
      throw error;
    }
  }

  private async saveArtifactMetadata(metadata: Record<string, any>): Promise<void> {
    await fs.writeFile(this.artifactMetadataFile, JSON.stringify(metadata, null, 2));
  }

  async saveArtifact(artifact: Artifact): Promise<void> {
    const artifactDir = path.join(this.storageDir, artifact.id);

    // Load existing metadata
    let metadata = await this.loadArtifactMetadata();
    let version = 1;
    if (metadata[artifact.id]) {
      const existingVersion = metadata[artifact.id].version || 0;
      version = existingVersion + 1;
    }

    try {
      await fs.mkdir(artifactDir, { recursive: true });
    } catch (error) {
      Logger.error('Error creating directory:', error);
    }

    const filePath = path.join(artifactDir, `${artifact.type}_v${version}.md`);
    await fs.writeFile(filePath, Buffer.isBuffer(artifact.content) ? artifact.content : Buffer.from(artifact.content));

    // Update or add the artifact metadata
    metadata[artifact.id] = {
      contentPath: filePath,
      type: artifact.type,
      version,
      ...artifact.metadata // Include additional metadata attributes if any
    };

    // Save updated metadata
    await this.saveArtifactMetadata(metadata);

    // Index the artifact into Chroma
    await this.chromaService.handleContentChunks(
      artifact.content.toString(),
      `artifact://${artifact.id}`,
      'summary',
      artifact.metadata?.title,
      artifact.type
    );
  }

  async loadArtifact(artifactId: string, version?: number): Promise<Artifact | null> {
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
      const content = await fs.readFile(contentPath);
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

  async indexArtifacts(): Promise<void> {
    const artifacts = await this.listArtifacts();
    for (const artifact of artifacts) {
      await this.chromaService.handleContentChunks(
        artifact.content.toString(),
        `artifact://${artifact.id}`,
        'summary',
        artifact.id,
        artifact.type
      );
    }
  }
}