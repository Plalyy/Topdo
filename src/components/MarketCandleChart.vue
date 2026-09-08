<template>
  <section class="candle-chart" :class="{ 'candle-chart--maximized': maximized }" @click.stop>
    <header class="candle-chart__header">
      <div>
        <strong>{{ title }}</strong>
        <span>{{ market }} · {{ interval }} · {{ visibleRangeLabel }}</span>
      </div>
      <div class="candle-chart__actions">
        <div class="candle-chart__periods" aria-label="K线周期">
          <button
            v-for="period in KLINE_PERIODS"
            :key="period"
            type="button"
            :class="{ active: interval === period }"
            @click="emit('interval-change', period)"
          >
            {{ period }}
          </button>
        </div>
        <span v-if="chartSummary" :class="chartSummary.change >= 0 ? 'up' : 'down'">
          {{ chartSummary.change >= 0 ? '+' : '' }}{{ chartSummary.change.toFixed(2) }}%
        </span>
        <button
          type="button"
          class="candle-chart__maximize"
          :title="maximized ? '退出最大化' : '最大化 K 线'"
          @click="toggleMaximized"
        >
          <svg v-if="!maximized" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 2.5H2.5V6M10 2.5h3.5V6M6 13.5H2.5V10M10 13.5h3.5V10" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M5.5 2.5V5.5H2.5M10.5 2.5V5.5H13.5M5.5 13.5V10.5H2.5M10.5 13.5V10.5H13.5" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </header>

    <div v-if="loading" class="candle-chart__state">
      <span class="candle-chart__spinner"></span>
      <span>加载 {{ interval }} K 线…</span>
    </div>
    <div v-else-if="error" class="candle-chart__state candle-chart__state--error">
      {{ error }}
    </div>
    <div
      v-else-if="geometry"
      class="candle-chart__canvas"
      :class="{ dragging }"
      title="左右拖动查看时间线"
      @pointerdown="startDrag"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
    >
      <svg
        class="candle-chart__svg"
        :viewBox="`0 0 ${geometry.width} ${geometry.height}`"
        preserveAspectRatio="none"
        role="img"
        :aria-label="`${title} ${interval} K线图`"
      >
        <g class="candle-chart__grid">
          <line
            v-for="gridY in geometry.gridLines"
            :key="gridY"
            :x1="geometry.plotLeft"
            :x2="geometry.plotRight"
            :y1="gridY"
            :y2="gridY"
          />
        </g>
        <g>
          <template v-for="candle in geometry.candles" :key="candle.openTime">
            <line
              class="candle-chart__wick"
              :class="candle.up ? 'up' : 'down'"
              :x1="candle.x"
              :x2="candle.x"
              :y1="candle.highY"
              :y2="candle.lowY"
            />
            <rect
              class="candle-chart__body"
              :class="candle.up ? 'up' : 'down'"
              :x="candle.x - candle.bodyWidth / 2"
              :y="candle.bodyY"
              :width="candle.bodyWidth"
              :height="candle.bodyHeight"
              rx="0.7"
            />
          </template>
        </g>
        <line
          class="candle-chart__last-line"
          :x1="geometry.plotLeft"
          :x2="geometry.plotRight"
          :y1="geometry.lastPriceY"
          :y2="geometry.lastPriceY"
        />
        <rect
          class="candle-chart__last-label-bg"
          :x="geometry.plotRight + 3"
          :y="geometry.lastPriceY - 7"
          :width="geometry.labelWidth"
          height="14"
          rx="3"
        />
        <text
          class="candle-chart__last-label"
          :x="geometry.plotRight + 6"
          :y="geometry.lastPriceY + 3.5"
        >
          {{ geometry.lastPriceLabel }}
        </text>
        <text class="candle-chart__axis-label" :x="geometry.plotRight + 4" :y="geometry.plotTop + 4">
          {{ geometry.highLabel }}
        </text>
        <text class="candle-chart__axis-label" :x="geometry.plotRight + 4" :y="geometry.plotBottom">
          {{ geometry.lowLabel }}
        </text>
        <text
          v-for="label in geometry.timeLabels"
          :key="`${label.x}-${label.text}`"
          class="candle-chart__time-label"
          :class="{ 'candle-chart__time-label--end': label.anchor === 'end' }"
          :x="label.x"
          :y="geometry.height - 3"
        >
          {{ label.text }}
        </text>
      </svg>
    </div>
    <div v-if="geometry && maxStart > 0" class="candle-chart__timeline">
      <span>{{ timelineStartLabel }}</span>
      <input
        v-model.number="windowStart"
        type="range"
        min="0"
        :max="maxStart"
        step="1"
        aria-label="K线时间范围"
      />
      <button type="button" :disabled="windowStart === maxStart" @click="jumpToLatest">
        最新
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

