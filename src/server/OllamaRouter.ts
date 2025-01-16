import express from 'express';
import { BackendServices } from '../types/BackendServices';
import Logger from '../helpers/logger';

export class OllamaRouter {
    private router = express.Router();
    private services: BackendServices;

    constructor(services: BackendServices) {
        this.services = services;
        this.setupRoutes();
    }

    private setupRoutes() {
        // Main generation endpoint
        this.router.post('/api/generate', async (req, res) => {
            try {
                const { model, prompt, system, options } = req.body;
                
                Logger.info(`Ollama API request - Model: ${model}, Prompt length: ${prompt.length}`);
                
                // Convert Ollama request to our internal format
                const response = await this.services.llmService.sendLLMRequest({
                    messages: [{ role: 'user', content: prompt }],
                    systemPrompt: system,
                    opts: {
                        temperature: options?.temperature,
                        topP: options?.top_p,
                        maxPredictedTokens: options?.num_predict
                    }
                });

                // Stream the response in Ollama format
                res.write(JSON.stringify({
                    model,
                    created_at: new Date().toISOString(),
                    response: response.message,
                    done: true
                }));
                
                res.end();
            } catch (error) {
                Logger.error(`Ollama API error: ${error.message}`);
                res.status(500).json({ error: error.message });
            }
        });

        // Model listing endpoint
        this.router.get('/api/tags', async (req, res) => {
            try {
                const models = await this.services.llmService.getAvailableModels();
                res.json({
                    models: models.map(m => ({
                        name: m.id,
                        modified_at: new Date().toISOString(),
                        size: 0, // Placeholder
                        digest: 'sha256:placeholder' // Placeholder
                    }))
                });
            } catch (error) {
                Logger.error(`Ollama tags error: ${error.message}`);
                res.status(500).json({ error: error.message });
            }
        });
    }

    public getRouter() {
        return this.router;
    }
}
