<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PaymentIntentFlow from './components/PaymentIntentFlow.vue'
import ReceiptPreview from './components/ReceiptPreview.vue'
import SharedReceipt from './components/SharedReceipt.vue'
import { parseNimiqAddress, shortenNimiqAddress } from './payment/address'
import { formatNimFromLuna } from './payment/amount'
import {
  connectProvider,
  explainProviderFailure,
  isUserRejection,
  resetProviderConnection,
  unwrapProviderResult,
} from './nimiq/provider'
import { decodeReceiptPayload, isAcknowledgmentBound, type ReceiptV1 } from './receipt/model'
import { clearReceiptFromLocation, readReceiptFromLocation, writeReceiptToLocation } from './receipt/share'

type ProviderStatus = 'connecting' | 'ready' | 'unavailable'
type ConsentStatus = 'idle' | 'requesting' | 'connected' | 'cancelled' | 'error'
type AppView = 'send' | 'receipt' | 'receipt-open'
type TrailStep = 'intent' | 'payment' | 'acknowledgment' | 'receipt'
type SendPhase = 'intent' | 'payment' | 'sent'

const TRAIL_STEPS: { id: TrailStep; label: string; title: string }[] = [
  { id: 'intent', label: 'Intent', title: 'Intent' },
  { id: 'payment', label: 'Payment', title: 'Payment' },
  { id: 'acknowledgment', label: 'Acknowledge', title: 'Acknowledgment' },
  { id: 'receipt', label: 'Receipt', title: 'Receipt' },
]

const isConnecting = ref(true)
const isReady = ref(false)
const providerStatus = ref<ProviderStatus>('connecting')
const consensusEstablished = ref<boolean | null>(null)
const walletStateError = ref<string | null>(null)

const consentStatus = ref<ConsentStatus>('idle')
const accounts = ref<string[]>([])
const consentError = ref<string | null>(null)

const view = ref<AppView>('send')
const receipt = ref<ReceiptV1 | null>(null)
const receiptInput = ref('')
const receiptInputError = ref<string | null>(null)
const sendPhase = ref<SendPhase>('intent')
const addressCopyState = ref<'idle' | 'copied' | 'error'>('idle')

const senderAddress = computed(() => {
  for (const account of accounts.value) {
    const parsed = parseNimiqAddress(account)
    if (parsed) {
      return parsed
    }
  }

  return null
})

const walletConnected = computed(() => consentStatus.value === 'connected')

const walletSummary = computed(() => {
  if (isConnecting.value || providerStatus.value === 'connecting') {
    return 'Looking for Nimiq Pay…'
  }

  if (providerStatus.value === 'unavailable') {
    return 'Open Nimiquette inside Nimiq Pay to connect a wallet.'
  }

  if (consentStatus.value === 'requesting') {
    return 'Nimiq Pay is asking you to approve wallet access.'
  }

  if (walletConnected.value && senderAddress.value) {
    return shortenNimiqAddress(senderAddress.value)
  }

  return 'Connect a wallet to send or acknowledge a payment.'
})

const walletPill = computed(() => {
  if (isConnecting.value || providerStatus.value === 'connecting') {
    return { state: 'connecting', label: 'Connecting' }
  }

  if (providerStatus.value === 'unavailable') {
    return { state: 'disconnected', label: 'Disconnected' }
  }

  if (consentStatus.value === 'requesting') {
    return { state: 'requesting', label: 'Waiting' }
  }

  if (walletConnected.value) {
    if (consensusEstablished.value === false) {
      return { state: 'syncing', label: 'Connected · Syncing' }
    }

    if (consensusEstablished.value === true) {
      return { state: 'ready', label: 'Ready to transact' }
    }

    return { state: 'connected', label: 'Connected' }
  }

  if (consentStatus.value === 'cancelled') {
    return { state: 'disconnected', label: 'Disconnected' }
  }

  if (consentStatus.value === 'error') {
    return { state: 'error', label: 'Needs attention' }
  }

  return { state: 'disconnected', label: 'Disconnected' }
})

const walletHint = computed(() => {
  if (walletConnected.value && consensusEstablished.value === false) {
    return 'Nimiquette is waiting for Nimiq consensus. Sending and acknowledgment stay paused until the wallet finishes syncing.'
  }

  if (walletConnected.value && walletStateError.value) {
    return walletStateError.value
  }

  if (walletConnected.value && consensusEstablished.value === true) {
    return null
  }

  if (walletConnected.value) {
    return 'This wallet is connected. Nimiquette has not confirmed Nimiq consensus yet. You can still continue.'
  }

  if (providerStatus.value === 'unavailable') {
    return null
  }

  return null
})

const showConnectButton = computed(() => (
  providerStatus.value === 'ready' && !walletConnected.value
))

const showAddressCopy = computed(() => (
  walletConnected.value && senderAddress.value !== null
))

watch(showAddressCopy, (visible) => {
  if (!visible) {
    addressCopyState.value = 'idle'
  }
})