interface MarketCandle {
  open_time: number;
  close_time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

const props = defineProps<{
  title: string;
  market: string;
  interval: '5m' | '15m';
  candles: MarketCandle[];
  loading: boolean;
  error: string;
  maximized?: boolean;
}>();

const emit = defineEmits<{
  (event: 'maximize'): void;
  (event: 'close'): void;
  (event: 'interval-change', interval: '5m' | '15m'): void;
}>();

const KLINE_PERIODS = ['5m', '15m'] as const;
const windowStart = ref(0);
const dragging = ref(false);
let dragStartX = 0;
let dragStartWindow = 0;

const normalizedCandles = computed(() =>
  props.candles
    .map((candle) => ({
      openTime: candle.open_time,
      closeTime: candle.close_time,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close)
    }))
    .filter((candle) =>
      [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
    )
);

const visibleCount = computed(() => props.maximized ? 48 : 30);
const maxStart = computed(() =>
  Math.max(0, normalizedCandles.value.length - visibleCount.value)
);
const visibleCandles = computed(() => {
  const start = Math.min(windowStart.value, maxStart.value);
  return normalizedCandles.value.slice(start, start + visibleCount.value);
});

watch(
  () => [props.candles, props.interval, props.maximized] as const,
  () => {
    windowStart.value = maxStart.value;
  },
  { immediate: true, flush: 'post' }
);

function toggleMaximized() {
  if (props.maximized) {
    emit('close');
  } else {
    emit('maximize');
  }
}

const chartSummary = computed(() => {
  if (visibleCandles.value.length < 2) return null;
  const first = visibleCandles.value[0].open;
  const last = visibleCandles.value[visibleCandles.value.length - 1]?.close;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  return { change: ((last - first) / first) * 100 };
});

function compactPrice(value: number): string {
  if (value >= 1000) return value.toFixed(1);
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(3);
  return value.toPrecision(4);
}

function timeLabel(timestamp: number, includeDate = false): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: includeDate ? 'numeric' : undefined,
    day: includeDate ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(timestamp));
}

const visibleRangeLabel = computed(() => {
  const candles = visibleCandles.value;
  if (candles.length === 0) return '暂无时间线';
  const first = candles[0];
  const last = candles[candles.length - 1];
  const includeDate = new Date(first.openTime).toDateString() !== new Date(last.closeTime).toDateString();
  return `${timeLabel(first.openTime, includeDate)}–${timeLabel(last.closeTime, includeDate)}`;
});

const timelineStartLabel = computed(() => {
  const first = normalizedCandles.value[0];
  return first ? timeLabel(first.openTime, true) : '更早';
});

