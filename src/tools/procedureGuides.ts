import Logger from "src/helpers/logger";
import { ArtifactManager } from "./artifactManager";
import fs from "node:fs";
import { ArtifactType } from "./artifact";
import { createUUID } from "src/types/uuid";
import path from "node:path";

export async function loadProcedureGuides(basePath: string, guidePath: string, artifactManager: ArtifactManager): Promise<void> {
    const guidesDir = path.join(basePath, guidePath);
    if (!fs.existsSync(guidesDir)) {
        Logger.warn(`Procedure guides directory not found at ${guidesDir}`);
        return;
    }

    const files = fs.readdirSync(guidesDir);
    const markdownFiles = files.filter(f => path.extname(f).toLowerCase() === '.md');

    // Get existing guides from artifact manager
    const existingGuides = await artifactManager.getArtifacts({ type: ArtifactType.ProcedureGuide });
    const existingGuideMap = new Map(existingGuides.map(g => [g.metadata?.source, g]));

    for (let i = 0; i < markdownFiles.length; i++) {
        const file = markdownFiles[i];
        Logger.progress(`Loading agent procedures (${i + 1} of ${markdownFiles.length})`, (i + 1) / markdownFiles.length, "agent-procedures");
        const filePath = path.join(guidesDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const contentHash = require('crypto').createHash('sha256').update(content).digest('hex');

        // Check if guide exists and has same content
        const relativePath = path.relative(basePath, filePath);
        const existingGuide = existingGuideMap.get(relativePath);
        if (existingGuide) {
            const existingHash = existingGuide.metadata?.contentHash;
            if (existingHash === contentHash) {
                Logger.info(`Procedure guide unchanged: ${file}`);
                continue;
            }
            Logger.info(`Updating procedure guide: ${file}`);
        }
        const artifactId = createUUID();

        // Try to load metadata file if it exists
        const metadataPath = path.join(guidesDir, `${path.basename(file, '.md')}.metadata.json`);
        let metadata: Record<string, any> = {
            title: path.basename(file, '.md'),
            mimeType: 'text/markdown',
            description: 'Procedure guide document',
            created: new Date().toISOString(),
            source: path.relative(basePath, filePath),
            contentHash: contentHash
        };

        if (fs.existsSync(metadataPath)) {
            try {
                const loadedMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
                metadata = { ...metadata, ...loadedMetadata };
            } catch (error) {
                Logger.warn(`Failed to load metadata from ${metadataPath}: ${error}`);
            }
        }

        await artifactManager.saveArtifact({
            id: artifactId,
            type: ArtifactType.ProcedureGuide,
            content: content,
            metadata: metadata
        });

        Logger.info(`Loaded procedure guide: ${file}`);
    }
}