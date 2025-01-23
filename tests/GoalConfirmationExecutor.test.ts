import { GoalConfirmationExecutor } from '../src/agents/executors/GoalConfirmationExecutor';
import { ModelHelpers } from '../src/llm/modelHelpers';
import { ExecuteParams } from '../src/agents/interfaces/ExecuteParams';
import { StepResult } from '../src/agents/interfaces/StepResult';
import { StructuredOutputPrompt } from '../src/llm/ILLMService';
import { GoalConfirmationResponse } from '../src/schemas/goalConfirmation';
import { createUUID } from '../src/types/uuid';

describe('GoalConfirmationExecutor', () => {
    let executor: GoalConfirmationExecutor;
    let mockModelHelpers: jest.Mocked<ModelHelpers>;
    let mockParams: ExecuteParams;

    beforeEach(() => {
        mockModelHelpers = {
            generate: jest.fn(),
            formatArtifacts: jest.fn()
        } as unknown as jest.Mocked<ModelHelpers>;

        mockParams = {
            goal: 'Test goal',
            step: 'confirm',
            projectId: createUUID(),
            context: {
                channelId: 'test-channel',
                threadId: 'test-thread'
            },
            executionMode: 'conversation',
            agentId: createUUID(),
            stepId: createUUID(),
            steps: []
        };

        executor = new GoalConfirmationExecutor({
            modelHelpers: mockModelHelpers
        } as any);
    });

    it('should confirm goal when understanding is complete', async () => {
        const mockResponse: GoalConfirmationResponse = {
            understanding: true,
            message: 'I understand the goal'
        };

        mockModelHelpers.generate.mockResolvedValue(mockResponse);

        const result = await executor.execute(mockParams);

        expect(result.finished).toBe(true);
        expect(result.needsUserInput).toBe(false);
        expect(result.response.message).toBe('I understand the goal');
        expect(mockModelHelpers.generate).toHaveBeenCalledWith(expect.objectContaining({
            message: 'Test goal',
            instructions: expect.any(StructuredOutputPrompt)
        }));
    });

    it('should request clarification when understanding is incomplete', async () => {
        const mockResponse: GoalConfirmationResponse = {
            understanding: false,
            message: 'Need more info'
        };

        mockModelHelpers.generate.mockResolvedValue(mockResponse);

        const result = await executor.execute(mockParams);

        expect(result.finished).toBe(false);
        expect(result.needsUserInput).toBe(true);
        expect(result.response.message).toBe('Need more info');
    });

    it('should include artifacts in prompt when provided', async () => {
        const mockResponse: GoalConfirmationResponse = {
            understanding: true,
            message: 'Understood'
        };

        mockModelHelpers.generate.mockResolvedValue(mockResponse);
        mockModelHelpers.formatArtifacts.mockReturnValue('Formatted artifacts');

        const result = await executor.execute({
            ...mockParams,
            context: {
                artifacts: [{
                    id: 'artifact1',
                    type: 'document',
                    content: 'Test content'
                }]
            }
        });

        expect(mockModelHelpers.formatArtifacts).toHaveBeenCalled();
        expect(mockModelHelpers.generate).toHaveBeenCalledWith(expect.objectContaining({
            message: 'Test goal',
            instructions: expect.any(StructuredOutputPrompt)
        }));
        expect(result.finished).toBe(true);
    });
});
