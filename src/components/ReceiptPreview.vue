<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  intent: string
  amountNim: string
  acknowledgment: 'pending' | 'complete' | 'mismatch'
}>()

const statusState = computed(() => {
  if (props.acknowledgment === 'complete') {
    return 'ready'
  }

  if (props.acknowledgment === 'mismatch') {
    return 'error'
  }

  return 'syncing'
})

const statusLabel = computed(() => {
  if (props.acknowledgment === 'complete') {
    return 'Acknowledged'
  }

  if (props.acknowledgment === 'mismatch') {
    return 'Needs attention'
  }

  return 'Pending'
})

const matchState = computed(() => {
  if (props.acknowledgment === 'complete') {
    return 'ok'
  }

  if (props.acknowledgment === 'mismatch') {
    return 'no'
  }

  return 'wait'
})

const matchLabel = computed(() => {
  if (props.acknowledgment === 'complete') {
    return 'Acknowledgment complete'
  }

  if (props.acknowledgment === 'mismatch') {
    return 'Acknowledgment does not match'
  }

  return 'Acknowledgment pending'
})
</script>

<template>
  <section class="card receipt-preview">
    <div class="card-header">
      <h2>Shared receipt</h2>
      <span class="status" :data-state="statusState">{{ statusLabel }}</span>
    </div>

    <p class="result-hero">
      <span class="hero-kicker">{{ intent }}</span>
      <span class="hero-amount">{{ amountNim }} <span>NIM</span></span>
    </p>

    <p class="match-line" :data-state="matchState">{{ matchLabel }}</p>

    <slot />
  </section>
</template>
