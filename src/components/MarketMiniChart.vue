<template>
  <div
    class="mini-chart"
    :class="toneClass"
    :title="geometry ? '最近 20 根 5m K线走势' : '走势加载中'"
    aria-hidden="true"
  >
    <span v-if="loading && !geometry" class="mini-chart__loading"></span>
    <svg v-else-if="geometry" viewBox="0 0 58 28" preserveAspectRatio="none">
      <line
        v-for="candle in geometry.candles"
        :key="candle.openTime"
        class="mini-chart__wick"
        :class="candle.up ? 'up' : 'down'"
        :x1="candle.x"
        :x2="candle.x"
        :y1="candle.highY"
        :y2="candle.lowY"
      />
      <rect
        v-for="candle in geometry.candles"
        :key="`${candle.openTime}-body`"
        class="mini-chart__body"
        :class="candle.up ? 'up' : 'down'"
        :x="candle.x - candle.bodyWidth / 2"
        :y="candle.bodyY"
        :width="candle.bodyWidth"
        :height="candle.bodyHeight"
        rx="0.35"
      />
    </svg>
    <span v-else class="mini-chart__empty">···</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface MarketCandle {
  open_time: number;
  open: string;
  high: string;
  low: string;
  close: string;
}

const props = defineProps<{
  candles: MarketCandle[];
  loading?: boolean;
  changePercent?: string | null;
}>();

const toneClass = computed(() => {
  const change = Number(props.changePercent);
  if (!Number.isFinite(change) || change === 0) return 'mini-chart--flat';
  return change > 0 ? 'mini-chart--up' : 'mini-chart--down';
});

const geometry = computed(() => {
  const normalized = props.candles
    .slice(-20)
    .map((candle) => ({
      openTime: candle.open_time,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close)
    }))
    .filter((candle) =>
      [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
    );
  if (normalized.length < 2) return null;

  const high = Math.max(...normalized.map((candle) => candle.high));
  const low = Math.min(...normalized.map((candle) => candle.low));
  const range = Math.max(high - low, Math.abs(high) * 0.001, 0.0001);
  const slot = 58 / normalized.length;
  const y = (value: number) => 2 + ((high - value) / range) * 24;

  return {
    candles: normalized.map((candle, index) => {
      const openY = y(candle.open);
      const closeY = y(candle.close);
      return {
        ...candle,
        x: slot * index + slot / 2,
        highY: y(candle.high),
        lowY: y(candle.low),
        bodyY: Math.min(openY, closeY),
        bodyHeight: Math.max(0.8, Math.abs(openY - closeY)),
        bodyWidth: Math.max(1, Math.min(2.2, slot * 0.58)),
        up: candle.close >= candle.open
      };
    })
  };
});
</script>

<style scoped>
.mini-chart {
  width: 58px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: color-mix(in srgb, currentColor 4%, transparent);
  overflow: hidden;
}

.mini-chart svg {
  width: 100%;
  height: 100%;
}

.mini-chart__wick {
  stroke-width: 0.65;
}

.mini-chart__wick.up,
.mini-chart__body.up {
  stroke: #14935f;
  fill: #14935f;
}

.mini-chart__wick.down,
.mini-chart__body.down {
  stroke: #e5484d;
  fill: #e5484d;
}

.mini-chart--up {
  color: #14935f;
}

.mini-chart--down {
  color: #e5484d;
}

.mini-chart--flat {
  color: var(--text-tertiary);
}

.mini-chart__loading {
  width: 11px;
  height: 11px;
  border: 1.5px solid color-mix(in srgb, var(--text-tertiary) 20%, transparent);
  border-top-color: var(--text-tertiary);
  border-radius: 50%;
  animation: mini-chart-spin 0.8s linear infinite;
}

.mini-chart__empty {
  color: var(--text-placeholder);
  font-size: 10px;
  letter-spacing: 1px;
}

@keyframes mini-chart-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