function startDrag(event: PointerEvent) {
  if (maxStart.value === 0) return;
  dragging.value = true;
  dragStartX = event.clientX;
  dragStartWindow = windowStart.value;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function moveDrag(event: PointerEvent) {
  if (!dragging.value || !geometry.value) return;
  const plotWidth = geometry.value.plotRight - geometry.value.plotLeft;
  const pixelsPerCandle = plotWidth / visibleCount.value;
  const shift = Math.round((event.clientX - dragStartX) / Math.max(pixelsPerCandle, 1));
  windowStart.value = Math.min(maxStart.value, Math.max(0, dragStartWindow - shift));
}

function endDrag(event: PointerEvent) {
  if (!dragging.value) return;
  dragging.value = false;
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
}

function jumpToLatest() {
  windowStart.value = maxStart.value;
}

const geometry = computed(() => {
  const normalized = visibleCandles.value;
  if (normalized.length === 0) return null;

  const width = props.maximized ? 620 : 300;
  const height = props.maximized ? 360 : 126;
  const plotLeft = props.maximized ? 18 : 5;
  const plotRight = width - (props.maximized ? 70 : 53);
  const plotTop = props.maximized ? 16 : 8;
  const plotBottom = height - (props.maximized ? 28 : 18);
  const high = Math.max(...normalized.map((candle) => candle.high));
  const low = Math.min(...normalized.map((candle) => candle.low));
  const rawRange = high - low;
  const padding = rawRange > 0 ? rawRange * 0.08 : Math.max(high * 0.002, 0.01);
  const chartHigh = high + padding;
  const chartLow = low - padding;
  const range = chartHigh - chartLow;
  const y = (price: number) =>
    plotTop + ((chartHigh - price) / range) * (plotBottom - plotTop);
  const slot = (plotRight - plotLeft) / normalized.length;
  const bodyWidth = Math.max(2, Math.min(props.maximized ? 12 : 7, slot * 0.62));
  const candles = normalized.map((candle, index) => {
    const openY = y(candle.open);
    const closeY = y(candle.close);
    return {
      ...candle,
      x: plotLeft + slot * index + slot / 2,
      highY: y(candle.high),
      lowY: y(candle.low),
      bodyY: Math.min(openY, closeY),
      bodyHeight: Math.max(1.2, Math.abs(openY - closeY)),
      bodyWidth,
      up: candle.close >= candle.open
    };
  });
  const last = normalized[normalized.length - 1];
  const lastPriceLabel = compactPrice(last.close);
  const timeLabelIndexes = Array.from(new Set([
    0,
    Math.floor((normalized.length - 1) / 3),
    Math.floor(((normalized.length - 1) * 2) / 3),
    normalized.length - 1
  ]));

  return {
    width,
    height,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    gridLines: [0.25, 0.5, 0.75].map(
      (ratio) => plotTop + (plotBottom - plotTop) * ratio
    ),
    candles,
    lastPriceY: y(last.close),
    lastPriceLabel,
    labelWidth: Math.max(props.maximized ? 52 : 43, lastPriceLabel.length * 6.2),
    highLabel: compactPrice(high),
    lowLabel: compactPrice(low),
    timeLabels: timeLabelIndexes.map((index) => ({
      x: index === normalized.length - 1
        ? plotRight
        : plotLeft + slot * index + slot / 2,
      text: timeLabel(
        index === normalized.length - 1 ? normalized[index].closeTime : normalized[index].openTime,
        index === 0
      ),
      anchor: index === normalized.length - 1 ? 'end' : 'start'
    }))
  };
});
</script>

<style scoped>
.candle-chart {
  margin-top: 8px;
  border-top: 0.5px solid var(--border-light);
  animation: candle-chart-reveal 150ms cubic-bezier(0.2, 0.75, 0.25, 1) both;
}

.candle-chart__header {
  height: 33px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.candle-chart__header > div:first-child {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.candle-chart__header strong {
  color: var(--text-primary);
  font-size: 10px;
  font-weight: 700;
}

.candle-chart__header span {
  color: var(--text-tertiary);
  font-size: 8px;
}

.candle-chart__actions {
  display: flex;
  align-items: center;
  gap: 5px;
}

.candle-chart__actions > span.up {
  color: #14935f;
}

.candle-chart__actions > span.down {
  color: #e5484d;
}

.candle-chart__maximize {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0.5px solid var(--border-light);
  border-radius: 7px;
  background: var(--bg-solid);
  color: var(--text-secondary);
  cursor: pointer;
}

.candle-chart__maximize:hover {
  border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
  color: var(--primary);
}

.candle-chart__periods {
  height: 22px;
  padding: 2px;
  display: inline-flex;
  gap: 1px;
  border-radius: 7px;
  background: var(--bg-secondary);
}

.candle-chart__periods button {
  min-width: 27px;
  height: 18px;
  padding: 0 5px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-tertiary);
  font-family: inherit;
  font-size: 8px;
  font-weight: 700;
  cursor: pointer;
}

.candle-chart__periods button.active {
  background: var(--bg-solid);
  color: var(--primary);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--text-primary) 8%, transparent);
}

