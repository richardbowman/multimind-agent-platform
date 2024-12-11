import { StepExecutor } from '../decorators/executorDecorator';
import { StepResult } from '../stepBasedAgent';
import { IExecutor } from './IExecutor';
import LMStudioService from '../../llm/lmstudioService';

export class ReplyExecutor implements IExecutor {
    constructor(private lmStudioService: LMStudioService) {}

    async execute(goal: string, step: string, projectId: string): Promise<StepResult> {
        const project = await this.getProjectWithPlan(projectId);
        const reply = await this.lmStudioService.generate({
            instructions: "Generate a user friendly reply",
            message: `${step} [${goal}]`,
            projects: [project]
        });

        return {
            finished: true,
            needsUserInput: true,
            response: reply
        };
    }

    private async getProjectWithPlan(projectId: string) {
        // Implementation would come from your project management system
        return { id: projectId };
    }
}
