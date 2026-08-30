// x402-payer — end-to-end reference client (Node 18+, @noble/curves + @noble/hashes only).
//
// Usage:
//   AGENT_WALLET_KEY=<32-byte hex> node src/pay-call.mjs \
//     https://openfang-rail.akrivis.workers.dev/v1/tools/iban-check/call \
//     '{"input":{"iban":"GB82WEST12345698765432"}}'
//
// Without AGENT_WALLET_KEY it still runs the free-tier call and prints the 402
// challenge verbatim (dry-run mode — nothing is signed).

import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

const te = new TextEncoder();
const hb = (h) => { h = h.replace(/^0x/, ""); const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; };
const bh = (b) => [...b].map(x => x.toString(16).padStart(2, "0")).join("");
const cat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0); const o = new Uint8Array(n); let k = 0; for (const x of a) { o.set(x, k); k += x.length; } return o; };
const word = (n) => { const w = new Uint8Array(32); let v = BigInt(n); for (let i = 31; i >= 0 && v; i--) { w[i] = Number(v & 255n); v >>= 8n; } return w; };
const addrWord = (a) => { const w = new Uint8Array(32); w.set(hb(a), 12); return w; };
const addrFromPriv = (k) => "0x" + bh(keccak_256(secp256k1.getPublicKey(k, false).slice(1)).slice(12));
const CHAIN_ID = 8453; // Base mainnet

// ---------- EIP-712 / EIP-3009 ----------
const domainSeparator = (name, version, chainId, contract) => keccak256(cat(
  keccak_256(te.encode("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
  keccak_256(te.encode(name)), keccak_256(te.encode(version)), word(chainId), addrWord(contract)));

const eip3009Digest = (ds, a) => keccak256(cat(te.encode("\x19\x01"), ds, keccak256(cat(
  keccak_256(te.encode("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")),
  addrWord(a.from), addrWord(a.to), word(a.value), word(a.validAfter), word(a.validBefore), hb(a.nonce)))));

const signDigest = (digest, key) => {
  const s = secp256k1.sign(digest, key);
  return "0x" + bh(s.toCompactRawBytes()) + (s.recovery + 27).toString(16).padStart(2, "0");
};

const recoverRaw = (digest, sigHex) => {
  const s = hb(sigHex); let v = s[64]; if (v >= 27) v -= 27;
  const sig = new secp256k1.Signature(BigInt("0x" + bh(s.slice(0, 32))), BigInt("0x" + bh(s.slice(32, 64)))).addRecoveryBit(v);
  return "0x" + bh(keccak_256(sig.recoverPublicKey(digest).toRawBytes(false).slice(1)).slice(12));
};

// ---------- receipt verification ----------
const canon = (r) => [r.v, r.tool, r.tool_version, r.input_hash, r.output_hash, r.payer, r.recipient, r.amount, r.nonce, r.ts, r.tier].join("|");
const eip191Digest = (m) => keccak_256(cat(te.encode("\x19Ethereum Signed Message:\n" + m.length), te.encode(m)));

export function verifyReceipt(body) {
  const { receipt, authorization } = body;
  if (!receipt?.signature) return { ok: false, why: "no receipt" };
  const signer = recoverRaw(keccak_256(te.encode(canon(receipt))), receipt.signature);
  if (signer.toLowerCase() !== receipt.signer.toLowerCase()) return { ok: false, why: "receipt signature does not recover to receipt.signer" };
  if (authorization?.attestation && authorization?.attestation_sig && authorization?.authorized_by) {
    if (!authorization.attestation.toLowerCase().includes(signer.toLowerCase()))
      return { ok: false, why: "receipt signer not named in attestation" };
    const attSigner = recoverRaw(eip191Digest(authorization.attestation), authorization.attestation_sig);
    if (attSigner.toLowerCase() !== authorization.authorized_by.toLowerCase())
      return { ok: false, why: "attestation not signed by authorized_by" };
    return { ok: true, signer, authorizedBy: authorization.authorized_by, fullyAuthorized: true };
  }
  return { ok: true, signer, fullyAuthorized: false, note: "signature valid; no operator attestation present" };
}

// ---------- main flow (only when run directly, not when imported) ----------
import { pathToFileURL } from "node:url";
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
const [url, bodyStr] = process.argv.slice(2);
if (!url || !bodyStr) { console.error("usage: node src/pay-call.mjs <url> <json-body>"); process.exit(1); }
const keyHex = process.env.AGENT_WALLET_KEY?.replace(/^0x/, "");
const key = keyHex ? hb(keyHex) : null;
if (key && key.length !== 32) { console.error("AGENT_WALLET_KEY must be 32 bytes hex"); process.exit(1); }

const post = (headers) => fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: bodyStr });

// 1. call without paying — free tier may serve
let resp = await post();
if (resp.status !== 402) {
  const body = await resp.json();
  console.log("served without payment (status " + resp.status + ", likely free tier)");
  console.log(JSON.stringify(verifyReceipt(body)));
  console.log(JSON.stringify(body.result ?? body));
  process.exit(0);
}

// 2. parse the challenge
const challenge = await resp.json();
const acc = challenge.accepts?.[0];
if (!acc) { console.error("402 without accepts[]", JSON.stringify(challenge)); process.exit(1); }
console.log(`402: pay ${acc.maxAmountRequired} minor USDC to ${acc.payTo} on ${acc.network}`);
if (!key) { console.log("dry-run: set AGENT_WALLET_KEY to sign and pay. Challenge was:"); console.log(JSON.stringify(acc, null, 2)); process.exit(0); }

// 3. sign EIP-3009
const from = addrFromPriv(key);
const now = Math.floor(Date.now() / 1000);
const auth = {
  from, to: acc.payTo, value: BigInt(acc.maxAmountRequired),
  validAfter: 0n, validBefore: BigInt(now + (acc.maxTimeoutSeconds ?? 300)),
  nonce: "0x" + bh(crypto.getRandomValues(new Uint8Array(32))),
};
const ds = domainSeparator(acc.extra?.name ?? "USD Coin", acc.extra?.version ?? "2", CHAIN_ID, acc.asset);
const signature = signDigest(eip3009Digest(ds, auth), key);

// 4. retry with X-PAYMENT
const xpayment = Buffer.from(JSON.stringify({
  x402Version: 1, scheme: "exact", network: acc.network,
  payload: { signature, authorization: { from: auth.from, to: auth.to, value: auth.value.toString(), validAfter: auth.validAfter.toString(), validBefore: auth.validBefore.toString(), nonce: auth.nonce } },
})).toString("base64");
resp = await post({ "X-PAYMENT": xpayment });
const body = await resp.json();
console.log("paid call status:", resp.status);
console.log("settlement:", JSON.stringify(body.settlement));
console.log("receipt verification:", JSON.stringify(verifyReceipt(body)));
if (resp.status !== 200) { console.log(JSON.stringify(body)); process.exit(1); }
console.log("result:", JSON.stringify(body.result));
}