.candle-chart__canvas {
  height: 126px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.candle-chart__canvas.dragging {
  cursor: grabbing;
}

.candle-chart__svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.candle-chart__grid line {
  stroke: color-mix(in srgb, var(--border) 55%, transparent);
  stroke-width: 0.6;
  stroke-dasharray: 2 3;
}

.candle-chart__wick {
  stroke-width: 1;
}

.candle-chart__wick.up,
.candle-chart__body.up {
  stroke: #14935f;
  fill: #14935f;
}

.candle-chart__wick.down,
.candle-chart__body.down {
  stroke: #e5484d;
  fill: #e5484d;
}

.candle-chart__last-line {
  stroke: var(--primary);
  stroke-width: 0.75;
  stroke-dasharray: 3 2;
  opacity: 0.7;
}

.candle-chart__last-label-bg {
  fill: var(--primary);
}

.candle-chart__last-label {
  fill: white;
  font-size: 7px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.candle-chart__axis-label,
.candle-chart__time-label {
  fill: var(--text-tertiary);
  font-size: 7px;
  font-variant-numeric: tabular-nums;
}

.candle-chart__time-label--end {
  text-anchor: end;
}

.candle-chart__timeline {
  height: 24px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  color: var(--text-tertiary);
  font-size: 7px;
}

.candle-chart__timeline input {
  width: 100%;
  height: 14px;
  margin: 0;
  accent-color: var(--primary);
  cursor: ew-resize;
}

.candle-chart__timeline button {
  height: 19px;
  padding: 0 6px;
  border: 0.5px solid var(--border-light);
  border-radius: 6px;
  background: var(--bg-solid);
  color: var(--primary);
  font-family: inherit;
  font-size: 8px;
  font-weight: 650;
  cursor: pointer;
}

.candle-chart__timeline button:disabled {
  color: var(--text-placeholder);
  cursor: default;
}

.candle-chart__state {
  height: 126px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--text-tertiary);
  font-size: 9px;
}

.candle-chart__state--error {
  padding: 12px;
  color: #e5484d;
  line-height: 1.5;
  text-align: center;
}

.candle-chart__spinner {
  width: 13px;
  height: 13px;
  border: 1.5px solid color-mix(in srgb, var(--primary) 22%, transparent);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: candle-chart-spin 0.75s linear infinite;
}

.candle-chart--maximized {
  height: 100%;
  margin: 0;
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  border: 0;
  animation: candle-chart-maximize 180ms cubic-bezier(0.2, 0.75, 0.25, 1) both;
}

.candle-chart--maximized .candle-chart__header {
  height: 44px;
}

.candle-chart--maximized .candle-chart__header strong {
  font-size: 15px;
}

.candle-chart--maximized .candle-chart__header span {
  font-size: 10px;
}

.candle-chart--maximized .candle-chart__actions > span {
  font-size: 11px;
  font-weight: 700;
}

.candle-chart--maximized .candle-chart__maximize {
  width: 30px;
  height: 30px;
}

.candle-chart--maximized .candle-chart__periods {
  height: 28px;
}

.candle-chart--maximized .candle-chart__periods button {
  min-width: 34px;
  height: 24px;
  font-size: 10px;
}

.candle-chart--maximized .candle-chart__canvas,
.candle-chart--maximized .candle-chart__state {
  min-height: 0;
  height: auto;
  flex: 1;
}

.candle-chart--maximized .candle-chart__last-label,
.candle-chart--maximized .candle-chart__axis-label,
.candle-chart--maximized .candle-chart__time-label {
  font-size: 9px;
}

.candle-chart--maximized .candle-chart__timeline {
  height: 32px;
  font-size: 9px;
}

@keyframes candle-chart-reveal {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}

@keyframes candle-chart-maximize {
  from {
    opacity: 0;
    transform: scale(0.985);
  }
}

@keyframes candle-chart-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
