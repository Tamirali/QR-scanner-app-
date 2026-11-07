/* ============ BLUETOOTH THERMAL PRINTER (ESC/POS) ============ */
const PRINTER_SERVICES = [0x18f0, 0xff00, 0xffe0, 0x1101];

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
  init: new Uint8Array([ESC, 0x40]),
  alignLeft: new Uint8Array([ESC, 0x61, 0x00]),
  alignCenter: new Uint8Array([ESC, 0x61, 0x01]),
  boldOn: new Uint8Array([ESC, 0x45, 0x01]),
  boldOff: new Uint8Array([ESC, 0x45, 0x00]),
  bigOn: new Uint8Array([GS, 0x21, 0x11]),
  bigOff: new Uint8Array([GS, 0x21, 0x00]),
  feed: new Uint8Array([LF]),
  feedLines: (n) => new Uint8Array([ESC, 0x64, n]),
  cut: new Uint8Array([GS, 0x56, 0x00]),
};

const Printer = (() => {
  let device = null;
  let characteristic = null;

  const textBytes = (str) => new TextEncoder().encode(str + '\n');

  function concatBytes(arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
  }

  function chunk(arr, size = 100) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  /* --- Connect --- */
  async function connect() {
    if (!navigator.bluetooth) {
      showToast('❌ इस ब्राउज़र में Bluetooth नहीं है', 'error');
      return false;
    }
    try {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: PRINTER_SERVICES,
      });
      const server = await device.gatt.connect();

      for (const uuid of PRINTER_SERVICES) {
        try {
          const service = await server.getPrimaryService(uuid);
          const chars = await service.getCharacteristics();
          for (const ch of chars) {
            if (ch.properties.write || ch.properties.writeWithoutResponse) {
              characteristic = ch;
              break;
            }
          }
          if (characteristic) break;
        } catch (_) {}
      }

      if (!characteristic) {
        showToast('❌ प्रिंटर write सपोर्ट नहीं करता', 'error');
        return false;
      }

      device.addEventListener('gattserverdisconnected', reset);

      const btn = $('#btConnectBtn');
      btn.classList.add('connected');
      btn.textContent = '✅ ' + (device.name || 'प्रिंटर');
      Storage.printer.set(device.name);
      showToast('✅ प्रिंटर कनेक्ट', 'success');
      return true;
    } catch (err) {
      if (err.name !== 'NotFoundError') showToast('❌ ' + err.message, 'error');
      return false;
    }
  }

  function reset() {
    characteristic = null;
    const btn = $('#btConnectBtn');
    btn.classList.remove('connected');
    btn.textContent = '🔗 प्रिंटर';
  }

  async function write(data) {
    if (!characteristic) {
      showToast('❌ पहले प्रिंटर कनेक्ट करें', 'error');
      return false;
    }
    try {
      for (const c of chunk(data)) {
        if (characteristic.properties.writeWithoutResponse)
          await characteristic.writeValueWithoutResponse(c);
        else
          await characteristic.writeValue(c);
      }
      return true;
    } catch (err) {
      showToast('❌ प्रिंट फेल: ' + err.message, 'error');
      return false;
    }
  }

  /* --- Print Sticker --- */
  async function printSticker(product) {
    const parts = [
      CMD.init,
      CMD.alignCenter,
      CMD.boldOn,
      CMD.bigOn,
      textBytes(product.name.substring(0, 20)),
      CMD.bigOff,
      textBytes('Rs. ' + formatMoney(product.price)),
      CMD.boldOff,
      textBytes(product.code),
      textBytes('----------------'),
      CMD.feedLines(2),
    ];
    return write(concatBytes(parts));
  }

  /* --- Print Bill --- */
  async function printBill(bill, totals) {
    const parts = [];
    const add = (...cmds) => parts.push(...cmds);

    add(CMD.init, CMD.alignCenter, CMD.boldOn);
    add(textBytes('*** BILL ***'));
    add(CMD.boldOff);
    add(textBytes(formatDate(Date.now())));
    add(textBytes('------------------------------'));

    add(CMD.alignLeft);
    bill.forEach((it) => {
      const sub = it.price * it.qty;
      const name = (it.name || '').substring(0, 14).padEnd(14);
      add(textBytes(`${name} x${it.qty}  Rs.${formatMoney(sub)}`));
    });

    add(textBytes('------------------------------'));
    add(CMD.alignCenter);
    add(textBytes(`Sub Total: Rs.${formatMoney(totals.sub)}`));
    if (totals.discount > 0) add(textBytes(`Discount: -Rs.${formatMoney(totals.discount)}`));
    if (totals.gst > 0) add(textBytes(`GST: +Rs.${formatMoney(totals.gst)}`));
    add(CMD.boldOn, CMD.bigOn);
    add(textBytes(`TOTAL: Rs.${formatMoney(totals.total)}`));
    add(CMD.bigOff, CMD.boldOff);
    add(textBytes('------------------------------'));
    add(textBytes('Thank you!'));
    add(CMD.feedLines(3));
    add(CMD.cut);

    return write(concatBytes(parts));
  }

  /* --- Fallback: Browser Print (iOS etc.) --- */
  function fallbackPrint(html) {
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return false;
    w.document.write(`<html><head><title>Print</title>
      <style>body{font-family:monospace;font-size:14px;padding:10px;}
      .center{text-align:center;}.bold{font-weight:bold;}.big{font-size:18px;}</style>
      </head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 300);
    return true;
  }

  return { connect, printSticker, printBill, fallbackPrint };
})();

/* Auto-attach connect button */
document.addEventListener('DOMContentLoaded', () => {
  $('#btConnectBtn')?.addEventListener('click', () => {
    if (!navigator.bluetooth) {
      showToast('⚠️ iOS/पुराना ब्राउज़र — ब्राउज़र प्रिंट मोड में रहेगा', 'error');
      return;
    }
    Printer.connect();
  });
});
