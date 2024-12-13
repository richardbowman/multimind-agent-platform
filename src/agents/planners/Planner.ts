import { HandlerParams } from '../agents';
import { PlanStepsResponse } from '../../schemas/PlanStepsResponse';

export interface Planner {
    planSteps(handlerParams: HandlerParams): Promise<PlanStepsResponse>;
}
