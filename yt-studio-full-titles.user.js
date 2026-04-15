// ==UserScript==
// @name         YouTube Live Studio QOL
// @namespace    https://louis.au/
// @version      4.6.4
// @description  YouTube Studio QoL: intrinsic-width titles, optional wrapping, hide useless info, hide descriptions in wrap mode, truncate descriptions in non-wrap, rows-per-page=50, account sorting, visibility warnings, compact Copy Stream URL icon button (left of Type), optional title sorting (A–Z) on /livestreaming (and /livestreaming/manage). Always-on: widen Stream Key dropdown in Live to prevent truncation. Fix: don’t re-run DOM mutations while menus are open (prevents menus auto-closing).
// @author       louis.au
// @match        https://studio.youtube.com/*
// @downloadURL  https://louis.au/yt-studio-full-titles.user.js
// @updateURL    https://louis.au/yt-studio-full-titles.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    defaultEnableTitleWrap: true,
    defaultHideUselessInfo: true,
    defaultRowsPerPageEnabled: true,
    defaultAccountSortEnabled: true,
    defaultVisibilityWarningsEnabled: true,
    defaultTitleSortingEnabled: false, // OFF by default

    rowsPerPageValue: 50,
    nonWrapDescriptionMaxChars: 100
  };

  const STORE = {
    WRAP: 'enableTitleWrap',
    HIDE_USELESS: 'hideUselessInfo',
    ROWS: 'enableRowsPerPage50',
    SORT: 'enableAccountSorting',
    VIS_WARN: 'enableVisibilityWarnings',
    SORT_TITLES: 'enableTitleSorting',
    NO_WARN: 'suppressVideosLiveWarning' // persistent "don't warn me again"
  };

  const STYLE_ID = 'ytstudio-full-title-css';
  const CLASS_HIDE = 'ytstudio-hide-useless';
  const DESC_TRUNC_ATTR = 'data-ytstudio-desc-orig';
  const VIS_ICON_CLASS = 'ytstudio-vis-icon';

  // Copy Stream URL column identifiers
  const COPY_CELL_CLASS = 'tablecell-copy-stream-url';
  const COPY_BTN_CLASS = 'ytstudio-copy-url-btn';
  const COPY_DONE_ATTR = 'data-ytstudio-copycol';

  const OVERLAY_ID = 'ytstudio-channel-videos-live-warning';
  const OVERLAY_DISMISS_PREFIX = 'ytstudio_overlay_dismiss:'; // sessionStorage key prefix
  const OVERLAY_SEEN_PREFIX = 'ytstudio_overlay_seen:'; // sessionStorage key prefix for "has been dismissed before"

  const isWrapEnabled = () => GM_getValue(STORE.WRAP, CONFIG.defaultEnableTitleWrap);
  const isHideUselessEnabled = () => GM_getValue(STORE.HIDE_USELESS, CONFIG.defaultHideUselessInfo);
  const isRowsEnabled = () => GM_getValue(STORE.ROWS, CONFIG.defaultRowsPerPageEnabled);
  const isSortEnabled = () => GM_getValue(STORE.SORT, CONFIG.defaultAccountSortEnabled);
  const isVisWarnEnabled = () => GM_getValue(STORE.VIS_WARN, CONFIG.defaultVisibilityWarningsEnabled);
  const isTitleSortEnabled = () => GM_getValue(STORE.SORT_TITLES, CONFIG.defaultTitleSortingEnabled);

  const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function truncateText(s, max) {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    if (!t) return t;
    if (t.length <= max) return t;
    return t.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        // ensure the textarea is focused before selecting (more reliable)
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (__) {
        return false;
      }
    }
  }

  function isLiveStreamingPage() {
    return /\/livestreaming\b/i.test(location.pathname);
  }

  // ✅ Prevent menus auto-closing: if any menu/popup is open, don't mutate DOM.
  function isAnyMenuOpen() {
    const candidates = document.querySelectorAll(
      'ytcp-menu-panel, ytcp-popup-container, tp-yt-paper-dialog, [role="menu"]'
    );

    for (const el of candidates) {
      // must be visible
      if (el.offsetParent !== null) return true;

      // or explicitly marked visible
      const ariaHidden = el.getAttribute('aria-hidden');
      if (ariaHidden === 'false') return true;

      // or currently focused / contains focus
      if (el.contains(document.activeElement)) return true;
    }

    return false;
  }

  /**************************************************************************
   * CSS
   **************************************************************************/
  function buildCSS() {
    const wrap = isWrapEnabled();

    const base = `
      .${CLASS_HIDE} { display: none !important; }

      /* ===========================
         Always-on: Stream Key size fix
         (YouTube Studio Live ingestion controls)
      */
      #ingestion-container{
        justify-content: end !important;
      }
      #ingestion-dropdown{
        width: 400px !important;
      }
      #trigger{
        width: 384px !important;
      }
      #ingestion-dropdown-trigger{
        max-width: none !important;
      }
      /* Scope ingestion popup sizing to the ingestion container only.
         Previously this used a body-level class which caused other popups
         (eg. "Schedule with previous settings") to be resized/warped. */
      #ingestion-container.louis-yt-ingestion-open .ytls-popup-container,
      #ingestion-dropdown.louis-yt-ingestion-open .ytls-popup-container {
        width: 400px !important;
        max-width: none !important;
        border-radius: 5px !important;
      }

      /* Visibility emoji sits next to label-span in icon-text-edit-triangle-wrap */
      .${VIS_ICON_CLASS} {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        margin-left: 6px !important;
        font-size: 14px !important;
        line-height: 1 !important;
        vertical-align: middle !important;
        transform: translateY(1.5px) !important;
        user-select: none !important;
      }

      /* Compact Copy URL icon button */
      .${COPY_BTN_CLASS} {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 30px !important;
        height: 30px !important;
        padding: 0 !important;
        border-radius: 999px !important;
        border: 1px solid rgba(255,255,255,0.18) !important;
        background: rgba(255,255,255,0.06) !important;
        color: rgba(255,255,255,0.92) !important;
        cursor: pointer !important;
      }
      .${COPY_BTN_CLASS}:hover {
        background: rgba(255,255,255,0.10) !important;
        border-color: rgba(255,255,255,0.28) !important;
      }
      .${COPY_BTN_CLASS}:active {
        background: rgba(255,255,255,0.14) !important;
      }
      .${COPY_BTN_CLASS}[data-state="ok"] {
        border-color: rgba(0, 200, 0, 0.45) !important;
        background: rgba(0, 150, 0, 0.16) !important; /* whole button green */
        color: #eaffea !important; /* ensure icon/text contrasts */
      }
      .${COPY_BTN_CLASS}[data-state="fail"] {
        border-color: rgba(220, 60, 60, 0.55) !important;
      }
      .${COPY_BTN_CLASS} svg {
        width: 16px !important;
        height: 16px !important;
        fill: currentColor !important;
        opacity: 0.95 !important;
        pointer-events: none !important;
      }

      ytcp-video-list-cell-video .right-section,
      ytcp-video-list-cell-video .top-section {
        min-width: 0 !important;
      }

      ytcp-video-list-cell-video #hover-items,
      ytcp-video-list-cell-video .open-menu-button {
        position: relative !important;
        z-index: 5 !important;
      }

      ytcp-video-list-cell-video a#video-title,
      ytcp-video-list-cell-video a#video-title > span,
      ytcp-video-list-cell-video a#video-title span {
        max-width: 100% !important;
      }
    `;

    if (!wrap) {
      return `
        ${base}

        ytcp-video-list-cell-video,
        ytcp-video-list-cell-video.style-scope.ytcp-video-row,
        .tablecell-video {
          flex: 0 1 auto !important;
          width: fit-content !important;
          width: max-content !important;
          max-width: 100% !important;
          min-width: 0 !important;
        }

        ytcp-video-list-cell-video .video-title-wrapper {
          overflow: visible !important;
        }

        ytcp-video-list-cell-video a#video-title,
        ytcp-video-list-cell-video a#video-title > span,
        ytcp-video-list-cell-video a#video-title span,
        ytcp-video-list-cell-video span.style-scope.ytcp-video-list-cell-video {
          display: inline !important;
          white-space: nowrap !important;
          overflow: visible !important;
          text-overflow: unset !important;
          max-height: none !important;
          height: auto !important;
        }
      `;
    }

    return `
      ${base}

      ytcp-video-list-cell-video,
      ytcp-video-list-cell-video.style-scope.ytcp-video-row,
      .tablecell-video {
        min-width: 0 !important;
      }

      ytcp-video-list-cell-video .video-title-wrapper {
        overflow: visible !important;
        max-height: none !important;
        height: auto !important;
      }

      ytcp-video-list-cell-video a#video-title,
      ytcp-video-list-cell-video a#video-title > span,
      ytcp-video-list-cell-video a#video-title span,
      ytcp-video-list-cell-video span.style-scope.ytcp-video-list-cell-video {
        display: block !important;
        white-space: normal !important;
        overflow: visible !important;
        text-overflow: unset !important;
        overflow-wrap: anywhere !important;

        -webkit-line-clamp: unset !important;
        line-clamp: unset !important;
        -webkit-box-orient: unset !important;

        max-height: none !important;
        height: auto !important;
      }

      /* HARD RULE: hide descriptions entirely in wrap mode */
      ytcp-video-list-cell-video .video-under-title-wrapper {
        display: none !important;
      }
    `;
  }

  function upsertStyle(force = false) {
    if (!document.head) return;
    const css = buildCSS();
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
      style.textContent = css;
      return;
    }
    if (force || style.textContent !== css) style.textContent = css;
  }

  /**************************************************************************
   * Hide useless info (cells only)
   **************************************************************************/
  function updateUselessInfoVisibility() {
    const enabled = isHideUselessEnabled();

    document.querySelectorAll('.tablecell-live-source[role="cell"]').forEach(cell => {
      cell.classList.toggle(CLASS_HIDE, enabled && norm(cell.textContent) === 'streaming software');
    });

    document.querySelectorAll('.tablecell-restrictions[role="cell"]').forEach(cell => {
      cell.classList.toggle(CLASS_HIDE, enabled && norm(cell.textContent) === 'none');
    });
  }

  /**************************************************************************
   * Description truncation (non-wrap mode only)
   **************************************************************************/
  function applyDescriptionTruncation() {
    const wrap = isWrapEnabled();
    const max = CONFIG.nonWrapDescriptionMaxChars;

    const descEls = document.querySelectorAll(
      'ytcp-video-list-cell-video .video-under-title-wrapper .description'
    );

    descEls.forEach(el => {
      const isPlaceholder = el.classList.contains('placeholder');

      if (wrap) {
        if (el.hasAttribute(DESC_TRUNC_ATTR)) {
          el.textContent = el.getAttribute(DESC_TRUNC_ATTR) || el.textContent;
          el.removeAttribute(DESC_TRUNC_ATTR);
        }
        return;
      }

      if (isPlaceholder) {
        if (el.hasAttribute(DESC_TRUNC_ATTR)) {
          el.textContent = el.getAttribute(DESC_TRUNC_ATTR) || el.textContent;
          el.removeAttribute(DESC_TRUNC_ATTR);
        }
        return;
      }

      if (!el.hasAttribute(DESC_TRUNC_ATTR)) {
        el.setAttribute(DESC_TRUNC_ATTR, el.textContent || '');
      }

      const original = el.getAttribute(DESC_TRUNC_ATTR) || '';
      el.textContent = truncateText(original, max);
    });
  }

  /**************************************************************************
   * Visibility warnings (emoji next to visibility label)
   **************************************************************************/
  function getVisibilityEmoji(visibilityTextLower) {
    if (/\b18\+?\b/.test(visibilityTextLower) || visibilityTextLower.includes('18+')) return '⚠️';
    if (visibilityTextLower.includes('public')) return '🔴';
    if (visibilityTextLower.includes('unlisted')) return '🟢';
    if (visibilityTextLower.includes('private')) return '🤫';
    return '';
  }

  function removeAllVisibilityIcons() {
    document.querySelectorAll(`.${VIS_ICON_CLASS}`).forEach(n => n.remove());
  }

  function applyVisibilityWarnings() {
    const enabled = isVisWarnEnabled();
    if (!enabled) {
      removeAllVisibilityIcons();
      return;
    }

    document.querySelectorAll('.tablecell-visibility[role="cell"]').forEach(cell => {
      const wrap = cell.querySelector('.icon-text-edit-triangle-wrap');
      const label = wrap?.querySelector('span.label-span');
      if (!wrap || !label) return;

      const labelText = norm(label.textContent);
      const emoji = getVisibilityEmoji(labelText);

      const existing = wrap.querySelector(`.${VIS_ICON_CLASS}`);
      if (!emoji) {
        if (existing) existing.remove();
        return;
      }

      if (existing) {
        if (existing.textContent !== emoji) existing.textContent = emoji;
        return;
      }

      const span = document.createElement('span');
      span.className = VIS_ICON_CLASS;
      span.textContent = emoji;

      label.insertAdjacentElement('afterend', span);
    });
  }

  /**************************************************************************
   * Copy Stream URL column (left of Type) + compact icon button
   **************************************************************************/
  function extractVideoIdFromRow(row) {
    const a = row.querySelector('a#video-title');
    const href = a?.getAttribute('href') || '';
    const m = href.match(/\/video\/([^\/\?#]+)\b/i);
    if (m && m[1]) return m[1];

    const any = Array.from(row.querySelectorAll('a[href*="/video/"]'))
      .map(x => x.getAttribute('href') || '')
      .find(h => /\/video\/[^\/]+/i.test(h));
    if (any) {
      const mm = any.match(/\/video\/([^\/\?#]+)\b/i);
      if (mm && mm[1]) return mm[1];
    }
    return '';
  }

  function buildWatchUrl(videoId) {
    if (!videoId) return '';
    return `https://youtu.be/${encodeURIComponent(videoId)}`;
  }

  function makeLinkIconSvg() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute(
      'd',
      'M10.59 13.41a1 1 0 0 0 1.41 1.41l4.24-4.24a3 3 0 0 0-4.24-4.24l-1.41 1.41a1 1 0 1 0 1.41 1.41l1.41-1.41a1 1 0 0 1 1.41 1.41l-4.24 4.24zM13.41 10.59a1 1 0 0 0-1.41-1.41L7.76 13.42a3 3 0 0 0 4.24 4.24l1.41-1.41a1 1 0 1 0-1.41-1.41l-1.41 1.41a1 1 0 0 1-1.41-1.41l4.23-4.25z'
    );
    svg.appendChild(p);
    return svg;
  }

  function ensureCopyColumnHeader() {
    const typeHeader =
      document.querySelector('[role="columnheader"].tablecell-live-source') ||
      document.querySelector('.tablecell-live-source[role="columnheader"]') ||
      document.querySelector('div[role="columnheader"][class*="tablecell-live-source"]');

    if (!typeHeader) return;

    const parent = typeHeader.parentElement;
    if (!parent) return;

    const existing = parent.querySelector(`[role="columnheader"].${COPY_CELL_CLASS}`);
    if (existing) {
      if (existing.nextElementSibling === typeHeader) return;
      try { parent.insertBefore(existing, typeHeader); } catch (_) {}
      return;
    }

    const header = document.createElement('div');
    header.setAttribute('role', 'columnheader');
    header.className = `cell-header ${COPY_CELL_CLASS} style-scope ytcp-video-list-header`;
    header.title = 'Copy URL';
    header.setAttribute('aria-label', 'Copy URL');

    header.style.minWidth = '44px';
    header.style.paddingLeft = '12px';
    header.style.paddingRight = '12px';
    header.style.flex = '0 0 44px';
    header.style.maxWidth = '44px';

    parent.insertBefore(header, typeHeader);
  }

  function ensureCopyUrlButtons() {
    document.querySelectorAll('ytcp-video-row').forEach(row => {
      const typeCell = row.querySelector('.tablecell-live-source[role="cell"]');
      const restrictionsCell = row.querySelector('.tablecell-restrictions[role="cell"]');
      if (!typeCell || !restrictionsCell) return;

      const existing = row.querySelector(`.${COPY_CELL_CLASS}[role="cell"]`);
      if (existing) {
        if (existing.nextElementSibling !== typeCell) {
          try { typeCell.parentElement?.insertBefore(existing, typeCell); } catch (_) {}
        }
        row.setAttribute(COPY_DONE_ATTR, '1');
        return;
      }

      const cell = document.createElement('div');
      cell.setAttribute('role', 'cell');
      cell.className = `cell-body ${COPY_CELL_CLASS} style-scope ytcp-video-row`;

      cell.style.minWidth = '44px';
      cell.style.paddingLeft = '12px';
      cell.style.paddingRight = '12px';
      cell.style.flex = '0 0 44px';
      cell.style.maxWidth = '44px';
      cell.style.display = 'flex';
      cell.style.alignItems = 'center';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = COPY_BTN_CLASS;
      btn.title = 'Copy Stream URL';
      btn.setAttribute('aria-label', 'Copy Stream URL');
      btn.appendChild(makeLinkIconSvg());

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // mark copy in progress to avoid concurrent DOM mutations (sorting/etc)
        window.__ytstudio_copy_in_progress = true;
        try {
          const vid = extractVideoIdFromRow(row);
          const url = buildWatchUrl(vid);

          if (!url) {
            btn.dataset.state = 'fail';
            return;
          }

          const ok = await copyToClipboard(url);
          btn.dataset.state = ok ? 'ok' : 'fail';
        } finally {
          // clear flag and visual state shortly after
          setTimeout(() => {
            delete btn.dataset.state;
            window.__ytstudio_copy_in_progress = false;
          }, 5000);
        }
      });

      cell.appendChild(btn);
      typeCell.insertAdjacentElement('beforebegin', cell);
      row.setAttribute(COPY_DONE_ATTR, '1');
    });
  }

  /**************************************************************************
   * Rows per page
   **************************************************************************/
  let rowsDone = false;

  function trySetRowsPerPage() {
    if (!isRowsEnabled() || rowsDone) return;

    const valueEl = document.querySelector('#page-control-container span.dropdown-trigger-text');
    if (!valueEl) return;

    if (valueEl.textContent.trim() === String(CONFIG.rowsPerPageValue)) {
      rowsDone = true;
      return;
    }

    const trigger = document.querySelector('#page-control-container ytcp-dropdown-trigger');
    if (!trigger) return;

    trigger.click();
    setTimeout(() => {
      const target = Array.from(document.querySelectorAll('tp-yt-paper-item'))
        .find(i => i.textContent.trim() === String(CONFIG.rowsPerPageValue));
      if (target) {
        target.click();
        rowsDone = true;
      }
    }, 150);
  }

  /**************************************************************************
   * Account switcher sorting (works across Studio pages; sorts when menu opens)
   **************************************************************************/
  const ACCOUNT_SORTED_SIG = 'data-ytstudio-account-sort-sig';

  function isProbablyChannelItem(el) {
    if (!(el instanceof Element)) return false;
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;

    // Exclude obvious non-channel actions
    const tl = t.toLowerCase();
    if (
      tl.includes('sign out') ||
      tl.includes('settings') ||
      tl.includes('help') ||
      tl.includes('send feedback') ||
      tl.includes('add account') ||
      tl.includes('switch account') ||
      tl.includes('privacy policy') ||
      tl.includes('terms of service')
    ) return false;

    // Prefer items that link to a channel — but only when the link points
    // directly to /channel/{ID} (no extra path segments like /posts or /livestreaming).
    const a = el.querySelector('a[href*="/channel/"], a[href*="studio.youtube.com/channel/"]');
    if (a) {
      const href = a.getAttribute('href') || '';
      if (/\/channel\/[^\/\?#]+(?:[?#]|$)/i.test(href)) return true;
    }

    // Many account menu entries include an avatar/thumbnail; use that as a fallback signal
    if (el.querySelector('img, ytcp-avatar, yt-img-shadow, ytcp-channel-avatar')) return true;

    return false;
  }

  function getSortableName(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function sortOneContainer(container) {
    if (!(container instanceof Element)) return;

    const children = Array.from(container.children).filter(n => n instanceof Element);
    if (children.length < 2) return;

    const items = children.filter(isProbablyChannelItem);
    if (items.length < 2) return;

    const sig = items.map(getSortableName).join('|');
    if (container.getAttribute(ACCOUNT_SORTED_SIG) === sig) return;

    const marker = document.createElement('span');
    marker.style.display = 'none';
    container.insertBefore(marker, items[0]);

    const sorted = items.slice().sort((a, b) =>
      getSortableName(a).localeCompare(getSortableName(b), undefined, { numeric: true, sensitivity: 'base' })
    );

    for (const it of items) it.remove();
    const frag = document.createDocumentFragment();
    for (const it of sorted) frag.appendChild(it);

    container.insertBefore(frag, marker);
    marker.remove();

    container.setAttribute(ACCOUNT_SORTED_SIG, sig);
  }

  function sortAccountSwitcher() {
    if (!isSortEnabled()) return;

    // Sort the known account item containers
    const nodes = document.querySelectorAll('ytd-account-item-renderer, ytcp-account-item');
    const parents = new Set(Array.from(nodes).map(n => n.parentElement).filter(Boolean));
    parents.forEach(sortOneContainer);

    // Also sort any visible menu/popup panels that contain channel-like entries
    const panels = Array.from(document.querySelectorAll('ytcp-menu-panel, ytcp-popup-container, tp-yt-paper-dialog, [role="menu"]'))
      .filter(p => p instanceof Element);

    for (const panel of panels) {
      // Only bother if it looks "open-ish"
      const openish = (panel.offsetParent !== null) || (panel.getAttribute('aria-hidden') === 'false') || panel.contains(document.activeElement);
      if (!openish) continue;

      // Find candidate list containers within the panel
      const candidateLists = new Set();
      panel.querySelectorAll('ytd-account-item-renderer, ytcp-account-item').forEach(n => n.parentElement && candidateLists.add(n.parentElement));

      // Fallback: some menus are just lists of items
      panel.querySelectorAll('tp-yt-paper-item').forEach(n => n.parentElement && candidateLists.add(n.parentElement));

      candidateLists.forEach(sortOneContainer);
    }
  }

  /**************************************************************************
   * Stream sorting by title (A→Z) — ONLY on /livestreaming*
   * Keeps "Live now" and "Upcoming" separated by sorting inside each section.
   **************************************************************************/
  function getRowTitleForSort(row) {
    const a = row.querySelector('a#video-title');
    return ((a?.textContent || '').replace(/\s+/g, ' ').trim()) || '';
  }

  function collectLivestreamGroups() {
    const groups = [];

    const contents = Array.from(document.querySelectorAll('ytcp-video-section-content'));
    for (const content of contents) {
      const kids = Array.from(content.children);
      if (!kids.some(k => k.matches?.('ytcp-video-row')) || !kids.some(k => k.querySelector?.('.subheading-row-text'))) continue;

      let currentKey = '';
      let currentRows = [];

      const flush = () => {
        if (currentKey && currentRows.length) groups.push({ key: currentKey, rows: currentRows });
        currentRows = [];
      };

      for (const el of kids) {
        const heading = el.querySelector?.('.subheading-row-text');
        if (heading) {
          flush();
          currentKey = (heading.textContent || '').trim() || 'section';
          continue;
        }
        if (el.matches?.('ytcp-video-row')) currentRows.push(el);
      }
      flush();
    }

    if (groups.length === 0) {
      const rows = Array.from(document.querySelectorAll('ytcp-video-row'));
      const parentGroups = new Map();
      for (const row of rows) {
        const parent = row.parentElement;
        if (!parent) continue;

        let sib = row.previousElementSibling;
        let key = '';
        while (sib) {
          const h = sib.querySelector?.('.subheading-row-text');
          if (h) { key = (h.textContent || '').trim(); break; }
          sib = sib.previousElementSibling;
        }
        if (!key) continue;

        if (!parentGroups.has(parent)) parentGroups.set(parent, new Map());
        const m = parentGroups.get(parent);
        if (!m.has(key)) m.set(key, []);
        m.get(key).push(row);
      }

      for (const [, m] of parentGroups.entries()) {
        for (const [key, r] of m.entries()) groups.push({ key, rows: r });
      }
    }

    return groups;
  }

  function sortRowsInPlace(rows) {
    if (!rows || rows.length < 2) return;
    const parent = rows[0].parentElement;
    if (!parent) return;

    const marker = document.createElement('span');
    marker.style.display = 'none';
    parent.insertBefore(marker, rows[0]);

    const sorted = rows.slice().sort((ra, rb) => {
      const a = getRowTitleForSort(ra);
      const b = getRowTitleForSort(rb);
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    const frag = document.createDocumentFragment();
    sorted.forEach(r => frag.appendChild(r));
    parent.insertBefore(frag, marker);
    marker.remove();
  }

  function sortStreamsByTitleWithinGroups() {
    if (!isTitleSortEnabled()) return;
    if (!isLiveStreamingPage()) return;

    const groups = collectLivestreamGroups();
    if (!groups.length) return;

    for (const g of groups) {
      if (g.rows.length < 2) continue;
      sortRowsInPlace(g.rows);
    }
  }

  /**************************************************************************
   * Menu with (ON)/(OFF) labels
   **************************************************************************/
  const menuIds = [];
  const onLabel = (labelBase, enabled) => `${labelBase} (${enabled ? 'ON' : 'OFF'})`;

  function clearMenu() {
    while (menuIds.length) {
      const id = menuIds.pop();
      try { GM_unregisterMenuCommand(id); } catch (_) {}
    }
  }

  function registerMenu() {
    clearMenu();

    menuIds.push(GM_registerMenuCommand(
      onLabel('Toggle title line wrapping', isWrapEnabled()),
      () => {
        GM_setValue(STORE.WRAP, !isWrapEnabled());
        upsertStyle(true);
        applyDescriptionTruncation();
        registerMenu();
      }
    ));

    menuIds.push(GM_registerMenuCommand(
      onLabel('Toggle hiding useless info', isHideUselessEnabled()),
      () => { GM_setValue(STORE.HIDE_USELESS, !isHideUselessEnabled()); updateUselessInfoVisibility(); registerMenu(); }
    ));

    menuIds.push(GM_registerMenuCommand(
      onLabel('Toggle rows per page = 50', isRowsEnabled()),
      () => { GM_setValue(STORE.ROWS, !isRowsEnabled()); rowsDone = false; trySetRowsPerPage(); registerMenu(); }
    ));

    menuIds.push(GM_registerMenuCommand(
      onLabel('Toggle account list alphabetical sorting', isSortEnabled()),
      () => { GM_setValue(STORE.SORT, !isSortEnabled()); sortAccountSwitcher(); registerMenu(); }
    ));

    menuIds.push(GM_registerMenuCommand(
      onLabel('Toggle stream visibility warnings', isVisWarnEnabled()),
      () => { GM_setValue(STORE.VIS_WARN, !isVisWarnEnabled()); applyVisibilityWarnings(); registerMenu(); }
    ));

    menuIds.push(GM_registerMenuCommand(
      onLabel('Toggle sorting streams by title (A→Z)', isTitleSortEnabled()),
      () => {
        const newVal = !isTitleSortEnabled();
        GM_setValue(STORE.SORT_TITLES, newVal);
        // If turning OFF, reload to fully revert any in-place DOM reordering.
        if (!newVal) {
          // small delay so menu command finishes before navigation
          setTimeout(() => { location.reload(); }, 50);
          return;
        }
        // If turning ON, apply immediately.
        runAll();
        registerMenu();
      }
    ));
  }

  /**************************************************************************
   * Observer (debounced)
   **************************************************************************/
  function debounce(fn, delay) {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, delay);
    };
  }

  function runAll() {
    // show/remove channel videos/live overlay regardless of menus
    handleChannelVideosLiveOverlay();

    // If a menu is open, ONLY do account sorting (so the account list can be sorted everywhere)
    // and avoid other DOM mutations that can close menus.
    // Also avoid heavy DOM mutations while a copy operation is in progress
    if (isAnyMenuOpen() || window.__ytstudio_copy_in_progress) {
      sortAccountSwitcher();
      return;
    }

    upsertStyle();
    updateUselessInfoVisibility();
    applyDescriptionTruncation();
    applyVisibilityWarnings();
    trySetRowsPerPage();
    sortAccountSwitcher();

    ensureCopyColumnHeader();
    ensureCopyUrlButtons();

    sortStreamsByTitleWithinGroups();
  }

  const onDomChange = debounce(() => {
    runAll();
  }, 250);

  function startDomObserver() {
    const observer = new MutationObserver(() => {
      onDomChange();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  /**************************************************************************
   * SPA navigation (rerun on URL change)
   **************************************************************************/
  let lastHref = '';

  function hookHistory() {
    const _pushState = history.pushState;
    const _replaceState = history.replaceState;

    history.pushState = function (...args) {
      const ret = _pushState.apply(this, args);
      scheduleNavResync();
      return ret;
    };

    history.replaceState = function (...args) {
      const ret = _replaceState.apply(this, args);
      scheduleNavResync();
      return ret;
    };

    window.addEventListener('popstate', scheduleNavResync, { passive: true });
  }

  function scheduleNavResync() {
    const href = location.href;
    if (href === lastHref) return;
    // clear any per-path "dismiss" markers when navigating to a new SPA route
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(OVERLAY_DISMISS_PREFIX)) sessionStorage.removeItem(key);
      }
    } catch (_) {}
    lastHref = href;

    rowsDone = false;
    runAll();
  }

  function installIngestionPopupGate() {
    let t = null;

    const enable = () => {
      const container = document.querySelector('#ingestion-container') || document.querySelector('#ingestion-dropdown');
      if (container) container.classList.add('louis-yt-ingestion-open');
    };

    // Capture clicks anywhere; only enable when the ingestion dropdown/trigger is clicked.
    document.addEventListener('click', (e) => {
      const el = e.target;
      clearTimeout(t);
      const hit = el.closest && el.closest('#ingestion-dropdown-trigger, #ingestion-dropdown, #trigger, #ingestion-container');
      if (hit) {
        enable();
        // remove class from the specific container after a short time
        const container = document.querySelector('#ingestion-container') || document.querySelector('#ingestion-dropdown');
        t = setTimeout(() => { if (container) container.classList.remove('louis-yt-ingestion-open'); }, 3000);
      }
    }, true);
  }

  /**************************************************************************
   * Channel "videos/live" page warning overlay
   **************************************************************************/
  function isChannelVideosLivePage() {
    // matches /channel/{id}/videos/live (also covers any trailing slash)
    return /\/channel\/[^\/]+\/videos\/live\/?$/.test(location.pathname);
  }

  function isOverlaySuppressed() {
    try {
      return GM_getValue(STORE.NO_WARN, false);
    } catch (_) {
      return false;
    }
  }

  function isOverlayDismissedThisSession() {
    try {
      return sessionStorage.getItem(OVERLAY_DISMISS_PREFIX + location.pathname) === '1';
    } catch (_) {
      return false;
    }
  }

  function removeChannelWarningOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();
  }

  function showChannelWarningOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    Object.assign(overlay.style, {
      position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: '2147483647', background: 'rgba(0,0,0,0.45)'
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
      background: '#121212', color: '#fff', padding: '20px',
      maxWidth: '560px', width: '90%', borderRadius: '8px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.6)', textAlign: 'center',
      fontFamily: 'Roboto, Arial, sans-serif', lineHeight: '1.4'
    });

    const title = document.createElement('div');
    title.textContent = "This page is unsupported by the script";
    Object.assign(title.style, { fontSize: '18px', fontWeight: '600', marginBottom: '8px' });

    const msg = document.createElement('div');
    msg.textContent = "The benefits of this Tampermonkey script won't work on this page. Use the 'Go Live' page instead.";
    msg.style.marginBottom = '16px';

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'center';
    btnRow.style.gap = '10px';

    const goBtn = document.createElement('button');
    goBtn.textContent = 'Go there';
    Object.assign(goBtn.style, { padding: '8px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#1a73e8', color: '#fff', fontWeight: '600' });

    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Dismiss';
    Object.assign(dismissBtn.style, { padding: '8px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#fff', cursor: 'pointer', fontWeight: '600' });

    // "Don't warn me again" button is only created/shown if the user has previously dismissed
    let dontWarnBtn = null;
    try {
      // show the persistent "Don't warn me again" button if the user has dismissed
      // the overlay on any channel during this session (global seen flag)
      if (sessionStorage.getItem(OVERLAY_SEEN_PREFIX) === '1') {
        dontWarnBtn = document.createElement('button');
        dontWarnBtn.textContent = "Don't warn me again";
        Object.assign(dontWarnBtn.style, { padding: '8px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#fff', cursor: 'pointer', fontWeight: '600' });
      }
    } catch (_) { dontWarnBtn = null; }

    goBtn.addEventListener('click', () => {
      const newPath = location.pathname.replace(/\/videos\/live\/?$/, '/livestreaming');
      location.href = location.origin + newPath + location.search + location.hash;
    });

    dismissBtn.addEventListener('click', () => {
      try {
        // prevents immediate re-show until they leave & return
        sessionStorage.setItem(OVERLAY_DISMISS_PREFIX + location.pathname, '1');
        // record a global "seen" flag for this session so the "Don't warn me again"
        // button is shown on any channel after they've dismissed once
        sessionStorage.setItem(OVERLAY_SEEN_PREFIX, '1');
      } catch (_) {}
      removeChannelWarningOverlay();
    });

    if (dontWarnBtn) {
      dontWarnBtn.addEventListener('click', () => {
        try { GM_setValue(STORE.NO_WARN, true); } catch (_) {}
        removeChannelWarningOverlay();
      });
    }

    btnRow.appendChild(goBtn);
    btnRow.appendChild(dismissBtn);
    if (dontWarnBtn) btnRow.appendChild(dontWarnBtn);

    box.appendChild(title);
    box.appendChild(msg);
    box.appendChild(btnRow);
    overlay.appendChild(box);

    document.body.appendChild(overlay);
  }

  function handleChannelVideosLiveOverlay() {
    if (!document.body) return;
    if (!isChannelVideosLivePage()) {
      removeChannelWarningOverlay();
      return;
    }
    if (isOverlaySuppressed()) {
      removeChannelWarningOverlay();
      return;
    }
    if (isOverlayDismissedThisSession()) {
      removeChannelWarningOverlay();
      return;
    }
    showChannelWarningOverlay();
  }

  /**************************************************************************
   * Start
   **************************************************************************/
  function start() {
    // ensure flag exists
    window.__ytstudio_copy_in_progress = false;
    hookHistory();
    registerMenu();

    installIngestionPopupGate();

    lastHref = location.href;

    runAll();
    startDomObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();