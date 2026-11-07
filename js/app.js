/* ============ MAIN APP ============ */
let products = Storage.products.get();
let currentBill = Storage.bill.get();
let html5QrCode = null;
let editingId = null;

/* ============ INIT ============ */
document.addEventListener('DOMContentLoaded', () => {
  // Theme
  if (Storage.theme.get() === 'dark') document.body.classList.add('dark');
  $('#themeToggle').textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';

  renderProducts();
  renderBill();
  renderHistory();
  bindEvents();
});

/* ============ TABS ============ */
function bindEvents() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.remove('active'));
      $$('.tab-content').forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab !== 'scanner') stopCamera();
    });
  });

  $('#productForm').addEventListener('submit', handleProductSubmit);
  $('#cancelEdit').addEventListener('click', cancelEdit);
  $('#searchProduct').addEventListener('input', (e) => renderProducts(e.target.value));

  $('#themeToggle').addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark');
    Storage.theme.set(isDark ? 'dark' : 'light');
    $('#themeToggle').textContent = isDark ? '☀️' : '🌙';
  });

  $('#startCamera').addEventListener('click', startCamera);
  $('#stopCamera').addEventListener('click', stopCamera);
  $('#galleryInput').addEventListener('change', handleGalleryScan);

  $('#manualEntryBtn').addEventListener('click', () => {
    $('#manualCode').value = '';
    $('#modalOverlay').classList.add('show');
    setTimeout(() => $('#manualCode').focus(), 100);
  });
  $('#manualCancel').addEventListener('click', () => $('#modalOverlay').classList.remove('show'));
  $('#manualOk').addEventListener('click', () => {
    const code = $('#manualCode').value.trim();
    if (!code) return;
    addProductToBill(code);
    $('#modalOverlay').classList.remove('show');
  });
  $('#manualCode').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') $('#manualOk').click();
  });

  $('#discountPct').addEventListener('input', renderBill);
  $('#gstPct').addEventListener('input', renderBill);

  $('#clearBill').addEventListener('click', () => {
    if (!currentBill.length) return;
    if (!confirm('बिल साफ़ करें?')) return;
    currentBill = [];
    Storage.bill.clear();
    renderBill();
    showToast('🗑️ बिल साफ़');
  });

  $('#saveBill').addEventListener('click', saveCurrentBill);

  $('#printBill').addEventListener('click', async () => {
    if (!currentBill.length) return showToast('बिल खाली है', 'error');
    const totals = calcTotals();
    if (!navigator.bluetooth) {
      printBillFallback(totals);
      return;
    }
    const ok = await Printer.printBill(currentBill, totals);
    if (ok) showToast('🖨️ बिल प्रिंट भेजा', 'success');
  });
}

/* ============ PRODUCT CRUD ============ */
function handleProductSubmit(e) {
  e.preventDefault();
  const name = $('#pName').value.trim();
  const price = parseFloat($('#pPrice').value);
  const type = $('#pType').value;
  let code = $('#pCode').value.trim();

  if (!name || isNaN(price)) return showToast('नाम और कीमत ज़रूरी', 'error');
  if (!code) code = generateCode();

  // Duplicate check (exclude self when editing)
  const dup = products.some((p) => p.code === code && p.id !== editingId);
  if (dup) return showToast('❌ यह कोड पहले से है', 'error');

  if (editingId) {
    const idx = products.findIndex((p) => p.id === editingId);
    products[idx] = { ...products[idx], name, price, code, type };
    showToast('✅ अपडेट हो गया', 'success');
    cancelEdit();
  } else {
    products.push({
      id: Date.now().toString(),
      name, price, code, type,
      createdAt: Date.now(),
    });
    showToast('✅ प्रोडक्ट सेव', 'success');
  }
  Storage.products.set(products);
  renderProducts();
  e.target.reset();
}

function editProduct(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  editingId = id;
  $('#pName').value = p.name;
  $('#pPrice').value = p.price;
  $('#pType').value = p.type;
  $('#pCode').value = p.code;
  $('#editId').value = id;
  $('#formTitle').textContent = '✏️ प्रोडक्ट एडिट करें';
  $('#submitBtn').textContent = '💾 अपडेट';
  $('#cancelEdit').style.display = 'inline-block';
  $('#sticker').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  editingId = null;
  $('#productForm').reset();
  $('#formTitle').textContent = '➕ नया प्रोडक्ट जोड़ें';
  $('#submitBtn').textContent = '➕ सेव';
  $('#cancelEdit').style.display = 'none';
}

