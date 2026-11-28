import { describe, expect, test } from "vitest";
import { CALL_BUDGET_SPENT, withCallBudget } from "./md";

describe("withCallBudget", () => {
  const fakeTools = () => {
    const seen: unknown[] = [];
    const tool = {
      description: "x",
      execute(this: unknown, input: unknown) {
        seen.push({ self: this, input });
        return Promise.resolve(`ran ${JSON.stringify(input)}`);
      },
    };
    return { tools: { a: tool, b: { ...tool } }, seen };
  };

  test("runs calls until the shared budget is spent, then returns the note", async () => {
    const { tools, seen } = fakeTools();
    const budgeted = withCallBudget(tools, 2);
    expect(await budgeted.a.execute({ q: 1 })).toBe('ran {"q":1}');
    expect(await budgeted.b.execute({ q: 2 })).toBe('ran {"q":2}');
    expect(await budgeted.a.execute({ q: 3 })).toBe(CALL_BUDGET_SPENT);
    expect(seen).toHaveLength(2);
  });

  test("passes `this` through, which is how the agent hands tools its ctx", async () => {
    const { tools, seen } = fakeTools();
    const bound = { ...withCallBudget(tools, 5).a, ctx: "convex-ctx" };
    await bound.execute({ q: 1 });
    expect((seen[0] as { self: { ctx: string } }).self.ctx).toBe("convex-ctx");
  });

  test("each set has its own count", async () => {
    const { tools } = fakeTools();
    const first = withCallBudget(tools, 1);
    await first.a.execute({});
    const second = withCallBudget(tools, 1);
    expect(await second.a.execute({})).toBe("ran {}");
  });
});
