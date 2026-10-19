# x402-payer-skill

Teach any agent to pay for machine-payable API calls with USDC — no accounts, no API keys. Payment is the credential.

- `SKILL.md` — the protocol, hard rules, and when-to-use (drop into any agent that reads skills)
- `src/pay-call.mjs` — end-to-end reference client: call → free tier → 402 → sign EIP-3009 → retry → verify receipt
- `src/verify-receipt.mjs` — standalone offline receipt + attestation verifier

Reference rail: [code402 / HCRB](https://hcrb.in/.well-known/mcp.json) — deterministic business-ID validation and seven paid revenue modules on Base mainnet. Eligible tools: first 5 calls/day per client free for evaluation; after that every price is quoted live by the 402 challenge.

## Quick start

```bash
npm install
# Free tier / dry-run (signs nothing):
node src/pay-call.mjs https://hcrb.in/v1/tools/iban-check/call \
  '{"input":{"iban":"GB82WEST12345698765432"}}'
# Paid call (your agent wallet — needs a few cents of USDC on Base):
AGENT_WALLET_KEY=<32-byte hex> node src/pay-call.mjs <url> <json-body>
```

Verified against the live rail: 402 parsing, challenge quoting, and receipt signature recovery all pass; a tampered receipt is rejected. For a ready-made toolbelt with spend caps and framework adapters, see [`@code-402/agent-tools`](https://www.npmjs.com/package/@code-402/agent-tools).

MIT.