function deleteProduct(id) {
  if (!confirm('प्रोडक्ट डिलीट करें?')) return;
  products = products.filter((p) => p.id !== id);
  Storage.products.set(products);
  renderProducts();
  showToast('🗑️ डिलीट', 'success');
}

/* ============ RENDER PRODUCTS ============ */
function renderProducts(filter = '') {
  const list = $('#productList');
  list.innerHTML = '';
  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.code.includes(filter)
  );
  $('#productCount').textContent = products.length;

  if (!filtered.length) {
    list.innerHTML = '<p class="empty-msg">कोई प्रोडक्ट नहीं। ऊपर से जोड़ें।</p>';
    return;
  }

  filtered.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <h4 title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</h4>
      <div class="price">₹${formatMoney(p.price)}</div>
      <div class="code-render"></div>
      <div class="code-text">${escapeHtml(p.code)}</div>
      <div class="actions">
        <button class="mini-print" title="स्टिकर">🖨️</button>
        <button class="mini-edit" title="एडिट">✏️</button>
        <button class="mini-del" title="डिलीट">🗑️</button>
      </div>
    `;
    renderCode(card.querySelector('.code-render'), p);

    card.querySelector('.mini-print').addEventListener('click', async () => {
      if (!navigator.bluetooth) {
        Printer.fallbackPrint(`<div class="center bold big">${escapeHtml(p.name)}</div>
          <div class="center">Rs.${formatMoney(p.price)}</div>
          <div class="center">${escapeHtml(p.code)}</div>`);
        return;
      }
      const ok = await Printer.printSticker(p);
      if (ok) showToast('🖨️ स्टिकर भेजा', 'success');
    });
    card.querySelector('.mini-edit').addEventListener('click', () => editProduct(p.id));
    card.querySelector('.mini-del').addEventListener('click', () => deleteProduct(p.id));

    list.appendChild(card);
  });
}

function renderCode(container, p) {
  container.innerHTML = '';
  if (p.type === 'barcode') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    container.appendChild(svg);
    try {
      JsBarcode(svg, p.code, {
        format: 'CODE128',
        width: 1.2,
        height: 45,
        displayValue: false,
        margin: 2,
      });
    } catch {
      container.textContent = '(invalid)';
    }
  } else {
    const qrDiv = document.createElement('div');
    container.appendChild(qrDiv);
    new QRCode(qrDiv, {
      text: p.code,
      width: 70,
      height: 70,
      correctLevel: QRCode.CorrectLevel.M,
    });
  }
}

/* ============ SCANNER ============ */
async function startCamera() {
  if (html5QrCode) return;
  html5QrCode = new Html5Qrcode('reader');
  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decoded) => {
        handleScan(decoded);
        stopCamera();
      },
      () => {}
    );
    showToast('📷 स्कैनर चालू', 'success');
  } catch (err) {
    showScanResult('कैमरा फेल: ' + err.message, true);
    html5QrCode = null;
  }
}

async function stopCamera() {
  if (!html5QrCode) return;
  try { await html5QrCode.stop(); await html5QrCode.clear(); } catch (_) {}
  html5QrCode = null;
}

async function handleGalleryScan(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const scanner = new Html5Qrcode('reader');
    const decoded = await scanner.scanFile(file, true);
    handleScan(decoded);
  } catch (err) {
    showScanResult('गैलरी स्कैन फेल: ' + err.message, true);
  }
  e.target.value = '';
}

function handleScan(code) {
  const trimmed = code.trim();
  showScanResult(`✅ स्कैन: ${trimmed}`);
  addProductToBill(trimmed);
}

function showScanResult(text, isError = false) {
  const el = $('#scanResult');
  el.textContent = text;
  el.style.display = 'block';
  el.classList.toggle('error', isError);
}

/* ============ BILL ============ */
function addProductToBill(code) {
  const product = products.find((p) => p.code === code);
  if (!product) return showToast('❌ कोड सेव नहीं है', 'error');

  const existing = currentBill.find((b) => b.productId === product.id);
  if (existing) existing.qty += 1;
  else currentBill.push({ productId: product.id, name: product.name, price: product.price, qty: 1 });

  Storage.bill.set(currentBill);
  renderBill();
  showToast(`✅ ${product.name} जोड़ा`, 'success');
}

function calcTotals() {
  const sub = currentBill.reduce((s, it) => s + it.price * it.qty, 0);
  const discPct = Math.min(100, Math.max(0, parseFloat($('#discountPct').value) || 0));
  const gstPct = Math.min(28, Math.max(0, parseFloat($('#gstPct').value) || 0));
  const discount = (sub * discPct) / 100;
  const afterDisc = sub - discount;
  const gst = (afterDisc * gstPct) / 100;
  const total = afterDisc + gst;
  return { sub, discount, gst, total, discPct, gstPct };
}

function renderBill() {
  const list = $('#billList');
  list.innerHTML = '';

  if (!currentBill.length) {
    list.innerHTML = '<p class="empty-msg">बिल खाली है। स्कैन करें।</p>';
  } else {
    currentBill.forEach((item, idx) => {
      const sub = item.price * item.qty;
      const row = document.createElement('div');
      row.className = 'bill-item';
      row.innerHTML = `
        <span class="item-name">${escapeHtml(item.name)}</span>
        <span>₹${formatMoney(item.price)}</span>
        <input type="number" min="1" value="${item.qty}" class="qty-input" data-idx="${idx}" />
        <span class="item-sub">₹${formatMoney(sub)}</span>
        <button class="bill-remove" data-idx="${idx}">✕</button>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll('.qty-input').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const i = +e.target.dataset.idx;
        const q = Math.max(1, parseInt(e.target.value) || 1);
        currentBill[i].qty = q;
        Storage.bill.set(currentBill);
        renderBill();
      });
    });
    list.querySelectorAll('.bill-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentBill.splice(+btn.dataset.idx, 1);
        Storage.bill.set(currentBill);
        renderBill();
      });
    });
  }

  const t = calcTotals();
  $('#subTotal').textContent = formatMoney(t.sub);
  $('#discAmt').textContent = formatMoney(t.discount);
  $('#gstAmt').textContent = formatMoney(t.gst);
  $('#billTotal').textContent = formatMoney(t.total);
}

