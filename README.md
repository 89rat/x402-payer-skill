# x402-payer-skill

Teach any agent to pay for machine-payable API calls with USDC — no accounts, no API keys. Payment is the credential.

- `SKILL.md` — the protocol, hard rules, and when-to-use (drop into any agent that reads skills)
- `src/pay-call.mjs` — end-to-end reference client: call → free tier → 402 → sign EIP-3009 → retry → verify receipt
- `src/verify-receipt.mjs` — standalone offline receipt + attestation verifier

Reference rail: [openfang-rail](https://openfang-rail.akrivis.workers.dev/.well-known/mcp.json) — deterministic business-ID validation on Base mainnet, floor $0.000999/call, ~19 free calls/day for evaluation.

## Quick start

```bash
npm install
# Free tier / dry-run (signs nothing):
node src/pay-call.mjs https://openfang-rail.akrivis.workers.dev/v1/tools/iban-check/call \
  '{"input":{"iban":"GB82WEST12345698765432"}}'
# Paid call (your agent wallet — needs a few cents of USDC on Base):
AGENT_WALLET_KEY=<32-byte hex> node src/pay-call.mjs <url> <json-body>
```

Verified against the live rail on 2026-08-30: 402 parsing, challenge quoting, and receipt signature recovery all pass; a tampered receipt is rejected.

MIT.