async function copyConnectedAddress(): Promise<void> {
  if (!senderAddress.value) {
    return
  }

  try {
    await navigator.clipboard.writeText(senderAddress.value)
    addressCopyState.value = 'copied'
  }
  catch {
    addressCopyState.value = 'error'
  }
}

const homepageReceiptState = computed(() => {
  if (!receipt.value) {
    return 'pending'
  }

  if (isAcknowledgmentBound(receipt.value)) {
    return 'complete' as const
  }

  return receipt.value.ack ? 'mismatch' as const : 'pending' as const
})

const trailStep = computed<TrailStep>(() => {
  if (view.value === 'send') {
    if (sendPhase.value === 'sent') {
      return 'acknowledgment'
    }

    return sendPhase.value
  }

  if (receipt.value && isAcknowledgmentBound(receipt.value)) {
    return 'receipt'
  }

  if (receipt.value) {
    return 'acknowledgment'
  }

  return 'receipt'
})

const trailCompletedCount = computed(() => {
  if (view.value === 'send') {
    if (sendPhase.value === 'sent') {
      return 2
    }

    if (sendPhase.value === 'payment') {
      return 1
    }

    return 0
  }

  if (!receipt.value) {
    return 0
  }

  if (isAcknowledgmentBound(receipt.value)) {
    return 3
  }

  return 2
})

function trailState(step: TrailStep): 'done' | 'current' | 'upcoming' {
  const order: TrailStep[] = ['intent', 'payment', 'acknowledgment', 'receipt']
  const index = order.indexOf(step)

  if (step === trailStep.value) {
    return 'current'
  }

  if (index < trailCompletedCount.value) {
    return 'done'
  }

  return 'upcoming'
}

function applyReceipt(next: ReceiptV1): void {
  receipt.value = next
  view.value = 'receipt-open'
  receiptInputError.value = null
  writeReceiptToLocation(next)
}

function openReceiptScreen(): void {
  if (!receipt.value) {
    return
  }

  view.value = 'receipt-open'
}

function showSend(): void {
  view.value = 'send'
  receipt.value = null
  receiptInput.value = ''
  receiptInputError.value = null
  clearReceiptFromLocation()
}

function showReceiptView(): void {
  view.value = 'receipt'
}

function loadReceiptFromLocation(): void {
  const next = readReceiptFromLocation()
  if (next) {
    receipt.value = next
    view.value = 'receipt-open'
    receiptInputError.value = null
    return
  }

  if (window.location.hash.startsWith('#r=')) {
    receipt.value = null
    view.value = 'receipt'
    receiptInputError.value = 'This receipt link is not valid or uses an unsupported version.'
  }
}

function openPastedReceipt(): void {
  const next = decodeReceiptPayload(receiptInput.value)
  if (!next) {
    receiptInputError.value = 'Paste a Nimiquette receipt link. A transaction hash alone cannot reconstruct the payment.'
    return
  }

  applyReceipt(next)
}

onMounted(() => {
  void initializeProvider()
  loadReceiptFromLocation()
  window.addEventListener('hashchange', loadReceiptFromLocation)
})

onUnmounted(() => {
  window.removeEventListener('hashchange', loadReceiptFromLocation)
})

async function initializeProvider(): Promise<void> {
  isConnecting.value = true
  isReady.value = false
  providerStatus.value = 'connecting'
  consensusEstablished.value = null
  walletStateError.value = null

  try {
    const nimiq = await connectProvider()
    isReady.value = true
    providerStatus.value = 'ready'

    try {
      const [consensus] = await Promise.all([
        nimiq.isConsensusEstablished(),
        nimiq.getBlockNumber(),
      ])

      consensusEstablished.value = consensus
    }
    catch {
      walletStateError.value = 'Could not check whether the wallet has network consensus. Nimiq Pay will still ask you to approve each action.'
    }
  }
  catch {
    providerStatus.value = 'unavailable'
  }
  finally {
    isConnecting.value = false
  }
}

async function retryProvider(): Promise<void> {
  resetProviderConnection()
  consentStatus.value = 'idle'
  accounts.value = []
  consentError.value = null
  await initializeProvider()
}

async function connectWallet(): Promise<void> {
  if (!isReady.value || consentStatus.value === 'requesting') {
    return
  }

  consentStatus.value = 'requesting'
  consentError.value = null

  try {
    const nimiq = await connectProvider()
    const result = unwrapProviderResult(await nimiq.listAccounts())

    if (result.length === 0) {
      accounts.value = []
      consentStatus.value = 'error'
      consentError.value = 'No Nimiq addresses were shared. Try connecting again.'
      return
    }

    accounts.value = result
    consentStatus.value = 'connected'
  }
  catch (error) {
    accounts.value = []

    if (isUserRejection(error)) {
      consentStatus.value = 'cancelled'
      consentError.value = 'Wallet access was cancelled. You can connect again when you are ready.'
      return
    }

    consentStatus.value = 'error'
    consentError.value = explainProviderFailure(error, 'connect')
  }
}
</script>

