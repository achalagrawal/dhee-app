/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as agents_config from "../agents/config.js";
import type * as agents_dhee from "../agents/dhee.js";
import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as config from "../config.js";
import type * as dev from "../dev.js";
import type * as devEmail from "../devEmail.js";
import type * as email from "../email.js";
import type * as evals_checks from "../evals/checks.js";
import type * as evals_extraction from "../evals/extraction.js";
import type * as evals_harness from "../evals/harness.js";
import type * as evals_judge from "../evals/judge.js";
import type * as evals_scenarios from "../evals/scenarios.js";
import type * as http from "../http.js";
import type * as lib_backend from "../lib/backend.js";
import type * as lib_crisis from "../lib/crisis.js";
import type * as lib_mcp from "../lib/mcp.js";
import type * as lib_origins from "../lib/origins.js";
import type * as lib_passages from "../lib/passages.js";
import type * as lib_plan from "../lib/plan.js";
import type * as lib_redirect from "../lib/redirect.js";
import type * as lib_script from "../lib/script.js";
import type * as md from "../md.js";
import type * as memory from "../memory.js";
import type * as seed from "../seed.js";
import type * as share from "../share.js";
import type * as tools_md from "../tools/md.js";
import type * as understanding from "../understanding.js";
import type * as usage from "../usage.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  "agents/config": typeof agents_config;
  "agents/dhee": typeof agents_dhee;
  attachments: typeof attachments;
  auth: typeof auth;
  chat: typeof chat;
  config: typeof config;
  dev: typeof dev;
  devEmail: typeof devEmail;
  email: typeof email;
  "evals/checks": typeof evals_checks;
  "evals/extraction": typeof evals_extraction;
  "evals/harness": typeof evals_harness;
  "evals/judge": typeof evals_judge;
  "evals/scenarios": typeof evals_scenarios;
  http: typeof http;
  "lib/backend": typeof lib_backend;
  "lib/crisis": typeof lib_crisis;
  "lib/mcp": typeof lib_mcp;
  "lib/origins": typeof lib_origins;
  "lib/passages": typeof lib_passages;
  "lib/plan": typeof lib_plan;
  "lib/redirect": typeof lib_redirect;
  "lib/script": typeof lib_script;
  md: typeof md;
  memory: typeof memory;
  seed: typeof seed;
  share: typeof share;
  "tools/md": typeof tools_md;
  understanding: typeof understanding;
  usage: typeof usage;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
