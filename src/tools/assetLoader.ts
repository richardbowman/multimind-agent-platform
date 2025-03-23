import Logger from "src/helpers/logger";
import { ArtifactManager } from "./artifactManager";
import fs from "node:fs";
import { ArtifactType, DocumentSubtype, SpreadsheetSubType, Artifact, ArtifactItem, ArtifactMetadata } from "./artifact";
import { createUUID } from "src/types/uuid";
import path from "node:path";
import * as yaml from 'js-yaml';

interface AssetLoaderOptions {
    artifactType: ArtifactType;
    artifactSubtype: DocumentSubtype | SpreadsheetSubType;
    fileFilter?: (filename: string) => boolean;
    metadataBuilder?: (filePath: string, content: string) => Record<string, any>;
    contentProcessor?: (content: string) => string;
}

async function loadAssets(
    basePath: string,
    assetPath: string,
    artifactManager: ArtifactManager,
    options: AssetLoaderOptions
): Promise<Artifact[]> {
    const assetsDir = path.join(basePath, assetPath);
    if (!fs.existsSync(assetsDir)) {
        Logger.warn(`Assets directory not found at ${assetsDir}`);
        return [];
    }

    const files = fs.readdirSync(assetsDir).filter(options.fileFilter || (f => true));
    const loadedAssets: Artifact[] = [];

    // Get existing assets from artifact manager
    const existingAssets = await artifactManager.getArtifacts({ 
        type: options.artifactType, 
        subtype: options.artifactSubtype 
    });
    const existingAssetMap = new Map(existingAssets.map(a => [a.metadata?.source, a]));

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        Logger.progress(`Loading assets (${i + 1} of ${files.length})`, (i + 1) / files.length, options.artifactSubtype);
        
        const filePath = path.join(assetsDir, file);
        let content = fs.readFileSync(filePath, 'utf-8');
        
        // Build base metadata
        let metadata: Record<string, any> = {
            type: options.artifactType,
            subtype: options.artifactSubtype,
            title: path.basename(file, path.extname(file)),
            source: path.relative(basePath, filePath),
            contentHash: require('crypto').createHash('sha256').update(content).digest('hex')
        };

        // Apply custom metadata builder if provided
        if (options.metadataBuilder) {
            metadata = { ...metadata, ...options.metadataBuilder(filePath, content) };
        }

        // Process content if needed
        if (options.contentProcessor) {
            content = options.contentProcessor(content);
        }

        // Check if asset exists and has same content
        const relativePath = path.relative(basePath, filePath);
        const existingAsset = existingAssetMap.get(relativePath);
        if (existingAsset) {
            const existingHash = existingAsset.metadata?.contentHash;
            if (existingHash === metadata.contentHash) {
                Logger.info(`${options.artifactSubtype} unchanged: ${file}`);
                loadedAssets.push(existingAsset);
                continue;
            }
            Logger.info(`Updating ${options.artifactSubtype}: ${file}`);
        }

        try {
            const artifact = await artifactManager.saveArtifact({
                ...existingAsset?.id ? { id: existingAsset.id } : {},
                type: options.artifactType,
                content: content,
                metadata: metadata
            });
            loadedAssets.push(artifact);
            Logger.info(`Loaded ${options.artifactSubtype}: ${file}`);
        } catch (e) {
            Logger.error(`Failed to save ${options.artifactSubtype} ${file}`, e);
        }
    }

    return loadedAssets;
}

export async function loadTemplates(basePath: string, templatePath: string, artifactManager: ArtifactManager): Promise<(Artifact|ArtifactItem)[]> {
    return loadAssets(basePath, templatePath, artifactManager, {
        artifactType: ArtifactType.Document,
        artifactSubtype: DocumentSubtype.Template,
        fileFilter: f => f.endsWith('.md'),
        metadataBuilder: (filePath, content) => {
            const metadata: Record<string, any> = {};
            const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
            const match = content.match(frontmatterRegex);
            
            if (match) {
                try {
                    const parsedMetadata = yaml.load(match[1]) || {};
                    Object.assign(metadata, parsedMetadata);
                } catch (error) {
                    Logger.warn(`Failed to parse YAML frontmatter in ${filePath}: ${error}`);
                }
            }
            return metadata;
        },
        contentProcessor: (content) => {
            const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
            const match = content.match(frontmatterRegex);
            return match ? content.slice(match[0].length) : content;
        }
    });
}

