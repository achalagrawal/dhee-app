import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// Mounts Better Auth's own handler at /api/auth/* plus the OIDC discovery
// document Convex reads to validate tokens. CORS is needed because the Expo
// web build is served from a different origin than the Convex deployment.
authComponent.registerRoutes(http, createAuth, { cors: true });

export default http;
