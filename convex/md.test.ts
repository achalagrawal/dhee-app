import { describe, expect, test } from "vitest";
import { bookIdParam } from "./md";

// The MCP server takes `book_ids` as a comma-separated string. Passing a JSON
// array is rejected with `-32602 Invalid arguments` at call time — a failure
// no amount of type-checking catches, because the wire format isn't in the
// type system. Pinning the conversion here is the cheap way to keep it.

describe("md — book_ids wire format", () => {
  test("joins ids into the comma-separated string the server expects", () => {
    expect(bookIdParam([142, 110])).toEqual({ book_ids: "142,110" });
  });

  test("sends a single id without a trailing comma", () => {
    expect(bookIdParam([142])).toEqual({ book_ids: "142" });
  });

  test("omits the parameter entirely when there is no filter", () => {
    // Sending an empty filter would be read as "restrict to nothing".
    expect(bookIdParam(undefined)).toEqual({});
    expect(bookIdParam([])).toEqual({});
  });
});
