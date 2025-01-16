import { UnderstandGoalsExecutor } from '../UnderstandGoalsExecutor';
import { ModelHelpers } from '../../../llm/modelHelpers';
import { ExecuteParams } from '../../interfaces/ExecuteParams';
import { StepResult } from '../../interfaces/StepResult';
import { TaskManager } from '../../../tools/taskManager';
import { TaskType } from '../../../tools/taskManager';
import { IntakeQuestionsResponse } from '../../../schemas/IntakeQuestionsResponse';

describe('UnderstandGoalsExecutor', () => {
    let executor: UnderstandGoalsExecutor;
    let mockModelHelpers: jest.Mocked<ModelHelpers>;
    let mockTaskManager: jest.Mocked<TaskManager>;
    let mockParams: ExecuteParams;

    beforeEach(() => {
        mockModelHelpers = {
            generate: jest.fn(),
            formatArtifacts: jest.fn()
        } as unknown as jest.Mocked<ModelHelpers>;

        mockTaskManager = {
            getProject: jest.fn(),
            addTask: jest.fn(),
            updateTask: jest.fn(),
            getAllTasks: jest.fn()
        } as unknown as jest.Mocked<TaskManager>;

        mockParams = {
            goal: 'Test goal',
            step: 'understand',
            projectId: 'test-project',
            executionMode: 'conversation',
            agentId: 'test-agent',
            stepId: 'test-step',
            steps: []
        };

        executor = new UnderstandGoalsExecutor({
            modelHelpers: mockModelHelpers,
            taskManager: mockTaskManager,
            userId: 'test-user'
        } as any);
    });

    it('should generate intake questions and create tasks', async () => {
        const mockResponse: IntakeQuestionsResponse = {
            intakeQuestions: [
                { question: 'Q1', purpose: 'Purpose 1' },
                { question: 'Q2', purpose: 'Purpose 2' }
            ],
            reasoning: 'Test reasoning'
        };

        mockModelHelpers.generate.mockResolvedValue(mockResponse);
        mockTaskManager.getProject.mockReturnValue({
            id: 'test-project',
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                status: 'active',
                answers: []
            },
            tasks: {}
        });

        const result = await executor.execute(mockParams);

        expect(result.finished).toBe(true);
        expect(result.needsUserInput).toBe(true);
        expect(mockTaskManager.addTask).toHaveBeenCalledTimes(2);
        expect(mockModelHelpers.generate).toHaveBeenCalled();
    });

    it('should handle existing answers in project metadata', async () => {
        const mockResponse: IntakeQuestionsResponse = {
            intakeQuestions: [
                { question: 'Q1', purpose: 'Purpose 1' }
            ],
            reasoning: 'Test reasoning'
        };

        mockModelHelpers.generate.mockResolvedValue(mockResponse);
        mockTaskManager.getProject.mockReturnValue({
            id: 'test-project',
            metadata: {
                answers: [
                    { question: 'Existing Q', answer: 'Existing A' }
                ]
            },
            tasks: {}
        });

        await executor.execute(mockParams);

        expect(mockModelHelpers.generate).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Previously Gathered Information')
            })
        );
    });

    it('should handle error during question generation', async () => {
        mockModelHelpers.generate.mockRejectedValue(new Error('Test error'));

        const result = await executor.execute(mockParams);

        expect(result.finished).toBe(true);
        expect(result.response.message).toContain('questions');
    });
});
