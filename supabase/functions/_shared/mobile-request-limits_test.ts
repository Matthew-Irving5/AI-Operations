import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cancelIfDeclaredBodyTooLarge } from "./mobile-request-limits.ts";

Deno.test("declared oversized request body is canceled before rejection", async () => {
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
    headers: { "content-length": "9" },
    body,
  });

  assertEquals(await cancelIfDeclaredBodyTooLarge(request, 8), 9);
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
