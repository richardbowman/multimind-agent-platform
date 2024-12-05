// src/artifacts/ArtifactManager.ts (updated)
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Logger from '../helpers/logger';
import ChromaDBService, { Artifact } from '../llm/chromaService';

export class ArtifactManager {
  private storageDir: string;
  private chromaService: ChromaDBService;

  constructor(chromaService: ChromaDBService, storageDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.output')) {
    this.storageDir = storageDir;
    this.chromaService = chromaService;
  }

  async saveArtifact(artifact: Artifact): Promise<void> {
    const artifactDir = path.join(this.storageDir, artifact.id, artifact.type);
    try {
      await fs.mkdir(artifactDir, { recursive: true });
    } catch (error) {
      // ignore
      Logger.error('Error creating directory:', error);
    }

    const filePath = path.join(artifactDir, `${artifact.type}.md`);
    await fs.writeFile(filePath, Buffer.isBuffer(artifact.content) ? artifact.content : Buffer.from(artifact.content));

    // Index the artifact into Chroma
    await this.chromaService.handleContentChunks(
      artifact.content.toString(),
      `artifact://${artifact.id}`,
      'summary',
      artifact.id,
      artifact.type
    );
  }

  async loadArtifact(artifactId: string, artifactType: string): Promise<Artifact | null> {
    const filePath = path.join(this.storageDir, artifactId, artifactType, `${artifactType}.md`);
    try {
      const content = await fs.readFile(filePath);
      return { id: artifactId, type: artifactType, content };
    } catch (error) {
      if (error.code === 'ENOENT') {
        Logger.warn(`Artifact not found: ${filePath}`);
        return null;
      }
      throw error; // Re-throw other errors
    }
  }

  async listArtifacts(): Promise<Artifact[]> {
    const artifacts: Artifact[] = [];
    try {
      const entries = await fs.readdir(this.storageDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const artifactId = entry.name;
          const typeEntries = await fs.readdir(path.join(this.storageDir, artifactId), { withFileTypes: true });
          for (const typeEntry of typeEntries) {
            if (typeEntry.isDirectory()) {
              const artifactType = typeEntry.name;
              const filePath = path.join(this.storageDir, artifactId, artifactType, `${artifactType}.md`);
              try {
                const content = await fs.readFile(filePath);
                artifacts.push({ id: artifactId, type: artifactType, content });
              } catch (error) {
                Logger.warn(`Artifact not found: ${filePath}`);
              }
            }
          }
        }
      }
    } catch (error) {
      Logger.error('Error listing artifacts:', error);
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