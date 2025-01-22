import { ValidationExecutor } from '../src/agents/executors/ValidationExecutor';
import { ExecuteParams } from '../src/agents/interfaces/ExecuteParams';
import { StepResult } from '../src/agents/interfaces/StepResult';
import { ModelHelpers } from '../src/llm/modelHelpers';
import { TaskManager } from '../src/tools/taskManager';
import { Artifact } from '../src/tools/artifact';
import { createUUID } from '../src/types/uuid';
import Logger from '../src/helpers/logger';
import { ChatClient } from '../src/chat/chatClient';
import { ILLMService } from '../src/llm/ILLMService';
import { IVectorDatabase } from '../src/llm/IVectorDatabase';
import { ArtifactManager } from '../src/tools/artifactManager';
import { Settings } from '../src/tools/settings';

import Logger from '../src/helpers/logger';

// Mock the Logger
jest.mock('../src/helpers/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

const mockLogger = Logger as jest.Mocked<typeof Logger>;

describe('ValidationExecutor', () => {
    let executor: ValidationExecutor;
    let mockModelHelpers: jest.Mocked<ModelHelpers>;
    let mockTaskManager: jest.Mocked<TaskManager>;

    beforeEach(() => {
        mockModelHelpers = {
            generate: jest.fn(),
            setPurpose: jest.fn(),
            getPurpose: jest.fn(),
            getFinalInstructions: jest.fn(),
            formatArtifacts: jest.fn()
        } as unknown as jest.Mocked<ModelHelpers>;

        mockTaskManager = {
            getProject: jest.fn(),
            getAllTasks: jest.fn(),
            getNextTask: jest.fn(),
            markTaskInProgress: jest.fn(),
            completeTask: jest.fn(),
            updateTask: jest.fn()
        } as unknown as jest.Mocked<TaskManager>;

        executor = new ValidationExecutor({
            modelHelpers: mockModelHelpers,
            taskManager: mockTaskManager,
            vectorDB: {} as IVectorDatabase,
            llmService: {} as ILLMService,
            artifactManager: {} as ArtifactManager,
            settings: new Settings(),
            chatClient: {} as ChatClient,
            config: {}
        });

        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    describe('execute', () => {
        const baseParams: ExecuteParams = {
            agentId: createUUID(),
            goal: 'Test goal',
            step: 'validation',
            stepId: createUUID(),
            projectId: createUUID(),
            executionMode: 'conversation',
            steps: [],
            context: {
                threadPosts: []
            }
        };

        it('should validate successfully on first attempt', async () => {
            // Arrange
            mockModelHelpers.generate.mockResolvedValue({
                message: 'Validation successful',
                metadata: {
                    isComplete: true,
                    missingAspects: []
                }
            });

            // Act
            const result = await executor.execute(baseParams);

            // Assert
            expect(result.finished).toBe(true);
            expect(result.needsUserInput).toBe(false);
            expect(result.response.message).toContain('Validation successful');
            expect(result.response.metadata?.validationAttempts).toBe(1);
            expect(result.response.metadata?.missingAspects).toEqual([]);
            expect(Logger.info).toHaveBeenCalled();
        });

        it('should request user input when validation fails in conversation mode', async () => {
            // Arrange
            mockModelHelpers.generate.mockResolvedValue({
                message: 'Validation failed',
                metadata: {
                    isComplete: false,
                    missingAspects: ['Missing aspect 1', 'Missing aspect 2']
                }
            });

            // Act
            const result = await executor.execute(baseParams);

            // Assert
            expect(result.finished).toBe(true);
            expect(result.needsUserInput).toBe(true);
            expect(result.response.metadata?.missingAspects).toEqual(['Missing aspect 1', 'Missing aspect 2']);
            expect(result.response.metadata?.validationAttempts).toBe(1);
            expect(result.needsUserInput).toBe(true);
            expect(Logger.info).toHaveBeenCalled();
        });

        it('should force completion after max validation attempts', async () => {
            // Arrange
            mockModelHelpers.generate.mockResolvedValue({
                message: 'Validation failed',
                metadata: {
                    isComplete: false,
                    missingAspects: ['Missing aspect']
                }
            });

            const paramsWithAttempts: ExecuteParams = {
                ...baseParams,
                previousResult: [{
                    message: 'Previous validation attempt',
                    metadata: {
                        validationAttempts: 2 // Already had 2 attempts
                    }
                }]
            };

            // Act
            const result = await executor.execute(paramsWithAttempts);

            // Assert
            expect(result.finished).toBe(true);
            expect(result.needsUserInput).toBe(false);
            expect(result.response.message).toContain('Maximum validation attempts reached');
            expect(result.response.metadata?.validationAttempts).toBe(3);
            expect(Logger.warn).toHaveBeenCalled();
        });

        it('should handle task mode validation failures gracefully', async () => {
            // Arrange
            mockModelHelpers.generate.mockResolvedValue({
                message: 'Validation failed',
                metadata: {
                    isComplete: false,
                    missingAspects: ['Missing aspect']
                }
            });

            // Act
            const result = await executor.execute({
                ...baseParams,
                executionMode: 'task'
            });

            // Assert
            expect(result.finished).toBe(true);
            expect(result.needsUserInput).toBe(false);
            expect(result.response.message).toContain('Validation completed in task mode');
            expect(result.allowReplan).toBe(true);
            expect(Logger.info).toHaveBeenCalled();
        });

        it('should include relevant artifacts in validation context', async () => {
            // Arrange
            const artifact: Artifact = {
                id: createUUID(),
                type: 'report',
                content: 'Test artifact content'
            };

            const paramsWithArtifacts = {
                ...baseParams,
                context: {
                    artifacts: [artifact]
                }
            };

            // Act
            await executor.execute(paramsWithArtifacts);

            // Assert
            expect(mockModelHelpers.generate).toHaveBeenCalledWith(
                expect.objectContaining({
                    context: {
                        artifacts: [artifact]
                    }
                })
            );
        });

        it('should handle validation errors gracefully', async () => {
            // Arrange
            mockModelHelpers.generate.mockRejectedValue(new Error('Validation error'));
            mockLogger.error.mockImplementation(() => {});

            // Act
            const result = await executor.execute(baseParams);

            // Assert
            expect(result.finished).toBe(true);
            expect(result.response.message).toContain('Validation completed');
            expect(Logger.error).toHaveBeenCalledWith(
                'Error in ValidationExecutor:',
                expect.any(Error)
            );
        });
    });
});