export async function loadAgentConfigs(basePath: string, configPath: string, artifactManager: ArtifactManager): Promise<Artifact[]> {
    return loadAssets(basePath, configPath, artifactManager, {
        artifactType: ArtifactType.Document,
        artifactSubtype: DocumentSubtype.AgentConfig,
        fileFilter: f => f.endsWith('.md'),
        metadataBuilder: (filePath, content) => {
            const metadata: Record<string, any> = {};
            const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
            const match = content.match(frontmatterRegex);
            
            if (match) {
                try {
                    const parsedMetadata = yaml.load(match[1]) || {};
                    Object.assign(metadata, parsedMetadata);
                } catch (error) {
                    Logger.warn(`Failed to parse YAML frontmatter in ${filePath}: ${error}`);
                }
            }
            return metadata;
        },
        contentProcessor: (content) => {
            const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
            const match = content.match(frontmatterRegex);
            return match ? content.slice(match[0].length) : content;
        }
    });
}

export async function loadProcedureGuides(basePath: string, guidePath: string, artifactManager: ArtifactManager): Promise<Artifact[]> {
    const loadedArtifacts: Artifact[] = [];
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
                loadedArtifacts.push(existingGuide);
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
            const artifact = await artifactManager.saveArtifact({
                ...existingGuide?.id?{id: existingGuide?.id}:{},
                type: artifactType,
                content: content,
                metadata: metadata
            });

            loadedArtifacts.push(artifact);
            Logger.info(`Loaded procedure guide: ${file}`);
        } catch (e) {
            Logger.error(`Failed to save procedure guide ${file}`, e);
        }
    }

    // Generate the actions artifact from the loaded guides
    const actionsGuide = loadedArtifacts.find(a => a.metadata?.source?.endsWith('actions.md'));
    if (actionsGuide) {
        await generateActionsArtifact(actionsGuide, artifactManager);
    }

    return loadedArtifacts;
}

async function generateActionsArtifact(actionsGuide: Artifact, artifactManager: ArtifactManager): Promise<void> {
    // Parse the markdown table
    const content = actionsGuide.content.toString();
    const tableRegex = /^\|.*\|.*\|.*\|\n\|.*\|.*\|.*\|\n((?:\|.*\|.*\|.*\|\n)*)/m;
    const match = content.match(tableRegex);
    
    if (!match) {
        Logger.warn('Could not find action table in actions guide');
        return;
    }

    const tableRows = match[1].trim().split('\n');
    const actions = tableRows.map(row => {
        const cells = row.split('|').map(c => c.trim()).filter(c => c);
        return {
            typeKey: cells[0],
            className: cells[1],
            description: cells[2]
        };
    });

    // Create metadata
    const metadata: ArtifactMetadata = {
        title: 'Action Reference',
        description: 'A comprehensive list of all supported agent actions',
        source: 'generated://actions-reference',
        contentHash: require('crypto').createHash('sha256').update(JSON.stringify(actions)).digest('hex'),
        generatedFrom: actionsGuide.id
    };

    // Check if we already have this artifact
    const existingArtifacts = await artifactManager.getArtifacts({ 
        type: ArtifactType.Document, 
        subtype: DocumentSubtype.Procedure 
    });
    const existingArtifact = existingArtifacts.find(a => a.metadata?.source === 'generated://actions-reference');

    try {
        if (existingArtifact?.metadata?.contentHash !== metadata.contentHash) {
            await artifactManager.saveArtifact({
                ...existingArtifact?.id ? { id: existingArtifact.id } : {},
                type: ArtifactType.Document,
                content: JSON.stringify(actions, null, 2),
                metadata: {
                    ...metadata,
                    subtype: DocumentSubtype.Procedure
                }
            });
        }
        Logger.info('Generated actions reference artifact');
    } catch (e) {
        Logger.error('Failed to generate actions reference artifact', e);
    }
}
