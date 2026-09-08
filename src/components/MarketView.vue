<template>
  <section class="market-view">
    <header v-if="!maximizedQuote" class="market-toolbar">
      <div>
        <h2>行情</h2>
        <p>{{ lastUpdatedLabel }}</p>
      </div>
      <div class="market-toolbar__actions">
        <button
          type="button"
          class="market-icon-button"
          :class="{ spinning: loading }"
          title="刷新行情"
          :disabled="loading"
          @click="refreshQuotes"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M13.25 5.6A5.5 5.5 0 1 0 13.1 10.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M13.2 2.7v3.2H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button
          type="button"
          class="market-icon-button"
          :class="{ active: editing }"
          title="配置行情"
          @click="toggleEditing"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <circle cx="6" cy="4" r="1.5" fill="var(--bg-solid)" stroke="currentColor" stroke-width="1.2"/>
            <circle cx="10" cy="8" r="1.5" fill="var(--bg-solid)" stroke="currentColor" stroke-width="1.2"/>
            <circle cx="7" cy="12" r="1.5" fill="var(--bg-solid)" stroke="currentColor" stroke-width="1.2"/>
          </svg>
        </button>
      </div>
    </header>

    <MarketCandleChart
      v-if="maximizedQuote"
      class="market-kline-maximized"
      :title="maximizedQuote.name"
      :market="activeKline?.resolved_market || maximizedQuote.resolved_market || maximizedQuote.market"
      :interval="klineInterval"
      :candles="activeKline?.candles || []"
      :loading="klineLoading"
      :error="klineError"
      :maximized="true"
      @interval-change="changeKlineInterval"
      @close="closeMaximizedKline"
    />

    <div v-else-if="editing" class="market-editor">
      <div class="market-editor__heading">
        <div>
          <strong>自选行情</strong>
          <span>市场 · 名称</span>
        </div>
        <button type="button" class="market-add-button" :disabled="draftItems.length >= 12" @click="addItem">
          + 添加
        </button>
      </div>

      <div class="market-editor__rows">
        <div v-for="(item, index) in draftItems" :key="index" class="market-editor__row">
          <input
            v-model="item.market"
            type="text"
            list="market-options"
            aria-label="市场"
            placeholder="币安"
          />
          <input
            v-model="item.name"
            type="text"
            aria-label="名称"
            placeholder="BTC/USDT"
            @keydown.enter.prevent="saveItems"
          />
          <button
            type="button"
            class="market-remove-button"
            title="删除"
            :disabled="draftItems.length === 1"
            @click="removeItem(index)"
          >
            ×
          </button>
        </div>
      </div>
      <datalist id="market-options">
        <option value="币安"></option>
        <option value="币安合约"></option>
        <option value="币安现货"></option>
        <option value="A股指数"></option>
      </datalist>

      <p v-if="editorError" class="market-editor__error">{{ editorError }}</p>
      <div class="market-editor__presets">
        <span>A股快捷添加</span>
        <button
          v-for="preset in CHINA_INDEX_PRESETS"
          :key="preset.name"
          type="button"
          :disabled="draftItems.length >= 12 || hasDraftItem(preset)"
          @click="addPreset(preset)"
        >
          {{ preset.shortName }}
        </button>
      </div>
      <p class="market-editor__hint">“币安”优先查 U 本位合约；A股指数支持上证、创业板、科创50和红利低波100。</p>
      <div class="market-editor__footer">
        <button type="button" class="market-secondary-button" :disabled="saving" @click="cancelEditing">取消</button>
        <button type="button" class="market-primary-button" :disabled="saving" @click="saveItems">
          {{ saving ? '保存中…' : '保存并刷新' }}
        </button>
      </div>
    </div>

    <div v-else class="market-content">
      <div v-if="loading && quotes.length === 0" class="market-state">
        <span class="market-spinner"></span>
        <span>正在获取行情…</span>
      </div>
      <div v-else-if="pageError && quotes.length === 0" class="market-state market-state--error">
        <span>{{ pageError }}</span>
        <button type="button" @click="refreshQuotes">重试</button>
      </div>
      <div v-else class="quote-list">
        <article
          v-for="(quote, index) in quotes"
          :key="`${quote.market}-${quote.name}-${index}`"
          class="quote-card"
          :class="{
            'quote-card--error': quote.error,
            'quote-card--expanded': isKlineOpen(quote)
          }"
        >
          <button
            type="button"
            class="quote-card__summary"
            :disabled="Boolean(quote.error)"
            :title="quote.error ? '' : (isKlineOpen(quote) ? '收起 5m K线' : '展开 5m K线')"
            @click="toggleKline(quote)"
          >
          <div class="quote-card__top">
            <div class="quote-card__identity">
              <strong>{{ quote.name }}</strong>
              <span>
                {{ quote.resolved_market || quote.market }}
                <em v-if="!quote.error">{{ isKlineOpen(quote) ? '收起' : '5m K线' }}</em>
              </span>
            </div>
            <MarketMiniChart
              v-if="!quote.error"
              :candles="miniKlines[quoteKey(quote)]?.candles || []"
              :loading="miniKlineLoading && !miniKlines[quoteKey(quote)]"
              :change-percent="quote.change_percent"
            />
            <template v-if="!quote.error">
              <div class="quote-card__price">{{ formatPrice(quote.price) }}</div>
              <div class="quote-card__change" :class="changeClass(quote.change_percent)">
                {{ formatPercent(quote.change_percent) }}
              </div>
            </template>
            <span v-else class="quote-card__unavailable">不可用</span>
          </div>
          </button>

          <div v-if="!quote.error" class="quote-card__meta">
            <span>高 {{ formatPrice(quote.high_price) }}</span>
            <span>低 {{ formatPrice(quote.low_price) }}</span>
            <span>额 {{ formatCompact(quote.quote_volume) }}</span>
          </div>
          <p v-else class="quote-card__error">{{ friendlyError(quote.error) }}</p>
          <MarketCandleChart
            v-if="isKlineOpen(quote)"
            :title="quote.name"
            :market="activeKline?.resolved_market || quote.resolved_market || quote.market"
            :interval="klineInterval"
            :candles="activeKline?.candles || []"
            :loading="klineLoading"
            :error="klineError"
            @interval-change="changeKlineInterval"
            @maximize="maximizeKline(quote)"
          />
        </article>
      </div>

      <p v-if="pageError && quotes.length > 0" class="market-inline-error">{{ pageError }}</p>
      <footer class="market-footer">
        <span>公开行情 · 约 15 秒刷新</span>
        <span>非投资建议</span>
      </footer>
    </div>
  </section>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import MarketCandleChart from './MarketCandleChart.vue';
