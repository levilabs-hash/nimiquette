<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { parseNimiqAddress } from '../payment/address'
import { nimAmountIssue, parseNimAmount, type NimAmountIssue } from '../payment/amount'
import { buildPaymentData, INTENT_HINTS, INTENT_TYPES, MESSAGE_MAX_LENGTH, type IntentType } from '../payment/intent'
import { connectProvider, explainProviderFailure, isUserRejection, unwrapProviderResult } from '../nimiq/provider'
import { createSenderReportedReceipt, type ReceiptV1 } from '../receipt/model'
import ReceiptPreview from './ReceiptPreview.vue'

const props = defineProps<{
  canSend: boolean
  consensusEstablished: boolean | null
  senderAddress: string | null
}>()

const emit = defineEmits<{
  openReceipt: [receipt: ReceiptV1]
  phaseChange: [phase: 'intent' | 'payment' | 'sent']
}>()

type Step = 'create' | 'review'
type SendStatus = 'idle' | 'sending' | 'success' | 'cancelled' | 'error'

const step = ref<Step>('create')
const intentType = ref<IntentType | null>(null)
const amountInput = ref('')
const recipientInput = ref('')
const messageInput = ref('')

const sendStatus = ref<SendStatus>('idle')
const sendError = ref<string | null>(null)
const transactionHash = ref<string | null>(null)
const pasteHint = ref<string | null>(null)

const parsedAmount = computed(() => parseNimAmount(amountInput.value))
const parsedRecipient = computed(() => parseNimiqAddress(recipientInput.value))
const message = computed(() => messageInput.value.trim())
const paymentData = computed(() => (
  intentType.value ? buildPaymentData(intentType.value, messageInput.value) : ''
))

const amountIssue = computed(() => nimAmountIssue(amountInput.value))

const amountError = computed(() => (
  amountIssue.value ? amountIssueMessage(amountIssue.value) : null
))

const recipientError = computed(() => {
  if (recipientInput.value.trim().length === 0) {
    return null
  }

  return parsedRecipient.value ? null : 'Enter a valid Nimiq address.'
})

const canReview = computed(() => (
  intentType.value !== null
  && parsedAmount.value !== null
  && parsedRecipient.value !== null
  && messageInput.value.length <= MESSAGE_MAX_LENGTH
))

const reviewHint = computed(() => {
  if (canReview.value) {
    return null
  }

  if (!intentType.value) {
    return 'Choose why you are sending this payment.'
  }

  if (!parsedAmount.value) {
    if (amountInput.value.trim().length === 0) {
      return 'Enter how much NIM to send.'
    }

    return amountIssue.value
      ? amountIssueMessage(amountIssue.value)
      : 'Enter an amount greater than 0 NIM, with up to 5 decimal places.'
  }

  if (!parsedRecipient.value) {
    return recipientInput.value.trim().length === 0
      ? 'Enter the recipient’s Nimiq address.'
      : 'That address is not a valid Nimiq address.'
  }

  return null
})

const senderReportedReceipt = computed(() => {
  if (sendStatus.value !== 'success' || !transactionHash.value || !intentType.value || !parsedAmount.value || !parsedRecipient.value || !props.senderAddress) {
    return null
  }

  return createSenderReportedReceipt({
    txHash: transactionHash.value,
    intent: intentType.value,
    luna: parsedAmount.value.luna,
    sender: props.senderAddress,
    recipient: parsedRecipient.value,
    message: message.value,
  })
})

const flowPhase = computed(() => {
  if (sendStatus.value === 'success') {
    return 'sent' as const
  }

  if (step.value === 'review') {
    return 'payment' as const
  }

  return 'intent' as const
})

watch(flowPhase, (phase) => {
  emit('phaseChange', phase)
}, { immediate: true })

function amountIssueMessage(issue: NimAmountIssue): string {
  if (issue === 'too-large') {
    return 'That amount is too large to send safely. Enter a smaller NIM amount.'
  }

  if (issue === 'too-small') {
    return 'Enter an amount greater than 0 NIM, with up to 5 decimal places.'
  }

  return 'Enter an amount greater than 0 NIM, with up to 5 decimal places.'
}

