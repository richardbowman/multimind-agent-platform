import Logger from "src/helpers/logger";
import { ArtifactManager } from "./artifactManager";
import fs from "node:fs";
import { ArtifactType, SpreadsheetSubType } from "./artifact";
import { createUUID } from "src/types/uuid";
import path from "node:path";
import * as yaml from 'js-yaml';

export async function loadProcedureGuides(basePath: string, guidePath: string, artifactManager: ArtifactManager): Promise<void> {
    const guidesDir = path.join(basePath, guidePath);
    if (!fs.existsSync(guidesDir)) {
        Logger.warn(`Procedure guides directory not found at ${guidesDir}`);
        return;
    }

    const files = fs.readdirSync(guidesDir);
    const supportedFiles = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ext === '.md' || ext === '.csv';
    });

    // Get existing guides from artifact manager
    const existingGuides = await artifactManager.getArtifacts({ type: ArtifactType.ProcedureGuide });
    const existingTables = await artifactManager.getArtifacts({ type: ArtifactType.Spreadsheet });
    const existingGuideMap = new Map([...existingGuides, ...existingTables].map(g => [g.metadata?.source, g]));

    for (let i = 0; i < supportedFiles.length; i++) {
        const file = supportedFiles[i];
        Logger.progress(`Loading agent procedures (${i + 1} of ${supportedFiles.length})`, (i + 1) / supportedFiles.length, "agent-procedures");
        const filePath = path.join(guidesDir, file);
        let content = fs.readFileSync(filePath, 'utf-8');
        let frontmatter = {};
        
        // Extract YAML front matter if present
        const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
        const match = content.match(frontmatterRegex);
        if (match) {
            try {
                frontmatter = yaml.load(match[1]) || {};
                // Remove the frontmatter from the content
                content = content.slice(match[0].length);
            } catch (error) {
                Logger.warn(`Failed to parse YAML frontmatter in ${file}: ${error}`);
            }
        }

        // Determine artifact type based on file extension
        const ext = path.extname(file).toLowerCase();
        const artifactType = ext === '.csv' ? ArtifactType.Spreadsheet : ArtifactType.ProcedureGuide;
        
        const contentHash = require('crypto').createHash('sha256').update(content).digest('hex');

        // Check if guide exists and has same content
        // Use the same key for both markdown and CSV by removing the extension
        const relativePath = path.relative(basePath, filePath);
        const basePathKey = relativePath.replace(/\.(md|csv)$/, '');
        const existingGuide = existingGuideMap.get(basePathKey);
        if (existingGuide) {
            const existingHash = existingGuide.metadata?.contentHash;
            if (existingHash === contentHash) {
                Logger.info(`Procedure guide unchanged: ${file}`);
                continue;
            }
            Logger.info(`Updating procedure guide: ${file}`);
        }

        // Try to load metadata file if it exists
        const metadataPath = path.join(guidesDir, `${path.basename(file, '.md')}.metadata.json`);
        // Start with YAML frontmatter as base metadata
        let metadata: Record<string, any> = {
            ...frontmatter,
            title: frontmatter['title'] || path.basename(file, '.md'),
            mimeType: 'text/markdown',
            description: frontmatter['description'] || 'Procedure guide document',
            created: frontmatter['created'] || new Date().toISOString(),
            source: path.relative(basePath, filePath).replace(/\.(md|csv)$/, ''),
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

        try {
            await artifactManager.saveArtifact({
                type: artifactType,
                mimeType: ext === '.csv' ? 'text/csv' : 'text/markdown',
                content: content,
                metadata: metadata
            });

            Logger.info(`Loaded procedure guide: ${file}`);
        } catch (e) {
            Logger.error(`Failed to save procedure guide ${file}`, e);
        }
    }
}