function saveCurrentBill() {
  if (!currentBill.length) return showToast('बिल खाली है', 'error');
  const t = calcTotals();
  Storage.history.add({
    id: Date.now().toString(),
    date: Date.now(),
    items: [...currentBill],
    totals: t,
  });
  renderHistory();
  showToast('💾 बिल सेव', 'success');
}

/* ============ HISTORY ============ */
function renderHistory() {
  const list = $('#historyList');
  const hist = Storage.history.get();
  list.innerHTML = '';

  if (!hist.length) {
    list.innerHTML = '<p class="empty-msg">कोई बिल सेव नहीं है।</p>';
    return;
  }

  hist.forEach((bill) => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.innerHTML = `
      <div class="history-head">
        <span>${formatDate(bill.date)}</span>
        <span class="history-total">₹${formatMoney(bill.totals.total)}</span>
      </div>
      <div class="history-items">${bill.items.length} आइटम — ${bill.items.map((i) => escapeHtml(i.name)).join(', ')}</div>
      <div class="history-actions">
        <button class="mini-print" data-id="${bill.id}">🖨️ प्रिंट</button>
        <button class="mini-del" data-id="${bill.id}">🗑️ डिलीट</button>
      </div>
    `;
    el.querySelector('.mini-print').addEventListener('click', async () => {
      if (!navigator.bluetooth) return printBillFallback(bill.totals, bill.items);
      const ok = await Printer.printBill(bill.items, bill.totals);
      if (ok) showToast('🖨️ भेजा', 'success');
    });
    el.querySelector('.mini-del').addEventListener('click', () => {
      if (!confirm('बिल डिलीट करें?')) return;
      Storage.history.remove(bill.id);
      renderHistory();
      showToast('🗑️ डिलीट', 'success');
    });
    list.appendChild(el);
  });
}

/* ============ FALLBACK PRINT (iOS) ============ */
function printBillFallback(totals, items = currentBill) {
  let html = `<div class="center bold big">BILL</div>
    <div class="center">${formatDate(Date.now())}</div>
    <div>------------------------------</div>`;
  items.forEach((it) => {
    html += `<div>${escapeHtml(it.name.substring(0, 14))} x${it.qty} — Rs.${formatMoney(it.price * it.qty)}</div>`;
  });
  html += `<div>------------------------------</div>`;
  html += `<div>Sub Total: Rs.${formatMoney(totals.sub)}</div>`;
  if (totals.discount > 0) html += `<div>Discount: -Rs.${formatMoney(totals.discount)}</div>`;
  if (totals.gst > 0) html += `<div>GST: +Rs.${formatMoney(totals.gst)}</div>`;
  html += `<div class="center bold big">TOTAL: Rs.${formatMoney(totals.total)}</div>`;
  Printer.fallbackPrint(html);
}
