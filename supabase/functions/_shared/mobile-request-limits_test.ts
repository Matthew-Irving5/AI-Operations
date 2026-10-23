import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cancelIfDeclaredBodyTooLarge } from "./mobile-request-limits.ts";

Deno.test("near-limit oversized body is consumed without buffering before rejection", async () => {
  let pulled = false;
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled = true;
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request("https://localhost/mobile", {
    method: "POST",
    headers: { "content-length": "9" },
    body,
  });

  assertEquals(await cancelIfDeclaredBodyTooLarge(request, 8), 9);
  assert(pulled);
  assertEquals(canceled, false);
});

Deno.test("large declared oversized body is canceled without being read", async () => {
  let pulled = false;
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled = true;
      controller.enqueue(new Uint8Array([1]));
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request("https://localhost/mobile", {
    method: "POST",
    headers: { "content-length": String(8 + 64 * 1024 + 1) },
    body,
  });

  assertEquals(
    await cancelIfDeclaredBodyTooLarge(request, 8),
    8 + 64 * 1024 + 1,
  );
  assertEquals(pulled, false);
  assert(canceled);
});

Deno.test("lying near-limit length cannot cause an unbounded body drain", async () => {
  let pulls = 0;
  let canceled = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(32 * 1024));
      },
      cancel() {
        canceled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request("https://localhost/mobile", {
    method: "POST",
    headers: { "content-length": "9" },
    body,
  });

  assertEquals(await cancelIfDeclaredBodyTooLarge(request, 8), 9);
  assertEquals(pulls, 3);
  assert(canceled);
});

Deno.test("request body at the limit is left available for normal validation", async () => {
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request("https://localhost/mobile", {
    method: "POST",
    headers: { "content-length": "8" },
    body,
  });

  assertEquals(await cancelIfDeclaredBodyTooLarge(request, 8), null);
  assertEquals(canceled, false);
});
