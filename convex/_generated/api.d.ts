/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as EmailOTP from "../EmailOTP.js";
import type * as agents_config from "../agents/config.js";
import type * as agents_dhee from "../agents/dhee.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as config from "../config.js";
import type * as dev from "../dev.js";
import type * as devEmail from "../devEmail.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as lib_mcp from "../lib/mcp.js";
import type * as md from "../md.js";
import type * as memory from "../memory.js";
import type * as seed from "../seed.js";
import type * as tools_md from "../tools/md.js";
import type * as understanding from "../understanding.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  EmailOTP: typeof EmailOTP;
  "agents/config": typeof agents_config;
  "agents/dhee": typeof agents_dhee;
  auth: typeof auth;
  chat: typeof chat;
  config: typeof config;
  dev: typeof dev;
  devEmail: typeof devEmail;
  email: typeof email;
  http: typeof http;
  "lib/mcp": typeof lib_mcp;
  md: typeof md;
  memory: typeof memory;
  seed: typeof seed;
  "tools/md": typeof tools_md;
  understanding: typeof understanding;
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
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