import MarketMiniChart from './MarketMiniChart.vue';

interface MarketItem {
  market: string;
  name: string;
}

interface MarketConfigPayload {
  items: MarketItem[];
}

interface MarketQuote {
  market: string;
  name: string;
  symbol: string;
  resolved_market: string;
  price: string | null;
  change_percent: string | null;
  high_price: string | null;
  low_price: string | null;
  quote_volume: string | null;
  close_time: number | null;
  error: string | null;
}

interface MarketCandle {
  open_time: number;
  close_time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface MarketKline {
  market: string;
  name: string;
  symbol: string;
  resolved_market: string;
  interval: string;
  candles: MarketCandle[];
}

const DEFAULT_ITEMS: MarketItem[] = [
  { market: '币安', name: 'SOXL/USDT' },
  { market: '币安', name: 'SNDK/USDT' }
];
const CHINA_INDEX_PRESETS = [
  { market: 'A股指数', name: '上证指数', shortName: '上证' },
  { market: 'A股指数', name: '创业板指', shortName: '创业板' },
  { market: 'A股指数', name: '科创50', shortName: '科创50' },
  { market: 'A股指数', name: '红利低波100', shortName: '红利低波' }
] as const;
const REFRESH_INTERVAL = 15_000;
const MINI_KLINE_REFRESH_INTERVAL = 60_000;

const items = ref<MarketItem[]>([]);
const draftItems = ref<MarketItem[]>([]);
const quotes = ref<MarketQuote[]>([]);
const loading = ref(false);
const saving = ref(false);
const editing = ref(false);
const editorError = ref('');
const pageError = ref('');
const activeKlineKey = ref('');
const activeKline = ref<MarketKline | null>(null);
const klineInterval = ref<'5m' | '15m'>('5m');
const klineLoading = ref(false);
const klineError = ref('');
const miniKlines = ref<Record<string, MarketKline>>({});
const miniKlineLoading = ref(false);
const miniKlineUpdatedAt = ref(0);
const maximizedKlineKey = ref('');
const lastUpdatedAt = ref<number | null>(null);
const clock = ref(Date.now());
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;

const lastUpdatedLabel = computed(() => {
  if (loading.value && !lastUpdatedAt.value) return '正在连接…';
  if (!lastUpdatedAt.value) return '尚未刷新';
  const seconds = Math.max(0, Math.floor((clock.value - lastUpdatedAt.value) / 1000));
  if (seconds < 5) return '刚刚更新';
  if (seconds < 60) return `${seconds} 秒前更新`;
  return `${Math.floor(seconds / 60)} 分钟前更新`;
});

const maximizedQuote = computed(() =>
  quotes.value.find((quote) => quoteKey(quote) === maximizedKlineKey.value) || null
);

function quoteKey(quote: Pick<MarketQuote, 'market' | 'name'>): string {
  return `${quote.market}\u0000${quote.name}`;
}

function isKlineOpen(quote: MarketQuote): boolean {
  return activeKlineKey.value === quoteKey(quote);
}

function cloneItems(source: MarketItem[]): MarketItem[] {
  return source.map((item) => ({ ...item }));
}

function formatPrice(value: string | null): string {
  if (!value) return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  const maximumFractionDigits = number >= 1000 ? 2 : number >= 1 ? 4 : 8;
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: number >= 100 ? 2 : 0,
    maximumFractionDigits
  }).format(number);
}

