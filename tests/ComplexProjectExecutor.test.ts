import { ComplexProjectExecutor } from '../src/agents/executors/ComplexProjectExecutor';
import { ModelHelpers } from '../src/llm/modelHelpers';
import { ExecuteParams } from '../src/agents/interfaces/ExecuteParams';
import { StepResult } from '../src/agents/interfaces/StepResult';
import { TaskManager } from '../src/tools/taskManager';
import { TaskType } from '../src/tools/taskManager';
import { UUID, createUUID } from '../src/types/uuid';

describe('ComplexProjectExecutor', () => {
    let executor: ComplexProjectExecutor;
    let mockModelHelpers: jest.Mocked<ModelHelpers>;
    let mockTaskManager: jest.Mocked<TaskManager>;
    let mockParams: ExecuteParams;

    beforeEach(() => {
        mockModelHelpers = {
            generate: jest.fn()
        } as unknown as jest.Mocked<ModelHelpers>;

        mockTaskManager = {
            createProject: jest.fn(),
            addTask: jest.fn(),
            assignTaskToAgent: jest.fn(),
            updateProject: jest.fn().mockImplementation((projectId: string, updates: any) => {
                return Promise.resolve({
                    id: projectId,
                    name: 'Updated Project',
                    metadata: {
                        ...updates.metadata,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        status: 'active'
                    },
                    tasks: {}
                });
            }) as jest.MockedFunction<TaskManager['updateProject']>,
            getProject: jest.fn(),
            updateTask: jest.fn(),
            getAllTasks: jest.fn(),
            replaceProject: jest.fn(),
            completeTask: jest.fn(),
            addProject: jest.fn(),
            newProjectId: jest.fn(),
            save: jest.fn(),
            load: jest.fn()
        } as unknown as jest.Mocked<TaskManager>;

        mockParams = {
            goal: 'Test project goal',
            step: 'create',
            projectId: createUUID(),
            executionMode: 'task',
            agentId: createUUID(),
            stepId: createUUID(),
            steps: []
        };

        executor = new ComplexProjectExecutor({
            modelHelpers: mockModelHelpers,
            taskManager: mockTaskManager
        } as any);
    });

    it('should create project and tasks successfully', async () => {
        const mockResponse = {
            projectName: 'Test Project',
            projectGoal: 'Test goal',
            researchTask: 'Research task',
            contentTask: 'Content task',
            responseMessage: 'Project created'
        };

        const projectId = createUUID();
        mockModelHelpers.generate.mockResolvedValue(mockResponse);
        mockTaskManager.createProject.mockResolvedValue({
            id: projectId,
            name: 'Test Project',
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                status: 'active'
            },
            tasks: {}
        });

        const result = await executor.execute(mockParams);

        expect(result.finished).toBe(true);
        expect(result.projectId).toBe(projectId);
        expect(mockTaskManager.createProject).toHaveBeenCalled();
        expect(mockTaskManager.addTask).toHaveBeenCalledTimes(2);
        expect(mockTaskManager.updateProject).toHaveBeenCalled();
    });

    it('should handle task creation errors', async () => {
        mockModelHelpers.generate.mockRejectedValue(new Error('Test error'));

        const result = await executor.execute(mockParams);

        expect(result.finished).toBe(true);
        expect(result.response.message).toContain('Failed to create');
    });

    it('should create tasks with proper dependencies', async () => {
        const mockResponse = {
            projectName: 'Test Project',
            projectGoal: 'Test goal',
            researchTask: 'Research task',
            contentTask: 'Content task',
            responseMessage: 'Project created'
        };

        mockModelHelpers.generate.mockResolvedValue(mockResponse);
        mockTaskManager.createProject.mockResolvedValue({
            id: createUUID(),
            name: 'Test Project',
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                status: 'active'
            },
            tasks: {}
        });

        await executor.execute(mockParams);

        const researchTaskCall = mockTaskManager.addTask.mock.calls[0][1];
        const contentTaskCall = mockTaskManager.addTask.mock.calls[1][1];

        expect(researchTaskCall.props?.stepType).toBe('research');
        expect(contentTaskCall.props?.stepType).toBe('content_creation');
        expect(contentTaskCall.props?.dependsOn).toBeDefined();
    });
});
