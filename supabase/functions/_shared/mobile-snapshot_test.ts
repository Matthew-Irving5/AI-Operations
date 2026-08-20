import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canonicalJson, jsonDepth, sha256Hex } from "./mobile-snapshot.ts";

Deno.test("canonical JSON sorts object keys but preserves array order", () => {
  assertEquals(
    canonicalJson({ z: 1, a: [{ y: 2, x: 1 }] }),
    '{"a":[{"x":1,"y":2}],"z":1}',
  );
});

Deno.test("canonical hashing is stable across object key order", async () => {
  assertEquals(
    await sha256Hex(canonicalJson({ b: 2, a: 1 })),
    await sha256Hex(canonicalJson({ a: 1, b: 2 })),
  );
});

Deno.test("JSON nesting depth is measured", () => {
  assertEquals(jsonDepth({ a: [{ b: true }] }), 3);
});