function formatPercent(value: string | null): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function formatCompact(value: string | null): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(number);
}

function changeClass(value: string | null) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return 'quote-card__change--flat';
  return number > 0 ? 'quote-card__change--up' : 'quote-card__change--down';
}

function friendlyError(error: string | null): string {
  if (!error) return '';
  if (error.includes('Invalid symbol') || error.includes('未找到该交易对')) {
    return '该市场暂未提供这个交易对，请检查市场或名称。';
  }
  return error;
}

async function loadConfig() {
  try {
    const config = await invoke<MarketConfigPayload>('load_market_config');
    items.value = config.items.length ? config.items : cloneItems(DEFAULT_ITEMS);
  } catch (error) {
    items.value = cloneItems(DEFAULT_ITEMS);
    pageError.value = `读取配置失败：${String(error)}`;
  }
}

async function refreshQuotes() {
  if (loading.value || editing.value || items.value.length === 0) return;
  loading.value = true;
  pageError.value = '';
  try {
    quotes.value = await invoke<MarketQuote[]>('fetch_market_quotes', {
      items: items.value
    });
    if (
      activeKlineKey.value &&
      !quotes.value.some((quote) => quoteKey(quote) === activeKlineKey.value)
    ) {
      closeKline();
    }
    if (Date.now() - miniKlineUpdatedAt.value >= MINI_KLINE_REFRESH_INTERVAL) {
      void refreshMiniKlines();
    }
    lastUpdatedAt.value = Date.now();
    clock.value = Date.now();
  } catch (error) {
    pageError.value = `行情刷新失败：${String(error)}`;
  } finally {
    loading.value = false;
  }
}

