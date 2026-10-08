import test from "node:test";
import assert from "node:assert/strict";
import { createLoBotClient, RateLimited } from "../dist/index.js";

const token = "42:" + "A".repeat(43);

test("downloads and API calls share refusal categories without leaking bodies or retrying", async () => {
  for (const [status, code] of [
    [302, "transport"],
    [307, "transport"],
    [400, "invalid-input"],
    [401, "unauthenticated"],
    [403, "forbidden"],
    [404, "not-found"],
    [409, "conflict"],
    [418, "transport"],
    [429, "rate-limited"],
    [501, "unsupported"],
    [503, "unavailable"],
  ]) {
    const errors = [];
    for (const operation of ["getIdentity", "downloadFile"]) {
      let calls = 0;
      let cancelled = 0;
      const body = `private-response https://example.test/bot${token}`;
      const client = createLoBotClient({
        token,
        fetch: async (_url, options) => {
          calls++;
          assert.equal(options.redirect, "manual");
          return new Response(
            operation === "downloadFile"
              ? new ReadableStream({
                  start(controller) {
                    controller.enqueue(new TextEncoder().encode(body));
                  },
                  cancel() {
                    cancelled++;
                    throw new Error(body);
                  },
                })
              : body,
            { status, headers: { "retry-after": "7" } },
          );
        },
      });
      await assert.rejects(
        operation === "downloadFile"
          ? client.downloadFile({ path: "files/synthetic" })
          : client.getIdentity(),
        (error) => {
          assert.equal(error.code, code);
          assert.equal(error.status, status);
          assert.equal(error.platformCode, status);
          assert.equal(error.cause, undefined);
          for (const value of [
            String(error),
            error.stack,
            JSON.stringify(error),
          ]) {
            assert.ok(!value.includes(token));
            assert.ok(!value.includes("private-response"));
            assert.ok(!value.includes("example.test"));
          }
          if (status === 429) {
            assert.ok(error instanceof RateLimited);
            assert.equal(error.retryAfterSeconds, 7);
            assert.notEqual(error.details?.safeToRetry, true);
          }
          errors.push(error);
          return true;
        },
      );
      assert.equal(calls, 1);
      assert.equal(cancelled, operation === "downloadFile" ? 1 : 0);
    }
    assert.equal(errors[0].constructor, errors[1].constructor);
  }
});

test("download retry headers accept only bounded positive integer seconds", async () => {
  for (const [header, expected] of [
    [undefined, undefined],
    ["0", undefined],
    ["-1", undefined],
    ["0.5", undefined],
    ["1e3", undefined],
    ["invalid", undefined],
    ["Wed, 21 Oct 2015 07:28:00 GMT", undefined],
    ["9007199254740992", undefined],
    ["7", 7],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ]) {
    let calls = 0;
    const client = createLoBotClient({
      token,
      fetch: async () => {
        calls++;
        return new Response(null, {
          status: 429,
          headers: header === undefined ? {} : { "retry-after": header },
        });
      },
    });
    await assert.rejects(
      client.downloadFile({ path: "files/synthetic" }),
      (error) => {
        assert.ok(error instanceof RateLimited);
        assert.equal(error.retryAfterSeconds, expected);
        assert.equal(error.retryAfterSec, expected);
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});