const networkNotReady = computed(() => props.consensusEstablished === false)
const canRequestPayment = computed(() => (
  props.canSend && !networkNotReady.value && sendStatus.value !== 'sending'
))

function openSharedReceipt(): void {
  if (!senderReportedReceipt.value) {
    return
  }

  emit('openReceipt', senderReportedReceipt.value)
}

function openReview(): void {
  if (!canReview.value) {
    return
  }

  sendStatus.value = 'idle'
  sendError.value = null
  transactionHash.value = null
  step.value = 'review'
}

function backToCreate(): void {
  sendStatus.value = 'idle'
  sendError.value = null
  step.value = 'create'
}

function resetIntent(): void {
  step.value = 'create'
  intentType.value = null
  amountInput.value = ''
  recipientInput.value = ''
  messageInput.value = ''
  sendStatus.value = 'idle'
  sendError.value = null
  transactionHash.value = null
  pasteHint.value = null
}

async function pasteRecipient(): Promise<void> {
  pasteHint.value = null

  try {
    const text = await navigator.clipboard.readText()
    if (text.trim().length === 0) {
      pasteHint.value = 'The clipboard is empty. Paste a Nimiq address into the field.'
      return
    }

    recipientInput.value = text
  }
  catch {
    pasteHint.value = 'Could not read the clipboard. Paste the address into the field instead.'
  }
}

async function requestPayment(): Promise<void> {
  if (!canRequestPayment.value || !intentType.value || !parsedAmount.value || !parsedRecipient.value) {
    return
  }

  sendStatus.value = 'sending'
  sendError.value = null
  transactionHash.value = null

  try {
    const nimiq = await connectProvider()
    const hash = unwrapProviderResult(await nimiq.sendBasicTransactionWithData({
      recipient: parsedRecipient.value,
      value: parsedAmount.value.luna,
      data: paymentData.value,
    }))

    transactionHash.value = hash
    sendStatus.value = 'success'
  }
  catch (error) {
    if (isUserRejection(error)) {
      sendStatus.value = 'cancelled'
      sendError.value = 'The payment was cancelled. No NIM was sent. You can review the intent and try again.'
      return
    }

    sendStatus.value = 'error'
    sendError.value = explainProviderFailure(error, 'payment')
  }
}
</script>

