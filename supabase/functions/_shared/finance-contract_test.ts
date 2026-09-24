import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  deriveFinanceClose,
  minorUnitsToString,
  normalizeCategoryNames,
  parseFinanceCsv,
  parseMoneyToMinorUnits,
} from "./finance-contract.ts";

Deno.test("finance money uses exact minor units", () => {
  assertEquals(parseMoneyToMinorUnits("12.3"), 1230n);
  assertEquals(parseMoneyToMinorUnits("-0.05"), -5n);
  assertEquals(parseMoneyToMinorUnits("1.005"), null);
  assertEquals(minorUnitsToString(1230n), "12.30");
});

Deno.test("finance CSV parser supports quoted descriptions and strict rows", () => {
  const parsed = parseFinanceCsv(
    'id,date,description,amount\n1,2026-09-01,"Coffee, shop",-3.50',
  );
  assert("rows" in parsed);
  if ("rows" in parsed) {
    assertEquals(parsed.rows[0]?.description, "Coffee, shop");
    assertEquals(parsed.rows[0]?.amountMinor, -350n);
  }
  const invalid = parseFinanceCsv(
    "id,date,description,amount\n1,2026-09-01,x,1.005",
  );
  assertEquals("code" in invalid ? invalid.code : "", "statement_parse_failed");
  const duplicate = parseFinanceCsv(
    "id,date,description,amount\n1,2026-09-01,x,1.00\n1,2026-09-02,y,2.00",
  );
  assertEquals(
    "code" in duplicate ? duplicate.code : "",
    "statement_parse_failed",
  );
});

Deno.test("finance close readiness proves an exact balance reconciliation", () => {
  const parsed = parseFinanceCsv(
    "id,date,description,amount\n1,2026-09-01,Opening adjustment,25.00\n2,2026-09-12,Groceries,-5.00",
  );
  assert("rows" in parsed);
  if ("rows" in parsed) {
    const close = deriveFinanceClose(parsed.rows, "100.00", "120.00");
    assertEquals(close.readiness, "ready");
    assertEquals(close.reconciled, true);
    const blocked = deriveFinanceClose(parsed.rows, "100.00", "119.99");
    assertEquals(blocked.blockers, ["closing_balance_mismatch"]);
  }
});

Deno.test("finance categories are deduplicated without leaking values", () => {
  assertEquals(normalizeCategoryNames([" Groceries ", "groceries", "Bills"]), [
    "Groceries",
    "Bills",
  ]);
});
