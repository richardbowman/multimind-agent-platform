import Logger from "src/helpers/logger";
import { ArtifactManager } from "./artifactManager";
import fs from "node:fs";
import { ArtifactType, DocumentSubtype, SpreadsheetSubType, Artifact } from "./artifact";
import { createUUID } from "src/types/uuid";
import path from "node:path";
import * as yaml from 'js-yaml';

export async function loadTemplates(basePath: string, templatePath: string, artifactManager: ArtifactManager): Promise<Artifact[]> {
    const templatesDir = path.join(basePath, templatePath);
    if (!fs.existsSync(templatesDir)) {
        Logger.warn(`Templates directory not found at ${templatesDir}`);
        return [];
    }

    const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.md'));
    const loadedTemplates: Artifact[] = [];

    // Get existing templates from artifact manager
    const existingTemplates = await artifactManager.getArtifacts({ type: ArtifactType.Document, subtype: DocumentSubtype.Template });
    const existingTemplateMap = new Map(existingTemplates.map(t => [t.metadata?.source, t]));

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        Logger.progress(`Loading templates (${i + 1} of ${files.length})`, (i + 1) / files.length, "templates");
        
        const filePath = path.join(templatesDir, file);
        let content = fs.readFileSync(filePath, 'utf-8');
        
        // Extract YAML front matter
        const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
        const match = content.match(frontmatterRegex);
        let metadata: Record<string, any> = {
            type: ArtifactType.Document,
            subtype: DocumentSubtype.Template,
            title: path.basename(file, '.md'),
            source: path.relative(basePath, filePath),
            contentHash: require('crypto').createHash('sha256').update(content).digest('hex')
        };

        if (match) {
            try {
                const parsedMetadata = yaml.load(match[1]) || {};
                metadata = { ...metadata, ...parsedMetadata };
                // Remove the frontmatter from the content
                content = content.slice(match[0].length);
            } catch (error) {
                Logger.warn(`Failed to parse YAML frontmatter in ${file}: ${error}`);
            }
        }

        // Check if template exists and has same content
        const relativePath = path.relative(basePath, filePath);
        const existingTemplate = existingTemplateMap.get(relativePath);
        if (existingTemplate) {
            const existingHash = existingTemplate.metadata?.contentHash;
            if (existingHash === metadata.contentHash) {
                Logger.info(`Template unchanged: ${file}`);
                loadedTemplates.push(existingTemplate);
                continue;
            }
            Logger.info(`Updating template: ${file}`);
        }

        try {
            const artifact = await artifactManager.saveArtifact({
                type: ArtifactType.Document,
                content: content,
                metadata: metadata
            });
            loadedTemplates.push(artifact);
            Logger.info(`Loaded template: ${file}`);
        } catch (e) {
            Logger.error(`Failed to save template ${file}`, e);
        }
    }

    return loadedTemplates;
}

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
    const existingGuides = await artifactManager.getArtifacts({ type: ArtifactType.Document });
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
        const artifactType = ext === '.csv' ? ArtifactType.Spreadsheet : ArtifactType.Document;
        
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
            subtype: ext === '.csv' ? SpreadsheetSubType.Procedure : DocumentSubtype.Procedure,
            title: frontmatter['title'] || path.basename(file, '.md'),
            description: 'Procedure guide document',
            ...frontmatter,
            mimeType: ext === '.csv' ? 'text/csv' : 'text/markdown',
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
                content: content,
                metadata: metadata
            });

            Logger.info(`Loaded procedure guide: ${file}`);
        } catch (e) {
            Logger.error(`Failed to save procedure guide ${file}`, e);
        }
    }
}
