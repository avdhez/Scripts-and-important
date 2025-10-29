// ==UserScript==
// @name         Forceful Timer & Video Speed Controller
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Speed up JS timers & videos with a floating control. Reschedules active intervals on speed change.
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  const speeds = [1, 2, 3, 9, 32];
  let speed = parseFloat(localStorage.getItem('speed-' + location.hostname)) || 1;

  // --- Timer monkey patches ---
  const activeIntervals = new Set();

  const origSetTimeout = window.setTimeout;
  const origSetInterval = window.setInterval;
  const origClearInterval = window.clearInterval;
  const origRAF = window.requestAnimationFrame;

  window.setTimeout = function(fn, t, ...args) {
    return origSetTimeout(fn, t / speed, ...args);
  };

  window.setInterval = function(fn, t, ...args) {
    const id = origSetInterval(fn, t / speed, ...args);
    activeIntervals.add({ id, fn, t, args });
    return id;
  };

  window.clearInterval = function(id) {
    activeIntervals.forEach(rec => {
      if (rec.id === id) activeIntervals.delete(rec);
    });
    return origClearInterval(id);
  };

  window.requestAnimationFrame = function(cb) {
    return origRAF(ts => cb(ts * speed));
  };

  function reapplyIntervals() {
    activeIntervals.forEach(rec => {
      origClearInterval(rec.id);
      rec.id = origSetInterval(rec.fn, rec.t / speed, ...rec.args);
    });
  }

  // --- Video speed ---
  function applyVideoSpeed() {
    document.querySelectorAll('video').forEach(v => {
      if (v.playbackRate !== speed) v.playbackRate = speed;
    });
  }

  // --- UI ---
  function createUI() {
    const btn = document.createElement('div');
    btn.textContent = speed + '×';
    Object.assign(btn.style, {
      position: 'fixed',
      top: '58px',
      right: '8px',
      background: '#000',
      color: '#fff',
      padding: '4px 6px',
      fontSize: '15px',
      borderRadius: '6px',
      cursor: 'pointer',
      userSelect: 'none',
      zIndex: '999999',
      opacity: '0.7',
      fontFamily: 'sans-serif',
    });
    btn.onmouseenter = () => btn.style.opacity = '1';
    btn.onmouseleave = () => btn.style.opacity = '0.7';

    const popup = document.createElement('div');
    Object.assign(popup.style, {
      position: 'fixed',
      top: '80px',
      right: '8px',
      background: '#000',
      borderRadius: '6px',
      padding: '4px',
      display: 'none',
      zIndex: '999999',
    });

    speeds.forEach(spd => {
      const item = document.createElement('div');
      item.textContent = ${spd}×;
      Object.assign(item.style, {
        color: '#fff',
        fontSize: '15px',
        padding: '4px',
        textAlign: 'center',
        cursor: 'pointer',
      });
      item.onmouseenter = () => item.style.background = '#333';
      item.onmouseleave = () => item.style.background = 'none';
      item.onclick = () => {
        speed = spd;
        localStorage.setItem('speed-' + location.hostname, speed);
        btn.textContent = speed + '×';
        reapplyIntervals();
        applyVideoSpeed();
        popup.style.display = 'none';
      };
      popup.appendChild(item);
    });

    btn.onclick = () => {
      popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
    };

    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(btn);
      document.body.appendChild(popup);
    });
  }

  createUI();
  setInterval(applyVideoSpeed, 500);
})();
