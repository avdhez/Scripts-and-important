// ==UserScript==
// @name         Block Popup & Shortener Rewrites
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Block popup and shortener scripts from rewriting links while keeping the site working normally ( For OnlyKDrama Site )
// @author       Avdhesh
// @match        *://*/*
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // 1️⃣ Block their global functions before they load
    Object.defineProperty(window, 'popupHosts', {
        configurable: true,
        get() { return []; },
        set() {} // block setting
    });

    Object.defineProperty(window, 'shortenerHosts', {
        configurable: true,
        get() { return []; },
        set() {} // block setting
    });

    // 2️⃣ Prevent their functions from working even if defined later
    const blockFunctions = ['protectWithPopup', 'shortenLinkIfAllowed'];
    for (const fn of blockFunctions) {
        Object.defineProperty(window, fn, {
            configurable: true,
            set() {
                // replace their function with a harmless no-op
                window[fn] = () => {};
            }
        });
    }

    // 3️⃣ Optional: Auto-fix already rewritten links (if script loaded first)
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('a[data-original]').forEach(a => {
            a.href = a.getAttribute('data-original');
        });
    });
})();