async function loadKline(quote: MarketQuote, silent = false) {
  const key = quoteKey(quote);
  if (!silent) {
    klineLoading.value = true;
    klineError.value = '';
    activeKline.value = null;
  }
  try {
    const result = await invoke<MarketKline>('fetch_market_klines', {
      market: quote.market,
      name: quote.name,
      interval: klineInterval.value,
      limit: 120
    });
    if (activeKlineKey.value === key) {
      activeKline.value = result;
      klineError.value = '';
    }
  } catch (error) {
    if (activeKlineKey.value === key && !silent) {
      klineError.value = String(error);
    }
  } finally {
    if (activeKlineKey.value === key) {
      klineLoading.value = false;
    }
  }
}

async function refreshMiniKlines() {
  if (miniKlineLoading.value) return;
  const availableQuotes = quotes.value.filter((quote) => !quote.error);
  if (availableQuotes.length === 0) return;
  miniKlineLoading.value = true;
  try {
    const results = await Promise.allSettled(
      availableQuotes.map(async (quote) => ({
        key: quoteKey(quote),
        kline: await invoke<MarketKline>('fetch_market_klines', {
          market: quote.market,
          name: quote.name,
          interval: '5m',
          limit: 20
        })
      }))
    );
    const next = { ...miniKlines.value };
    for (const result of results) {
      if (result.status === 'fulfilled') {
        next[result.value.key] = result.value.kline;
      }
    }
    miniKlines.value = next;
    miniKlineUpdatedAt.value = Date.now();
  } finally {
    miniKlineLoading.value = false;
  }
}

function closeKline() {
  activeKlineKey.value = '';
  maximizedKlineKey.value = '';
  activeKline.value = null;
  klineError.value = '';
  klineLoading.value = false;
}

function toggleKline(quote: MarketQuote) {
  if (quote.error) return;
  const key = quoteKey(quote);
  if (activeKlineKey.value === key) {
    closeKline();
    return;
  }
  activeKlineKey.value = key;
  maximizedKlineKey.value = '';
  void loadKline(quote);
}

function maximizeKline(quote: MarketQuote) {
  maximizedKlineKey.value = quoteKey(quote);
}

function changeKlineInterval(interval: '5m' | '15m') {
  if (klineInterval.value === interval) return;
  klineInterval.value = interval;
  const quote = quotes.value.find((item) => quoteKey(item) === activeKlineKey.value);
  if (quote) void loadKline(quote);
}

function closeMaximizedKline() {
  maximizedKlineKey.value = '';
}

function toggleEditing() {
  if (editing.value) {
    cancelEditing();
    return;
  }
  draftItems.value = cloneItems(items.value);
  closeKline();
  editorError.value = '';
  editing.value = true;
}

function cancelEditing() {
  editing.value = false;
  editorError.value = '';
}

function addItem() {
  if (draftItems.value.length >= 12) return;
  draftItems.value.push({ market: '币安', name: '' });
}

function hasDraftItem(item: Pick<MarketItem, 'market' | 'name'>): boolean {
  return draftItems.value.some(
    (draft) => draft.market.trim() === item.market && draft.name.trim() === item.name
  );
}

function addPreset(item: Pick<MarketItem, 'market' | 'name'>) {
  if (draftItems.value.length >= 12 || hasDraftItem(item)) return;
  const emptyIndex = draftItems.value.findIndex(
    (draft) => !draft.market.trim() && !draft.name.trim()
  );
  if (emptyIndex >= 0) {
    draftItems.value[emptyIndex] = { market: item.market, name: item.name };
  } else {
    draftItems.value.push({ market: item.market, name: item.name });
  }
}

function removeItem(index: number) {
  if (draftItems.value.length === 1) return;
  draftItems.value.splice(index, 1);
}

