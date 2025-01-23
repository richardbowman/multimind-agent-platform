import { UnderstandGoalsExecutor } from '../src/agents/executors/UnderstandGoalsExecutor';
import { ModelHelpers } from '../src/llm/modelHelpers';
import { ExecuteParams } from '../src/agents/interfaces/ExecuteParams';
import { StepResult } from '../src/agents/interfaces/StepResult';
import { TaskManager } from '../src/tools/taskManager';
import { TaskType } from '../src/tools/taskManager';
import { IntakeQuestionsResponse } from '../src/schemas/IntakeQuestionsResponse';
import { UUID, createUUID } from '../src/types/uuid';

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
            getAllTasks: jest.fn(),
            createProject: jest.fn(),
            assignTaskToAgent: jest.fn(),
            updateProject: jest.fn(),
            replaceProject: jest.fn(),
            completeTask: jest.fn(),
            addProject: jest.fn(),
            newProjectId: jest.fn(),
            save: jest.fn(),
            load: jest.fn()
        } as unknown as jest.Mocked<TaskManager>;

        mockParams = {
            goal: 'Test goal',
            step: 'understand',
            projectId: createUUID(),
            executionMode: 'conversation',
            agentId: createUUID(),
            stepId: createUUID(),
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
            reasoning: 'Test reasoning',
            goalRestatement: 'Restated goal',
            followupMessage: 'Follow up message'
        };

        mockModelHelpers.generate.mockResolvedValue(mockResponse);
        mockTaskManager.getProject.mockReturnValue({
            id: createUUID(),
            name: 'Test Project',
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                status: 'active'
            },
            tasks: {},
            props: {}
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
            reasoning: 'Test reasoning',
            goalRestatement: 'Restated goal',
            followupMessage: 'Follow up message'
        };

        mockModelHelpers.generate.mockResolvedValue(mockResponse);
        mockTaskManager.getProject.mockReturnValue({
            id: createUUID(),
            name: 'Test Project',
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                status: 'active'
            },
            tasks: {},
            props: {}
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
