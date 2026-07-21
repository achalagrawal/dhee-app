import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";

// Auth and Workflow components are registered in later milestones (M3, M4).

const app = defineApp();
app.use(agent);

export default app;
