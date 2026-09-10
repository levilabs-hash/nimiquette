<script setup lang="ts">
import { computed, ref } from 'vue'
import { parseNimiqAddress, shortenNimiqAddress } from '../payment/address'
import { formatNimFromLuna } from '../payment/amount'
import {
  buildCanonicalAckMessage,
  findMatchingRecipient,
  isAcknowledgmentBound,
  type ReceiptV1,
} from '../receipt/model'
import { buildShareUrl, writeReceiptToLocation } from '../receipt/share'
import { connectProvider, explainProviderFailure, isUserRejection, unwrapProviderResult } from '../nimiq/provider'

const props = defineProps<{
  receipt: ReceiptV1
  accounts: string[]
  walletReady: boolean
  walletConnected: boolean
  consensusEstablished: boolean | null
}>()

const emit = defineEmits<{
  updateReceipt: [receipt: ReceiptV1]
}>()

type AckStatus = 'idle' | 'requesting' | 'cancelled' | 'error'

const ackStatus = ref<AckStatus>('idle')
const ackError = ref<string | null>(null)
const copyState = ref<'idle' | 'copied' | 'manual'>('idle')
const shareLink = ref('')
const shareLinkOpen = ref(false)

const matchingRecipient = computed(() => (
  findMatchingRecipient(props.accounts, props.receipt.payment.recipient)
))

const connectedAddress = computed(() => {
  for (const account of props.accounts) {
    const parsed = parseNimiqAddress(account)
    if (parsed) {
      return parsed
    }
  }

  return props.accounts[0] ?? null
})

const acknowledgmentBound = computed(() => isAcknowledgmentBound(props.receipt))
const amountNim = computed(() => formatNimFromLuna(props.receipt.payment.luna))
const paymentMessage = computed(() => props.receipt.payment.message ?? '')
const networkNotReady = computed(() => props.consensusEstablished === false)
const recipientMismatch = computed(() => (
  props.walletConnected && matchingRecipient.value === null && !acknowledgmentBound.value
))

const canAcknowledge = computed(() => (
  props.walletReady
  && props.walletConnected
  && matchingRecipient.value !== null
  && !acknowledgmentBound.value
  && ackStatus.value !== 'requesting'
  && !networkNotReady.value
))

const walletMatchLabel = computed(() => {
  if (matchingRecipient.value) {
    return 'This connected wallet is the intended recipient.'
  }

  if (props.walletConnected) {
    return 'The connected wallet is not the intended recipient. Acknowledgment stays disabled.'
  }

  return 'Connect the recipient wallet to acknowledge.'
})

function ackBlocker(): string | null {
  if (acknowledgmentBound.value) {
    return null
  }

  if (!props.walletReady) {
    return 'Open this receipt inside Nimiq Pay to acknowledge with a wallet signature.'
  }

  if (!props.walletConnected) {
    return 'Connect the recipient wallet above, then acknowledge this payment.'
  }

  if (networkNotReady.value) {
    return 'The wallet is still syncing. Wait until it is ready, then acknowledge.'
  }

  if (!matchingRecipient.value) {
    return 'Switch to the recipient wallet in Nimiq Pay, then connect it here.'
  }

  return null
}

async function copyShareLink(): Promise<void> {
  const url = buildShareUrl(props.receipt)
  shareLink.value = url

  try {
    await navigator.clipboard.writeText(url)
    copyState.value = 'copied'
  }
  catch {
    shareLinkOpen.value = false
    copyState.value = 'manual'
  }
}

async function acknowledge(): Promise<void> {
  if (!canAcknowledge.value || !matchingRecipient.value) {
    return
  }

  ackStatus.value = 'requesting'
  ackError.value = null

  const signedMessage = buildCanonicalAckMessage(props.receipt.payment)

  try {
    const nimiq = await connectProvider()
    const result = unwrapProviderResult(await nimiq.sign(signedMessage))

    if (typeof result.publicKey !== 'string' || result.publicKey.length === 0 || typeof result.signature !== 'string' || result.signature.length === 0) {
      throw new Error('Nimiq Pay did not return a signature.')
    }

    const nextReceipt: ReceiptV1 = {
      v: props.receipt.v,
      payment: props.receipt.payment,
      ack: {
        address: matchingRecipient.value,
        publicKey: result.publicKey,
        signature: result.signature,
        signedMessage,
      },
    }

    if (!isAcknowledgmentBound(nextReceipt)) {
      throw new Error('The signature does not match this payment.')
    }

    writeReceiptToLocation(nextReceipt)
    emit('updateReceipt', nextReceipt)
    ackStatus.value = 'idle'
    copyState.value = 'idle'
  }
  catch (error) {
    if (isUserRejection(error)) {
      ackStatus.value = 'cancelled'
      ackError.value = 'Acknowledgment was cancelled. No signature was created. You can try again when you are ready.'
      return
    }

    ackStatus.value = 'error'
    ackError.value = explainProviderFailure(error, 'sign')
  }
}
</script>

