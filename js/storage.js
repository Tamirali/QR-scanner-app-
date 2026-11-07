/* ============ LOCALSTORAGE MANAGER ============ */
const KEYS = {
  PRODUCTS: 'billing_products_v2',
  BILL: 'billing_current_v2',
  HISTORY: 'billing_history_v2',
  THEME: 'billing_theme',
  PRINTER: 'billing_printer_name',
};

const Storage = {
  products: {
    get: () => JSON.parse(localStorage.getItem(KEYS.PRODUCTS) || '[]'),
    set: (v) => localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(v)),
  },
  bill: {
    get: () => JSON.parse(localStorage.getItem(KEYS.BILL) || '[]'),
    set: (v) => localStorage.setItem(KEYS.BILL, JSON.stringify(v)),
    clear: () => localStorage.removeItem(KEYS.BILL),
  },
  history: {
    get: () => JSON.parse(localStorage.getItem(KEYS.HISTORY) || '[]'),
    set: (v) => localStorage.setItem(KEYS.HISTORY, JSON.stringify(v)),
    add: (bill) => {
      const list = Storage.history.get();
      list.unshift(bill);
      if (list.length > 100) list.length = 100; // limit 100
      Storage.history.set(list);
    },
    remove: (id) => {
      Storage.history.set(Storage.history.get().filter((b) => b.id !== id));
    },
  },
  theme: {
    get: () => localStorage.getItem(KEYS.THEME) || 'light',
    set: (v) => localStorage.setItem(KEYS.THEME, v),
  },
  printer: {
    get: () => localStorage.getItem(KEYS.PRINTER) || '',
    set: (v) => localStorage.setItem(KEYS.PRINTER, v || ''),
  },
};
