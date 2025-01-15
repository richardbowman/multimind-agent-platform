import { HandlerParams, PlannerParams } from '../agents';
import { PlanStepsResponse } from '../../schemas/PlanStepsResponse';

export interface Planner {
    planSteps(handlerParams: PlannerParams): Promise<PlanStepsResponse>;
}
