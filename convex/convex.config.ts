import agent from "@convex-dev/agent/convex.config";
import workflow from "@convex-dev/workflow/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(agent);
app.use(workflow);

export default app;
