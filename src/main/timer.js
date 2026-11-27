'use strict';
/** Countdown kept in the main process so it keeps running when its popover is closed. */
function createTimer(onDone, now = Date.now) {
  let end = null;
  let left = 0;
  let handle = null;
  const remaining = () => (end ? Math.max(0, end - now()) : left);
  const stop = () => { clearTimeout(handle); handle = null; };
  const arm = (ms) => {
    stop();
    end = now() + ms;
    handle = setTimeout(() => { end = null; left = 0; onDone(); }, ms);
  };
  return {
    start(minutes) {
      const m = Number(minutes);
      if (Number.isFinite(m) && m > 0 && m <= 1440) arm(Math.round(m * 60000));
    },
    toggle() {
      if (end) { left = remaining(); end = null; stop(); } else if (left > 0) arm(left);
    },
    reset() { stop(); end = null; left = 0; },
    state: () => ({ remaining: remaining(), running: end !== null })
  };
}
module.exports = { createTimer };