async function saveItems() {
  if (saving.value) return;
  const normalized = draftItems.value.map((item) => ({
    market: item.market.trim(),
    name: item.name.trim()
  }));
  if (normalized.some((item) => !item.market || !item.name)) {
    editorError.value = '市场和名称不能为空';
    return;
  }

  saving.value = true;
  editorError.value = '';
  try {
    const saved = await invoke<MarketConfigPayload>('save_market_config', {
      items: normalized
    });
    items.value = cloneItems(saved.items);
    editing.value = false;
    await refreshQuotes();
  } catch (error) {
    editorError.value = String(error);
  } finally {
    saving.value = false;
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void refreshQuotes();
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !maximizedKlineKey.value) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeMaximizedKline();
}

onMounted(async () => {
  await loadConfig();
  await refreshQuotes();
  refreshTimer = setInterval(() => void refreshQuotes(), REFRESH_INTERVAL);
  clockTimer = setInterval(() => {
    clock.value = Date.now();
  }, 1000);
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('keydown', onKeydown, true);
});

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (clockTimer) clearInterval(clockTimer);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  document.removeEventListener('keydown', onKeydown, true);
});
</script>

<style scoped>
.market-view {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at 88% 2%, color-mix(in srgb, var(--primary) 9%, transparent), transparent 36%),
    var(--bg-solid);
}

.market-toolbar {
  min-height: 54px;
  padding: 8px 10px 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 0.5px solid var(--border-light);
}

.market-toolbar h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.25;
}

.market-toolbar p {
  margin: 2px 0 0;
  color: var(--text-tertiary);
  font-size: 10px;
}

.market-toolbar__actions {
  display: flex;
  gap: 4px;
}

.market-icon-button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0.5px solid var(--border-light);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-solid) 82%, transparent);
  color: var(--text-secondary);
  cursor: pointer;
}

.market-icon-button:hover,
.market-icon-button.active {
  border-color: color-mix(in srgb, var(--primary) 42%, var(--border));
  background: color-mix(in srgb, var(--primary) 8%, var(--bg-solid));
  color: var(--primary);
}

.market-icon-button:disabled {
  cursor: default;
  opacity: 0.55;
}

.market-icon-button.spinning svg {
  animation: market-spin 0.8s linear infinite;
}

.market-content {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 8px;
}

.quote-list {
  display: grid;
  gap: 6px;
}

.quote-card {
  padding: 10px 11px 9px;
  border: 0.5px solid var(--border-light);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-solid) 92%, var(--bg-secondary));
  box-shadow: 0 2px 8px color-mix(in srgb, var(--text-primary) 4%, transparent);
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease;
}