<template>
  <article class="card receipt">
    <div class="card-header">
      <h2>Shared receipt</h2>
      <span
        class="status"
        :data-state="acknowledgmentBound ? 'ready' : receipt.ack ? 'error' : 'syncing'"
      >
        {{ acknowledgmentBound ? 'Acknowledged' : receipt.ack ? 'Needs attention' : 'Pending' }}
      </span>
    </div>

    <p
      v-if="!acknowledgmentBound"
      class="status-banner"
      :data-state="receipt.ack ? 'error' : 'idle'"
    >
      {{ receipt.ack ? 'Acknowledgment does not match' : 'Waiting for the recipient to acknowledge' }}
    </p>

    <p class="receipt-hero">
      <span class="hero-kicker">{{ receipt.payment.intent }}</span>
      <span class="hero-amount">{{ amountNim }} <span>NIM</span></span>
    </p>
    <p class="message">
      {{ acknowledgmentBound ? 'The recipient acknowledged this payment.' : 'Share this receipt so the recipient can acknowledge it.' }}
    </p>
    <p class="quiet-note">
      Nimiquette does not fetch or independently confirm this transaction from the chain.
    </p>

    <details class="receipt-details">
      <summary>
        <span class="details-copy">
          <span class="details-title">Receipt details</span>
          <span class="details-hint">Sender, recipient, message, and transaction hash</span>
        </span>
      </summary>
      <dl class="facts">
        <div>
          <dt>Intent</dt>
          <dd>{{ receipt.payment.intent }}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd>{{ amountNim }} NIM</dd>
        </div>
        <div>
          <dt>Sent status</dt>
          <dd>Reported sent</dd>
        </div>
        <div class="stack">
          <dt>Sender</dt>
          <dd class="break">{{ receipt.payment.sender }}</dd>
        </div>
        <div class="stack">
          <dt>Recipient</dt>
          <dd class="break">{{ receipt.payment.recipient }}</dd>
        </div>
        <div class="stack">
          <dt>Message</dt>
          <dd>{{ paymentMessage.length > 0 ? paymentMessage : 'None' }}</dd>
        </div>
        <div class="stack">
          <dt>Transaction hash</dt>
          <dd class="break">{{ receipt.payment.txHash }}</dd>
        </div>
      </dl>
    </details>

    <section class="receipt-block">
      <h3>Recipient acknowledgment</h3>

      <p
        v-if="!acknowledgmentBound"
        class="match-line"
        :data-state="matchingRecipient ? 'ok' : walletConnected ? 'no' : 'wait'"
      >
        {{ walletMatchLabel }}
      </p>

      <dl v-if="recipientMismatch" class="facts">
        <div class="stack">
          <dt>Intended recipient</dt>
          <dd class="break">{{ shortenNimiqAddress(receipt.payment.recipient) }}</dd>
        </div>
        <div v-if="connectedAddress" class="stack">
          <dt>Connected wallet</dt>
          <dd class="break">{{ shortenNimiqAddress(connectedAddress) }}</dd>
        </div>
      </dl>

      <template v-if="acknowledgmentBound && receipt.ack">
        <div class="ack-success">
          <p class="ack-success-title">Acknowledged</p>
          <p class="message">
            Signed with Nimiq Pay. The signature is bound to this payment’s hash and details.
          </p>
          <dl class="facts">
            <div class="stack">
              <dt>Signing wallet</dt>
              <dd class="break">{{ shortenNimiqAddress(receipt.ack.address) }}</dd>
            </div>
          </dl>
        </div>
        <details class="signature-details">
          <summary>
            <span class="details-copy">
              <span class="details-title">Signature details</span>
              <span class="details-hint">Public key and signature</span>
            </span>
          </summary>
          <dl class="facts">
            <div class="stack">
              <dt>Public key</dt>
              <dd class="break">{{ receipt.ack.publicKey }}</dd>
            </div>
            <div class="stack">
              <dt>Signature</dt>
              <dd class="break">{{ receipt.ack.signature }}</dd>
            </div>
          </dl>
        </details>
      </template>

      <template v-else>
        <p v-if="receipt.ack" class="detail" data-tone="alert">
          This acknowledgment does not match this payment, so it is not shown as valid.
        </p>
        <p v-else-if="matchingRecipient" class="message">
          Nimiq Pay will ask you to sign. Nimiquette never sees private keys.
        </p>
        <p v-else class="message">
          Connect the recipient wallet, then acknowledge. Nimiquette never sees private keys.
        </p>

        <p v-if="ackBlocker()" class="detail" data-tone="calm">
          {{ ackBlocker() }}
        </p>

        <p v-if="ackStatus === 'requesting'" class="detail" data-tone="calm">
          Nimiq Pay is asking you to approve this signature.
        </p>

        <p v-if="ackError" class="detail" :data-tone="ackStatus === 'cancelled' ? 'calm' : 'alert'">
          {{ ackError }}
        </p>

        <button
          type="button"
          class="action ack-cta"
          :disabled="!canAcknowledge"
          @click="acknowledge"
        >
          {{ ackStatus === 'requesting' ? 'Waiting for approval…' : 'Acknowledge this payment' }}
        </button>
      </template>
    </section>

    <button type="button" class="action secondary copy-cta" @click="copyShareLink">
      {{ copyState === 'copied' ? '✓ Receipt link copied' : 'Copy receipt link' }}
    </button>
    <details
      v-if="copyState === 'manual'"
      class="share-link-details"
      :open="shareLinkOpen"
      @toggle="shareLinkOpen = ($event.target as HTMLDetailsElement).open"
    >
      <summary>
        <span class="details-copy">
          <span class="details-title">Receipt link</span>
          <span class="details-hint">Copy this URL if automatic copy is unavailable</span>
        </span>
      </summary>
      <p class="detail break">{{ shareLink }}</p>
    </details>
  </article>
</template>
