import assert from "node:assert/strict";import test from "node:test";import { normalizeSearch,normalizeTireMeasure } from "../src/lib/search/normalize";
test("normalizes equivalent tire measures",()=>{const values=["175/70 R14","175 70 14","1757014","175-70-14","175/70/14"];assert.deepEqual(values.map(normalizeTireMeasure),Array(5).fill("1757014"))});
test("normalizes barcode, plate, accents and casing",()=>{assert.equal(normalizeSearch(" abc-1d23 "),"ABC1D23");assert.equal(normalizeSearch("Pneu Ágil"),"PNEUAGIL")});
