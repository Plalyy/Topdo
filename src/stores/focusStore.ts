import { defineStore } from 'pinia';

const FOCUS_STATE_KEY = 'topdo_focus_state_v1';

interface PersistedFocusState {
  currentTaskId: string;
}

export const useFocusStore = defineStore('focus', {
  state: () => ({
    currentTaskId: '',
    loaded: false
  }),

  getters: {
    hasActive: (state) => Boolean(state.currentTaskId)
  },

  actions: {
    load() {
      if (this.loaded) return;
      this.loaded = true;
      try {
        const parsed = JSON.parse(localStorage.getItem(FOCUS_STATE_KEY) || '{}') as Partial<PersistedFocusState>;
        this.currentTaskId = typeof parsed.currentTaskId === 'string' ? parsed.currentTaskId : '';
      } catch {
        this.currentTaskId = '';
      }
    },

    persist() {
      try {
        const payload: PersistedFocusState = {
          currentTaskId: this.currentTaskId
        };
        localStorage.setItem(FOCUS_STATE_KEY, JSON.stringify(payload));
      } catch {
        // Focus mode remains usable even when persistence is unavailable.
      }
    },

    begin(taskId: string) {
      if (!taskId) return;
      this.currentTaskId = taskId;
      this.persist();
    },

    clear() {
      this.currentTaskId = '';
      this.persist();
    }
  }
});