.quote-card--error {
  border-color: color-mix(in srgb, #fa5252 24%, var(--border-light));
}

.quote-card--expanded {
  border-color: color-mix(in srgb, var(--primary) 30%, var(--border-light));
  box-shadow: 0 7px 22px color-mix(in srgb, var(--primary) 8%, transparent);
}

.quote-card__summary {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.quote-card__summary:disabled {
  cursor: default;
}

.quote-card__top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 58px auto auto;
  align-items: center;
  gap: 6px;
}

.quote-card__identity {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.quote-card__identity strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quote-card__identity span {
  color: var(--text-tertiary);
  font-size: 9px;
}

.quote-card__identity em {
  margin-left: 4px;
  padding: 1px 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  color: var(--primary);
  font-style: normal;
  font-weight: 650;
}

.quote-card__price {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  font-weight: 720;
  letter-spacing: -0.025em;
}

.quote-card__change {
  min-width: 50px;
  padding: 4px 5px;
  border-radius: 7px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: 700;
}

.quote-card__change--up {
  background: color-mix(in srgb, #14a76c 11%, transparent);
  color: #14935f;
}

.quote-card__change--down {
  background: color-mix(in srgb, #fa5252 10%, transparent);
  color: #e5484d;
}

.quote-card__change--flat {
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.quote-card__meta {
  margin-top: 7px;
  padding-top: 7px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  border-top: 0.5px solid var(--border-light);
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  font-size: 9px;
}

.quote-card__unavailable {
  grid-column: 2 / 5;
  padding: 3px 7px;
  border-radius: 6px;
  background: color-mix(in srgb, #fa5252 9%, transparent);
  color: #e5484d;
  font-size: 10px;
  font-weight: 650;
}

.quote-card__error,
.market-inline-error {
  margin: 7px 0 0;
  color: #e5484d;
  font-size: 10px;
  line-height: 1.45;
}

.market-footer {
  margin-top: auto;
  padding: 12px 4px 2px;
  display: flex;
  justify-content: space-between;
  color: var(--text-tertiary);
  font-size: 9px;
}

.market-kline-maximized {
  min-height: 0;
  flex: 1;
}

.market-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 11px;
}

.market-state--error {
  padding: 20px;
  flex-direction: column;
  color: #e5484d;
  text-align: center;
}

.market-state button {
  padding: 5px 10px;
  border: 0.5px solid var(--border);
  border-radius: 7px;
  background: var(--bg-solid);
  color: var(--text-secondary);
}

.market-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in srgb, var(--primary) 24%, transparent);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: market-spin 0.8s linear infinite;
}

.market-editor {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 10px;
}

.market-editor__heading {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.market-editor__heading > div {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.market-editor__heading strong {
  color: var(--text-primary);
  font-size: 12px;
}

.market-editor__heading span {
  color: var(--text-tertiary);
  font-size: 9px;
}

.market-add-button {
  border: 0;
  background: transparent;
  color: var(--primary);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}

.market-editor__rows {
  display: grid;
  gap: 6px;
}

.market-editor__row {
  display: grid;
  grid-template-columns: minmax(82px, 0.78fr) minmax(110px, 1.22fr) 24px;
  gap: 5px;
}

.market-editor__row input {
  min-width: 0;
  height: 31px;
  padding: 0 8px;
  border: 0.5px solid var(--border);
  border-radius: 8px;
  outline: none;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 11px;
}

.market-editor__row input:focus {
  border-color: color-mix(in srgb, var(--primary) 62%, var(--border));
  background: var(--bg-solid);
}

.market-remove-button {
  width: 24px;
  height: 31px;
  border: 0;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 18px;
  cursor: pointer;
}

.market-remove-button:hover {
  color: #e5484d;
}

.market-remove-button:disabled {
  cursor: default;
  opacity: 0.25;
}

.market-editor__hint,
.market-editor__error {
  margin: 8px 2px 0;
  font-size: 9px;
  line-height: 1.4;
}

.market-editor__hint {
  color: var(--text-tertiary);
}

.market-editor__presets {
  margin-top: 9px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.market-editor__presets span {
  margin-right: 2px;
  color: var(--text-tertiary);
  font-size: 9px;
}

.market-editor__presets button {
  height: 23px;
  padding: 0 7px;
  border: 0.5px solid var(--border-light);
  border-radius: 7px;
  background: color-mix(in srgb, var(--bg-solid) 85%, var(--bg-secondary));
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 9px;
  cursor: pointer;
}

.market-editor__presets button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--primary) 38%, var(--border));
  color: var(--primary);
}

.market-editor__presets button:disabled {
  opacity: 0.4;
  cursor: default;
}

.market-editor__error {
  color: #e5484d;
}

.market-editor__footer {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.market-primary-button,
.market-secondary-button {
  height: 30px;
  padding: 0 11px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 10px;
  font-weight: 650;
  cursor: pointer;
}

.market-primary-button {
  border: 0.5px solid var(--primary);
  background: var(--primary);
  color: white;
}

.market-secondary-button {
  border: 0.5px solid var(--border);
  background: var(--bg-solid);
  color: var(--text-secondary);
}

@keyframes market-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
