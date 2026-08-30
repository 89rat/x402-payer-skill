// verify-receipt.mjs — standalone offline verifier for openfang-rail XDR-1 receipts.
// Usage: node src/verify-receipt.mjs '<full JSON response body of a call>'
import { verifyReceipt } from "./pay-call.mjs";
const body = JSON.parse(process.argv[2] || "{}");
const r = verifyReceipt(body);
console.log(JSON.stringify(r, null, 2));
process.exit(r.ok ? 0 : 1);