<template>
  <ReceiptPreview
    v-if="sendStatus === 'success'"
    :intent="intentType ?? ''"
    :amount-nim="parsedAmount?.displayNim ?? ''"
    acknowledgment="pending"
  >
    <p class="message">
      Share the receipt so the recipient can acknowledge this payment.
    </p>

    <p v-if="!senderReportedReceipt" class="detail" data-tone="calm">
      Connect the sending wallet to share a receipt for acknowledgment.
    </p>

    <button
      v-if="senderReportedReceipt"
      type="button"
      class="action"
      @click="openSharedReceipt"
    >
      Open receipt
    </button>
    <button
      type="button"
      class="action secondary"
      @click="resetIntent"
    >
      Create another intent
    </button>
  </ReceiptPreview>

  <section v-else class="card" :class="{ 'intent-form': step === 'create', 'review-card': step === 'review' }">
    <template v-if="step === 'create'">
      <div class="card-header">
        <h2>Payment intent</h2>
        <span class="status" data-state="idle">Draft</span>
      </div>

      <p class="message">
        Choose why this payment exists, then add the amount and recipient.
      </p>

      <fieldset class="field">
        <legend>Why are you sending this?</legend>
        <div class="intent-grid">
          <button
            v-for="intent in INTENT_TYPES"
            :key="intent"
            type="button"
            class="intent-option"
            :aria-pressed="intentType === intent"
            @click="intentType = intent"
          >
            <span class="intent-dot" aria-hidden="true" />
            <span>{{ intent }}</span>
          </button>
        </div>
        <p v-if="intentType" class="field-hint">{{ INTENT_HINTS[intentType] }}</p>
      </fieldset>

      <label class="field amount-field">
        <span>Amount</span>
        <span class="field-hint">Enter the amount in NIM.</span>
        <div class="amount-input">
          <input
            v-model="amountInput"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            placeholder="0.00"
            aria-label="Amount in NIM"
          >
          <span class="amount-suffix">NIM</span>
        </div>
        <small v-if="amountError" class="detail" data-tone="alert">{{ amountError }}</small>
      </label>

      <div class="field recipient-field">
        <div class="field-top">
          <span id="recipient-label">Recipient</span>
          <button
            type="button"
            class="paste-action"
            aria-label="Paste recipient address"
            @click="pasteRecipient"
          >
            Paste
          </button>
        </div>
        <span class="field-hint">Nimiq address that should receive this payment.</span>
        <textarea
          id="recipient-input"
          v-model="recipientInput"
          class="recipient-input"
          rows="2"
          autocomplete="off"
          spellcheck="false"
          aria-labelledby="recipient-label"
          placeholder="NQXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX"
          @input="pasteHint = null"
        />
        <small v-if="pasteHint" class="detail" data-tone="calm">{{ pasteHint }}</small>
        <small v-if="recipientError" class="detail" data-tone="alert">{{ recipientError }}</small>
      </div>

      <div class="field message-field">
        <label>
          <span>Message <em>optional</em></span>
          <span class="field-hint">Shown on the shared receipt.</span>
          <textarea
            v-model="messageInput"
            class="message-input"
            rows="3"
            :maxlength="MESSAGE_MAX_LENGTH"
            placeholder="Add a short note for this payment"
          />
        </label>
        <small class="counter">{{ messageInput.length }}/{{ MESSAGE_MAX_LENGTH }}</small>
      </div>

      <p v-if="reviewHint" class="detail" data-tone="calm">{{ reviewHint }}</p>

      <button
        type="button"
        class="action review-cta"
        :disabled="!canReview"
        @click="openReview"
      >
        Review payment intent
      </button>
    </template>

    <template v-else>
      <div class="card-header">
        <h2>Review intent</h2>
        <span
          class="status"
          :data-state="sendStatus === 'sending' ? 'requesting' : sendStatus === 'error' ? 'error' : sendStatus === 'cancelled' ? 'cancelled' : 'idle'"
        >
          {{
            sendStatus === 'sending'
              ? 'Waiting'
              : sendStatus === 'cancelled'
                ? 'Cancelled'
                : sendStatus === 'error'
                  ? 'Needs attention'
                  : 'Review'
          }}
        </span>
      </div>

      <p class="result-hero">
        <span class="hero-kicker">{{ intentType }}</span>
        <span class="hero-amount">{{ parsedAmount?.displayNim }} <span>NIM</span></span>
      </p>
      <p class="message">
        Confirm these details. Nimiq Pay will ask you to approve the payment.
      </p>

      <dl class="facts">
        <div>
          <dt>Intent</dt>
          <dd>{{ intentType }}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd>{{ parsedAmount?.displayNim }} NIM</dd>
        </div>
        <div class="stack">
          <dt>Recipient</dt>
          <dd class="break">{{ parsedRecipient }}</dd>
        </div>
        <div class="stack">
          <dt>Message</dt>
          <dd>{{ message.length > 0 ? message : 'None' }}</dd>
        </div>
      </dl>

      <p v-if="!canSend" class="detail" data-tone="calm">
        Connect your Nimiq wallet above before sending.
      </p>

      <p v-else-if="networkNotReady" class="detail" data-tone="calm">
        The wallet is still syncing. Wait until it is ready, then send.
      </p>

      <p v-if="sendStatus === 'sending'" class="detail" data-tone="calm">
        Nimiq Pay is asking you to approve this payment.
      </p>

      <p v-if="sendError" class="detail" :data-tone="sendStatus === 'cancelled' ? 'calm' : 'alert'">
        {{ sendError }}
      </p>

      <button
        type="button"
        class="action"
        :disabled="!canRequestPayment"
        @click="requestPayment"
      >
        {{ sendStatus === 'sending' ? 'Waiting for approval…' : 'Send NIM with this intent' }}
      </button>
      <button
        type="button"
        class="action secondary"
        :disabled="sendStatus === 'sending'"
        @click="backToCreate"
      >
        Back to edit
      </button>
    </template>
  </section>
</template>
