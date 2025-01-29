import { HandlerParams, PlannerParams } from '../agents';
import { PlanStepsResponse } from '../../schemas/PlanStepsResponse';

export interface Planner {
    readonly allowReplan: boolean;
    readonly alwaysComplete: boolean;

    planSteps(handlerParams: PlannerParams): Promise<PlanStepsResponse>;
}