<template>
  <main class="screen">
    <header class="brand">
      <p class="eyebrow">Nimiq Mini App</p>
      <h1>Nimiquette</h1>
      <p class="lede">
        Blockchains record where money went.<br>
        Nimiquette records why.
      </p>
      <p class="purpose">
        Social meaning and recipient acknowledgment for Nimiq payments.
      </p>
    </header>

    <ol class="flow-trail" aria-label="Intent, Payment, Acknowledgment, Receipt">
      <li
        v-for="(item, index) in TRAIL_STEPS"
        :key="item.id"
        :data-state="trailState(item.id)"
        :aria-label="item.title"
        :aria-current="trailState(item.id) === 'current' ? 'step' : undefined"
      >
        <span class="flow-index" aria-hidden="true">{{ index + 1 }}</span>
        <span class="flow-label">{{ item.label }}</span>
      </li>
    </ol>

    <nav class="mode-switch" aria-label="Send or receipt">
      <button
        type="button"
        class="mode-tab"
        :aria-pressed="view === 'send'"
        @click="showSend"
      >
        Send a payment
      </button>
      <button
        type="button"
        class="mode-tab"
        :aria-pressed="view !== 'send'"
        @click="showReceiptView"
      >
        Open a receipt
      </button>
    </nav>

    <section
      class="card wallet-bar"
      aria-live="polite"
      :aria-busy="isConnecting || providerStatus === 'connecting'"
      :data-connecting="isConnecting || providerStatus === 'connecting' ? 'true' : undefined"
    >
      <div class="card-header">
        <h2>Wallet</h2>
        <span class="status" :data-state="walletPill.state">{{ walletPill.label }}</span>
      </div>

      <div v-if="showAddressCopy" class="wallet-address-row">
        <p class="wallet-summary">{{ walletSummary }}</p>
        <button
          type="button"
          class="paste-action"
          aria-label="Copy connected wallet address"
          @click="copyConnectedAddress"
        >
          {{ addressCopyState === 'copied' ? 'Copied' : 'Copy' }}
        </button>
      </div>
      <p v-else class="wallet-summary" :class="{ break: walletConnected }">
        {{ walletSummary }}
      </p>

      <p v-if="showAddressCopy && addressCopyState === 'error'" class="detail" data-tone="calm">
        Could not copy the address. Copy it from Nimiq Pay instead.
      </p>

      <p v-if="walletHint" class="detail" data-tone="calm">
        {{ walletHint }}
      </p>

      <p v-if="consentError" class="detail" :data-tone="consentStatus === 'error' ? 'alert' : 'calm'">
        {{ consentError }}
      </p>

      <button
        v-if="providerStatus === 'unavailable'"
        type="button"
        class="action secondary"
        :disabled="isConnecting"
        @click="retryProvider"
      >
        Try connecting again
      </button>
      <button
        v-else-if="showConnectButton"
        type="button"
        class="action"
        :disabled="consentStatus === 'requesting'"
        @click="connectWallet"
      >
        {{ consentStatus === 'requesting' ? 'Waiting for approval…' : 'Connect Nimiq wallet' }}
      </button>
    </section>

    <PaymentIntentFlow
      v-if="view === 'send'"
      :can-send="isReady && consentStatus === 'connected'"
      :consensus-established="consensusEstablished"
      :sender-address="senderAddress"
      @open-receipt="applyReceipt"
      @phase-change="sendPhase = $event"
    />

    <SharedReceipt
      v-else-if="view === 'receipt-open' && receipt"
      :receipt="receipt"
      :accounts="accounts"
      :wallet-ready="isReady"
      :wallet-connected="consentStatus === 'connected'"
      :consensus-established="consensusEstablished"
      @update-receipt="applyReceipt"
    />

    <template v-else>
      <ReceiptPreview
        v-if="receipt"
        :intent="receipt.payment.intent"
        :amount-nim="formatNimFromLuna(receipt.payment.luna)"
        :acknowledgment="homepageReceiptState"
      >
        <p class="message">
          Open the receipt to acknowledge it or copy the share link.
        </p>
        <button type="button" class="action" @click="openReceiptScreen">
          Open receipt
        </button>
      </ReceiptPreview>

      <section class="card">
        <div class="card-header">
          <h2>{{ receipt ? 'Open another receipt' : 'Open a receipt' }}</h2>
        </div>
        <p class="message">
          Paste a Nimiquette receipt link. A transaction hash alone is not enough.
        </p>
        <label class="field">
          <span>Receipt link</span>
          <textarea
            v-model="receiptInput"
            rows="4"
            autocomplete="off"
            spellcheck="false"
            placeholder="https://…/#r=… or the receipt payload"
          />
        </label>
        <p v-if="receiptInputError" class="detail" data-tone="alert">
          {{ receiptInputError }}
        </p>
        <button type="button" class="action" :disabled="receiptInput.trim().length === 0" @click="openPastedReceipt">
          Open receipt
        </button>
      </section>
    </template>
  </main>
</template>
