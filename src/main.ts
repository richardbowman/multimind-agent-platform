import { MainOrchestrator } from "./orchestrator";
import "./config";

const orchestrator = new MainOrchestrator(process.env.ORCHESTRATOR_TOKEN_ID!, process.env.PROJECTS_CHANNEL_ID!);
orchestrator.initialize();
