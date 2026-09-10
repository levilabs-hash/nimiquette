# Nimiquette

Nimiquette is a Nimiq Pay Mini App that records **why** a NIM payment was sent and lets the recipient **acknowledge** it.

## The problem

Blockchains record where money went. They do not record the social meaning of a payment: a gift, a split bill, thanks, work, support, repayment, or a celebration. Nimiquette adds that context to a Nimiq payment and a shareable receipt the recipient can sign in Nimiq Pay.

This project was built for the **Nimiq Mini Apps Competition**.

## How it works

**Intent → Payment → Acknowledgment → Shared Receipt**

1. **Intent** — The sender chooses why the payment exists and enters amount, recipient, and an optional note.
2. **Payment** — Nimiq Pay sends NIM with that intent attached as transaction extra data.
3. **Shared Receipt** — Nimiquette builds a client-side receipt from the sender-reported details and a transaction hash returned by Nimiq Pay.
4. **Acknowledgment** — The recipient opens the receipt in Nimiq Pay and signs a message bound to those details.

The receipt lives in the Mini App URL hash (`#r=…`). There is no backend.

## Features

- Seven payment intents: Gift, Split, Thanks, Work, Support, Repayment, Celebration
- NIM payments through Nimiq Pay (`sendBasicTransactionWithData`)
- Shared receipts that the recipient can open on another wallet
- Native Nimiq Pay message signing for acknowledgment
- Recipient-wallet matching: only the intended recipient can acknowledge
- Honest status copy: payments are **reported sent**, not claimed as chain-confirmed by this app

## Nimiq Mini Apps / Nimiq Pay

Nimiquette runs inside **Nimiq Pay** as a Mini App. It talks to the wallet only through `@nimiq/mini-app-sdk` `init()`.

Used provider methods:

- `listAccounts()` — connect a Nimiq address (user confirmation)
- `sendBasicTransactionWithData()` — send NIM with intent text (user confirmation)
- `sign()` — recipient acknowledgment (user confirmation)
- `isConsensusEstablished()` / `getBlockNumber()` — wallet sync status (read-only)

Amounts are in Luna (`1 NIM = 100,000 Luna`). Private keys never leave Nimiq Pay.

## Security

- Nimiquette cannot see private keys, recovery phrases, or seed material.
- Account access, payments, and signatures always go through native Nimiq Pay approval dialogs.
- Do not paste secrets into the Mini App. It does not need them.

### Receipt honesty

Transaction details on a shared receipt are **supplied by the sender** after Nimiq Pay returns a transaction hash.

**Nimiquette does not fetch or independently confirm transactions from the chain.** A hash in the receipt is not proof that this app verified the payment on-chain.

## Testnet development

Use **Nimiq Testnet** so you do not spend real NIM.

1. In Nimiq Pay, long-press **Settings** for about 10 seconds to open the hidden network menu.
2. Switch to **Testnet**.
3. Use **Get free NIM** on the home empty state or in Top Up (Testnet credits the account for development).
4. Open Mini Apps and enter this app’s **Network URL** from the Vite terminal (for example `http://192.168.x.x:5173/`). Do not use `localhost` — inside the phone WebView that is the phone, not your computer.

Two-wallet happy path:

1. **Wallet A** — Connect, create an intent, send NIM, open the shared receipt, copy the receipt link.
2. **Wallet B** (the recipient) — Open the same Mini App URL with the `#r=…` receipt, connect the recipient wallet, acknowledge with a native signature.

## Local development

Requires Node.js and npm.

```bash
npm install
npm run dev
```

Vite is configured with `server.host: true` on port `5173` so the Network URL is reachable from Nimiq Pay on a phone on the same LAN.

On Windows you can use `npm.cmd run dev` if that is how npm is installed.

## Build

```bash
npm install
npm run build
```

This runs TypeScript (`vue-tsc -b`) and a Vite production build. Output is written to `dist/`.

Preview the production build locally with `npm run preview`.

## License

MIT. See [LICENSE](LICENSE).
