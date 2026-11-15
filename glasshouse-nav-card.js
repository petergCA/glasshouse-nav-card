/*!
 * Glasshouse Nav Card v1.2.3
 * App-like navigation for multi-view Home Assistant dashboards: a floating frosted tab bar on
 * phones, a slim rail (or a centred segmented bar) on desktop.
 * Part of the Glasshouse card suite. MIT License (c) 2026 Peter Gray.
 */
(() => {
  'use strict';

  const VERSION = '1.2.4';
  const TAG = 'glasshouse-nav-card';
  const PORTAL_TAG = 'glasshouse-nav-portal';
  const HEADER_STYLE_ID = 'glasshouse-nav-hide-header';

  const MAX_TABS = 5;            // mobile tab bar: at most 5 buttons including "More"
  const BAR_H = 64;              // mobile bar height (px)
  const BAR_GAP = 10;            // gap between bar and the bottom safe area
  const RAIL_W = 76;             // desktop rail width (px)
  const TOP_H = 48;              // desktop top bar height (px)
  const EDGE = 12;               // distance from the view edge
  const TEARDOWN_MS = 400;       // grace period so a view switch does not flicker the bar
  const DRAG_CLOSE_PX = 70;

  const LAYOUTS = ['rail', 'top', 'none'];
  const SIDE_MIN = 56; // px of side safe-area that turns the phone bar vertical
  const HEADER_MODES = ['auto', true, false];

  // Ancestor element names in the Home Assistant frontend that we look for (all optional).
  const VIEW_HOSTS = ['hui-view'];
  const LAYOUT_HOSTS = ['hui-sections-view', 'hui-masonry-view', 'hui-panel-view', 'hui-sidebar-view'];
  const FOOTER_HOSTS = ['hui-view-footer'];
  const PREVIEW_HOSTS = ['hui-card-preview', 'hui-card-picker', 'hui-dialog-edit-card', 'hui-card-element-editor'];

  const STYLE_TOKENS = `
      --gh-font: var(--glasshouse-font, -apple-system, "SF Pro Text", Inter, Roboto, system-ui, sans-serif);
      --gh-surface: var(--glasshouse-surface, rgba(255,255,255,0.045));
      --gh-surface-2: var(--glasshouse-surface-2, rgba(255,255,255,0.075));
      --gh-border: var(--glasshouse-border, rgba(255,255,255,0.09));
      --gh-blur: var(--glasshouse-blur, 18px);
      --gh-radius: var(--glasshouse-radius, 22px);
      --gh-radius-sm: var(--glasshouse-radius-sm, 14px);
      --gh-pad: var(--glasshouse-pad, 16px);
      --gh-gap: var(--glasshouse-gap, 10px);
      --gh-text: var(--glasshouse-text, #e9eef6);
      --gh-text-2: var(--glasshouse-text-2, #93a0b5);
      --gh-text-3: var(--glasshouse-text-3, #5d697d);
      --gh-ok: var(--glasshouse-ok, #3fb950);
      --gh-warn: var(--glasshouse-warn, #e3b341);
      --gh-alert: var(--glasshouse-alert, #ff5c5c);
      --gh-info: var(--glasshouse-info, #58a6ff);
      --gh-light: var(--glasshouse-light, #ffb547);
      --gh-fan: var(--glasshouse-fan, #4dd6e8);
      --gh-cover: var(--glasshouse-cover, #a3a8ff);
      --gh-switch: var(--glasshouse-switch, #7ee08a);
      --gh-heat: var(--glasshouse-heat, #ff7a59);
      --gh-cool: var(--glasshouse-cool, #58a6ff);
      --gh-media: var(--glasshouse-media, #c48cff);
      --gh-lock: var(--glasshouse-lock, #3fb950);
      --gh-security: var(--glasshouse-security, #ff5c5c);
      --gh-energy: var(--glasshouse-energy, #f6d365);
      --gh-water: var(--glasshouse-water, #4aa8ff);
      --gh-neutral: var(--glasshouse-neutral, #93a0b5);
      --gh-nav-bg: var(--glasshouse-nav-bg, rgba(14, 19, 30, 0.7));
      --gh-nav-sheet-bg: var(--glasshouse-nav-sheet-bg, rgba(16, 22, 34, 0.86));
      --gh-nav-z: var(--glasshouse-nav-z, 4);
      --gh-nav-sheet-z: var(--glasshouse-nav-sheet-z, 8);
      --gh-ease: 160ms ease;
      --gh-spring: 180ms cubic-bezier(0.3, 1.35, 0.5, 1);
  `;

  /* The floating surface (bar, rail, sheet). Rendered in a body-level portal so that no
   * transformed / filtered ancestor in the dashboard can break position: fixed. */
  const SURFACE_STYLE = `
    :host {
      ${STYLE_TOKENS}
      --gh-accent: var(--glasshouse-nav-accent, var(--gh-info));
      font-family: var(--gh-font);
      color: var(--gh-text);
      -webkit-font-smoothing: antialiased;
    }
    * { box-sizing: border-box; }
    button {
      font: inherit; color: inherit; background: none; border: 0; margin: 0; padding: 0;
      cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    }
    button:focus { outline: none; }
    button:focus-visible { outline: 2px solid var(--gh-accent); outline-offset: 2px; }
    ha-icon { display: inline-flex; --mdc-icon-size: 22px; }

    .dock { position: fixed; z-index: var(--gh-nav-z); pointer-events: none; }
    .bar {
      pointer-events: auto;
      position: relative;
      background: var(--gh-nav-bg);
      border: 1px solid var(--gh-border);
      -webkit-backdrop-filter: blur(24px) saturate(170%);
      backdrop-filter: blur(24px) saturate(170%);
      box-shadow:
        0 18px 40px -16px rgba(0, 0, 0, 0.75),
        0 4px 12px -4px rgba(0, 0, 0, 0.45),
        inset 0 1px 0 rgba(255, 255, 255, 0.07);
    }
    .track { position: relative; display: flex; }
    .ind {
      position: absolute; left: 0; top: 0; width: 0; height: 0;
      border-radius: 18px;
      background: color-mix(in srgb, var(--a, var(--gh-accent)) 16%, transparent);
      box-shadow:
        inset 0 0 0 1px color-mix(in srgb, var(--a, var(--gh-accent)) 45%, transparent),
        0 0 18px -6px var(--a, var(--gh-accent));
      opacity: 0;
      pointer-events: none;
    }
    .ind.on { opacity: 1; }
    .ready .ind {
      transition: transform var(--gh-spring), width var(--gh-spring), height var(--gh-spring),
        opacity var(--gh-ease), background var(--gh-ease), box-shadow var(--gh-ease);
    }
    .tab {
      position: relative; z-index: 1;
      display: flex; align-items: center; justify-content: center;
      color: var(--gh-text-2);
      min-width: 44px; min-height: 44px;
      transition: color var(--gh-ease), transform 120ms ease;
    }
    .tab:active { transform: scale(0.94); }
    .tab[aria-current="page"], .tab.cur { color: var(--a, var(--gh-accent)); }
    .ic { position: relative; display: inline-flex; }
    .lb {
      font-size: 11px; font-weight: 600; letter-spacing: 0.01em; line-height: 1.25;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
    }
    .tab:not([aria-current="page"]):not(.cur) .lb { color: var(--gh-text-3); }
    .tab:hover:not([aria-current="page"]) { color: var(--gh-text); }

    .badge {
      position: absolute; top: -3px; right: -5px;
      min-width: 9px; height: 9px; border-radius: 9px;
      background: var(--gh-alert);
      box-shadow: 0 0 0 2px rgba(14, 19, 30, 0.95), 0 0 10px -1px var(--gh-alert);
      font-size: 10px; font-weight: 700; line-height: 16px; color: #fff; text-align: center;
      font-variant-numeric: tabular-nums;
      display: none;
    }
    .badge.dot { display: block; }
    .badge.count { display: block; height: 16px; min-width: 16px; padding: 0 4px; top: -6px; right: -9px; }

    /* ---------- mobile: floating tab bar ---------- */
    .dock.mobile {
      left: 0; right: 0; bottom: 0;
      padding: 0 12px calc(${BAR_GAP}px + env(safe-area-inset-bottom));
      display: flex; justify-content: center;
    }
    .mobile .bar { width: 100%; max-width: 520px; height: ${BAR_H}px; border-radius: 32px; padding: 6px; }
    .mobile .track { height: 100%; }
    .mobile .tab { flex: 1 1 0; min-width: 0; flex-direction: column; gap: 4px; padding: 0 2px; }
    .mobile .ind { border-radius: 26px; }

    /* ---------- phones with a wide side safe-area (e.g. a status strip): vertical bar inside it ---------- */
    .dock.mobile.side { top: auto; left: auto; right: auto; padding: 0 6px; justify-content: center;
      bottom: calc(env(safe-area-inset-bottom) + ${BAR_GAP}px); }
    .dock.mobile.side-right { right: 0; width: var(--gh-side-w, env(safe-area-inset-right)); }
    .dock.mobile.side-left { left: 0; width: var(--gh-side-w, env(safe-area-inset-left)); }
    .side .bar { width: 100%; max-width: 72px; height: auto; border-radius: 30px; padding: 6px; }
    .side .track { flex-direction: column; height: auto; gap: 2px; }
    .side .tab { flex: none; width: 100%; height: 62px; flex-direction: column; gap: 3px; padding: 0; }
    .side .lb { font-size: 10px; }
    .side .ind { border-radius: 24px; }

    /* ---------- desktop: rail ---------- */
    .dock.rail { left: var(--gh-nav-left, ${EDGE}px); top: var(--gh-nav-top, 68px); }
    .rail .bar {
      width: ${RAIL_W}px; border-radius: 28px; padding: 8px 6px;
      max-height: calc(100vh - var(--gh-nav-top, 68px) - ${EDGE}px);
      overflow-y: auto; scrollbar-width: none;
    }
    .rail .bar::-webkit-scrollbar { display: none; }
    .rail .track { flex-direction: column; gap: 4px; }
    .rail .tab { flex-direction: column; gap: 5px; width: 100%; height: 60px; padding: 0 2px; }
    .rail .ind { border-radius: 20px; }
    .rail .sep { height: 1px; margin: 4px 12px; background: var(--gh-border); flex: 0 0 auto; }

    /* ---------- desktop: top segmented bar ---------- */
    .dock.top {
      top: var(--gh-nav-top, 68px); left: var(--gh-nav-left, 0px); right: var(--gh-nav-right, 0px);
      display: flex; justify-content: center; padding: 0 ${EDGE}px;
    }
    .top .bar { height: ${TOP_H}px; border-radius: 24px; padding: 5px; max-width: 100%; overflow-x: auto; scrollbar-width: none; }
    .top .bar::-webkit-scrollbar { display: none; }
    .top .track { height: 100%; gap: 2px; }
    .top .tab { flex-direction: row; gap: 8px; padding: 0 16px; min-height: 36px; }
    .top .tab .lb { font-size: 13px; font-weight: 600; }
    .top .tab:not([aria-current="page"]) .lb { color: inherit; }
    .top .ind { border-radius: 19px; }
    .top .sep { width: 1px; margin: 9px 4px; background: var(--gh-border); }

    /* ---------- inline preview (card editor / picker) ---------- */
    .dock.inline { position: relative; inset: auto; padding: 8px 0; z-index: auto; }

    /* ---------- More sheet ---------- */
    .scrim {
      position: fixed; inset: 0; z-index: var(--gh-nav-sheet-z);
      background: rgba(3, 6, 12, 0.5);
      -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
      opacity: 0; visibility: hidden;
      transition: opacity 220ms ease, visibility 0s linear 220ms;
    }
    .sheet {
      position: fixed; z-index: var(--gh-nav-sheet-z);
      left: 10px; right: 10px; bottom: calc(10px + env(safe-area-inset-bottom));
      margin: 0 auto; max-width: 520px;
      max-height: calc(100vh - 80px - env(safe-area-inset-top));
      display: flex; flex-direction: column; outline: none;
      background: var(--gh-nav-sheet-bg);
      border: 1px solid var(--gh-border);
      border-radius: 30px;
      -webkit-backdrop-filter: blur(28px) saturate(170%);
      backdrop-filter: blur(28px) saturate(170%);
      box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.07);
      transform: translateY(calc(100% + 40px));
      visibility: hidden;
      transition: transform 240ms cubic-bezier(0.4, 0, 1, 1), visibility 0s linear 240ms;
    }
    .open .scrim { opacity: 1; visibility: visible; transition: opacity 220ms ease, visibility 0s; }
    .open .sheet {
      transform: none; visibility: visible;
      transition: transform 320ms cubic-bezier(0.2, 0.95, 0.3, 1.04), visibility 0s;
    }
    .sheet.dragging { transition: none !important; }
    .grab { flex: 0 0 auto; padding: 10px 20px 4px; cursor: grab; touch-action: none; }
    .handle { display: block; width: 38px; height: 5px; border-radius: 3px; margin: 0 auto 12px; background: rgba(255, 255, 255, 0.22); }
    .sheet-title {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 11px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: var(--gh-text-2);
      padding: 0 4px;
    }
    .rows { overflow-y: auto; padding: 8px 10px 12px; display: flex; flex-direction: column; gap: 4px; }
    .row {
      position: relative;
      display: flex; align-items: center; gap: 14px;
      width: 100%; min-height: 60px; padding: 8px 12px 8px 8px;
      border-radius: 20px; text-align: left;
      transition: background var(--gh-ease);
    }
    .row:hover { background: var(--gh-surface); }
    .row:focus-visible { outline-offset: -2px; }
    .row:active { background: var(--gh-surface-2); }
    .row .ric {
      position: relative; flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%;
      display: grid; place-items: center;
      background: var(--gh-surface-2); color: var(--gh-text-2);
      transition: background var(--gh-ease), color var(--gh-ease), box-shadow var(--gh-ease);
    }
    .row .rl { flex: 1 1 auto; min-width: 0; font-size: 16px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row .chev { --mdc-icon-size: 20px; color: var(--gh-text-3); }
    .row[aria-current="page"] { background: color-mix(in srgb, var(--a, var(--gh-accent)) 9%, transparent); }
    .row[aria-current="page"] .ric {
      background: color-mix(in srgb, var(--a, var(--gh-accent)) 16%, transparent);
      color: var(--a, var(--gh-accent));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--a, var(--gh-accent)) 45%, transparent), 0 0 18px -6px var(--a, var(--gh-accent));
    }
    .row .badge { top: 2px; right: 0; }
    .row .badge.count { top: -2px; right: -4px; }
    .group-sep { height: 1px; margin: 6px 12px; background: var(--gh-border); }
    .row.sys .rl { font-size: 14px; font-weight: 600; color: var(--gh-text-2); }
    .row.sys { min-height: 52px; }
    .row.sys .ric { width: 36px; height: 36px; margin: 0 4px; background: transparent; }
    .row.sys .ric ha-icon { --mdc-icon-size: 20px; }
    .row .state { font-size: 12px; font-weight: 600; color: var(--gh-text-3); }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition: none !important; animation: none !important; }
    }
  `;

  const CARD_STYLE = `
    :host {
      ${STYLE_TOKENS}
      display: block;
      height: 0;
    }
    :host([data-spacer]) { height: var(--gh-nav-height, 0px); }
    :host([data-mode="edit"]), :host([data-mode="inline"]) { height: auto; }
    :host([data-mode="edit"][data-spacer]) { padding-bottom: var(--gh-nav-height, 0px); }
    ha-card {
      display: flex; align-items: center; gap: 12px;
      background: var(--gh-surface); border: 1px solid var(--gh-border); border-radius: var(--gh-radius);
      -webkit-backdrop-filter: blur(var(--gh-blur)) saturate(140%);
      backdrop-filter: blur(var(--gh-blur)) saturate(140%);
      padding: 12px var(--gh-pad); color: var(--gh-text); font-family: var(--gh-font);
    }
    .eic {
      width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; flex: 0 0 auto;
      background: color-mix(in srgb, var(--gh-info) 16%, transparent); color: var(--gh-info);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gh-info) 45%, transparent);
    }
    ha-icon { display: inline-flex; --mdc-icon-size: 20px; }
    .et { font-size: 16px; font-weight: 650; }
    .es { font-size: 11px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: var(--gh-text-2); margin-top: 3px; }
  `;

  /* ---------------------------------------------------------------- helpers */

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style') el.style.cssText = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children) for (const c of [].concat(children)) if (c) el.append(c);
    return el;
  }

  function icon(name, cls) {
    const el = document.createElement('ha-icon');
    if (cls) el.className = cls;
    el.setAttribute('icon', name);
    el.icon = name;
    return el;
  }

  const isNum = (v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));
  const stripQuery = (p) => String(p).split(/[?#]/)[0];
  const trimSlash = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
  const segments = (pathname) => String(pathname || '').split('/').filter(Boolean);

  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  /* ---------------------------------------------------------------- config */

  function normalizeRoute(r, where, i) {
    if (!r || typeof r !== 'object') throw new Error(`glasshouse-nav-card: ${where}[${i}] must be an object with a path`);
    if (r.path === undefined || r.path === null || String(r.path).trim() === '') {
      throw new Error(`glasshouse-nav-card: ${where}[${i}] needs a "path" (a view path such as "rooms", or "/dashboard/view")`);
    }
    const path = String(r.path).trim();
    if (!r.icon && !r.label) throw new Error(`glasshouse-nav-card: ${where}[${i}] needs an "icon" or a "label"`);
    if (r.badge !== undefined && (typeof r.badge !== 'string' || !r.badge.includes('.'))) {
      throw new Error(`glasshouse-nav-card: ${where}[${i}].badge must be an entity id`);
    }
    return {
      path,
      label: r.label !== undefined ? String(r.label) : path.replace(/^\/+/, ''),
      icon: r.icon ? String(r.icon) : 'mdi:circle-medium',
      badge: r.badge || null,
      color: r.color ? String(r.color) : null,
    };
  }

  function normalizeConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('glasshouse-nav-card: invalid configuration');
    if (!Array.isArray(config.routes) || !config.routes.length) {
      throw new Error('glasshouse-nav-card: "routes" must be a non-empty list of { path, label, icon }');
    }
    if (config.more !== undefined && !Array.isArray(config.more)) throw new Error('glasshouse-nav-card: "more" must be a list');
    const bp = config.mobile_breakpoint === undefined ? 768 : Number(config.mobile_breakpoint);
    if (!Number.isFinite(bp) || bp < 0) throw new Error('glasshouse-nav-card: "mobile_breakpoint" must be a number of pixels');
    const hide = config.hide_header === undefined ? 'auto' : config.hide_header;
    if (!HEADER_MODES.includes(hide)) throw new Error('glasshouse-nav-card: "hide_header" must be auto, true or false');
    const layout = config.layout === undefined ? 'rail' : config.layout;
    if (!LAYOUTS.includes(layout)) throw new Error('glasshouse-nav-card: "layout" must be rail, top or none');
    return {
      routes: config.routes.map((r, i) => normalizeRoute(r, 'routes', i)),
      more: (config.more || []).map((r, i) => normalizeRoute(r, 'more', i)),
      mobile_breakpoint: bp,
      hide_header: hide,
      layout,
      accent: config.accent ? String(config.accent) : null,
      push: config.push !== false,
      menu_button: config.menu_button !== false,
      more_label: config.more_label ? String(config.more_label) : 'More',
      more_icon: config.more_icon ? String(config.more_icon) : 'mdi:dots-horizontal',
      side_rail: config.side_rail === false ? false : true,
    };
  }

  /* --------------------------------------------------------------- routing */

  function routeUrl(route, pathname) {
    const p = route.path;
    if (p.startsWith('/')) return p;
    const segs = segments(pathname);
    const base = segs.length ? `/${segs[0]}` : '/lovelace';
    return `${base}/${p.replace(/^\/+/, '')}`;
  }

  // Active = the location's last path segment equals the route path (relative routes), or the
  // pathname equals the route (absolute routes). On the dashboard root (no view segment) the first
  // route is active, because Home Assistant shows the first view there.
  function isActive(route, pathname, index) {
    const loc = trimSlash(stripQuery(pathname || '/'));
    const p = stripQuery(route.path);
    if (p.startsWith('/')) return loc === trimSlash(p);
    const segs = segments(loc);
    if (segs.length <= 1) return index === 0;
    return safeDecode(segs[segs.length - 1]) === safeDecode(p.replace(/^\/+|\/+$/g, ''));
  }

  function activeIndex(all, pathname) {
    for (let i = 0; i < all.length; i++) if (isActive(all[i], pathname, i)) return i;
    return -1;
  }

  // Badge: a dot when the entity is "on", a count when its state is a number > 0.
  function badgeValue(st) {
    if (!st || st.state === undefined || st.state === null) return null;
    const s = String(st.state);
    if (s === 'on') return { dot: true };
    if (isNum(s) && Number(s) > 0) {
      const n = Math.round(Number(s));
      return { count: n > 99 ? '99+' : String(Math.max(n, 1)) };
    }
    return null;
  }

  // Mobile: up to 5 buttons; a "More" tab is added when there are overflow routes (or system rows).
  function splitTabs(routes, more, forceMore) {
    const needMore = more.length > 0 || routes.length > MAX_TABS || !!forceMore;
    const n = needMore ? Math.min(routes.length, MAX_TABS - 1) : routes.length;
    return { tabs: routes.slice(0, n), overflow: routes.slice(n).concat(more), hasMore: needMore };
  }

  const HYSTERESIS = 12;
  /** Phone or wide layout. With the previous mode, a width within HYSTERESIS px of the breakpoint keeps it, so a
   *  viewport that wobbles around the breakpoint (foldables, toolbars, scrollbars) never flips the header back and forth. */
  function modeFor(width, cfg, prev) {
    const bp = cfg.mobile_breakpoint;
    if (prev === 'mobile' && width < bp + HYSTERESIS) return 'mobile';
    if (prev && prev !== 'mobile' && width >= bp - HYSTERESIS) return cfg.layout;
    return width < bp ? 'mobile' : cfg.layout;
  }

  function wantsHeaderHidden(cfg, mode) {
    return cfg.hide_header === true || (cfg.hide_header === 'auto' && mode === 'mobile');
  }

  /* ------------------------------------------------------- HA DOM (guarded) */

  // Walk up through light DOM parents and shadow-root hosts.
  function composedAncestors(el) {
    const out = [];
    let n = el;
    let guard = 0;
    while (n && guard++ < 400) {
      if (n.nodeType === 1) out.push(n);
      n = n.parentNode || n.host || null;
    }
    return out;
  }

  function findContext(card) {
    const ctx = { view: null, layout: null, root: null, inFooter: false, inPreview: false };
    try {
      for (const a of composedAncestors(card)) {
        const n = a.localName;
        if (!ctx.view && VIEW_HOSTS.includes(n)) ctx.view = a;
        if (!ctx.layout && LAYOUT_HOSTS.includes(n)) ctx.layout = a;
        if (FOOTER_HOSTS.includes(n)) ctx.inFooter = true;
        if (PREVIEW_HOSTS.includes(n)) ctx.inPreview = true;
        if (!ctx.root && n === 'hui-root') ctx.root = a;
      }
      if (!ctx.view) ctx.view = ctx.layout;
      if (!ctx.root) ctx.root = findHuiRootFromTop();
    } catch (e) { /* the DOM differs from what we expect: run without integration */ }
    return ctx;
  }

  // document → home-assistant → home-assistant-main → … → ha-panel-lovelace → hui-root
  function findHuiRootFromTop() {
    try {
      const ha = document.querySelector('home-assistant');
      const main = ha && ha.shadowRoot && ha.shadowRoot.querySelector('home-assistant-main');
      const panel = main && main.shadowRoot && main.shadowRoot.querySelector('ha-panel-lovelace');
      const root = panel && panel.shadowRoot && panel.shadowRoot.querySelector('hui-root');
      return root && root.shadowRoot ? root : null;
    } catch (e) {
      return null;
    }
  }

  function headerBottom(root) {
    try {
      const header = root && root.shadowRoot && root.shadowRoot.querySelector('.header');
      if (header) {
        const r = header.getBoundingClientRect();
        if (r.height > 0 && r.bottom > 0) return r.bottom;
        return 0;
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  const HEADER_CSS = `
    :host { --header-height: 0px !important; }
    .header { display: none !important; }
  `;

  /* -------------------------------------------------------------- surface */

  class NavSurface {
    constructor(root, handlers) {
      this.root = root;
      this.h = handlers;
      this.key = '';
      this.activeKey = null;
      this.isOpen = false;
      this._onKey = (e) => { if (e.key === 'Escape') this.closeSheet(); };
    }

    render(model) {
      const key = JSON.stringify(model);
      if (key === this.key) return false;
      const wasOpen = this.isOpen;
      this.key = key;
      this.model = model;
      const root = this.root;
      root.innerHTML = '';
      root.append(h('style', { text: SURFACE_STYLE }));

      const wrap = h('div', { class: 'wrap' });
      if (model.accent) wrap.style.setProperty('--gh-accent', model.accent);
      const dock = h('div', { class: `dock ${model.mode}${model.side ? ` side side-${model.side}` : ''}${model.inline ? ' inline' : ''}`, part: 'dock' });
      // ha-scrollbar: hass-swipe-navigation leaves the bar alone when it scrolls sideways
      const bar = h('nav', { class: 'bar ha-scrollbar', 'aria-label': 'Dashboard navigation', part: 'bar' });
      const track = h('div', { class: 'track', role: 'list' });
      this.ind = h('span', { class: 'ind', 'aria-hidden': 'true' });
      track.append(this.ind);
      this.buttons = new Map();

      const addTab = (item) => {
        const b = h('button', { class: 'tab', type: 'button', role: 'listitem', 'data-key': String(item.key), 'aria-label': item.label });
        if (item.color) b.style.setProperty('--a', item.color);
        b.append(h('span', { class: 'ic' }, [icon(item.icon), h('span', { class: 'badge', 'aria-hidden': 'true' })]));
        b.append(h('span', { class: 'lb', text: item.label }));
        b.addEventListener('click', () => this.h.navigate(item.key));
        track.append(b);
        this.buttons.set(String(item.key), b);
      };

      for (const item of model.tabs) addTab(item);
      if (model.mode !== 'mobile' && model.overflow.length) {
        track.append(h('span', { class: 'sep', 'aria-hidden': 'true' }));
        for (const item of model.overflow) addTab(item);
      }
      if (model.mode === 'mobile' && model.hasMore) {
        const b = h('button', {
          class: 'tab more', type: 'button', role: 'listitem', 'data-key': 'more',
          'aria-label': model.moreLabel, 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
        });
        b.append(h('span', { class: 'ic' }, [icon(model.moreIcon), h('span', { class: 'badge', 'aria-hidden': 'true' })]));
        b.append(h('span', { class: 'lb', text: model.moreLabel }));
        b.addEventListener('click', () => (this.isOpen ? this.closeSheet() : this.openSheet()));
        track.append(b);
        this.buttons.set('more', b);
      }
      bar.append(track);
      dock.append(bar);
      wrap.append(dock);

      // More sheet (mobile)
      this.rows = new Map();
      if (model.mode === 'mobile' && model.hasMore && !model.inline) {
        const scrim = h('div', { class: 'scrim', part: 'scrim' });
        scrim.addEventListener('click', () => this.closeSheet());
        const sheet = h('div', { class: 'sheet', tabindex: '-1', role: 'dialog', 'aria-modal': 'true', 'aria-label': model.moreLabel, part: 'sheet' });
        const grab = h('div', { class: 'grab' }, [
          h('span', { class: 'handle', 'aria-hidden': 'true' }),
          h('div', { class: 'sheet-title' }, [h('span', { text: model.moreLabel })]),
        ]);
        this._dragHandlers(grab, sheet);
        const rows = h('div', { class: 'rows' });
        for (const item of model.overflow) {
          const r = h('button', { class: 'row', type: 'button', 'data-key': String(item.key), 'aria-label': item.label });
          if (item.color) r.style.setProperty('--a', item.color);
          r.append(h('span', { class: 'ric' }, [icon(item.icon), h('span', { class: 'badge', 'aria-hidden': 'true' })]));
          r.append(h('span', { class: 'rl', text: item.label }));
          r.append(icon('mdi:chevron-right', 'chev'));
          r.addEventListener('click', () => { this.closeSheet(); this.h.navigate(item.key); });
          rows.append(r);
          this.rows.set(String(item.key), r);
        }
        if (model.system) {
          if (model.overflow.length) rows.append(h('div', { class: 'group-sep', 'aria-hidden': 'true' }));
          const menu = h('button', { class: 'row sys', type: 'button', 'data-key': 'sys-menu', 'aria-label': 'Open the Home Assistant menu' },
            [h('span', { class: 'ric' }, [icon('mdi:menu')]), h('span', { class: 'rl', text: 'Home Assistant menu' })]);
          menu.addEventListener('click', () => { this.closeSheet(); this.h.menu(); });
          const tb = h('button', {
            class: 'row sys', type: 'button', 'data-key': 'sys-toolbar',
            'aria-label': model.toolbarShown ? 'Hide the toolbar' : 'Show the toolbar',
          }, [
            h('span', { class: 'ric' }, [icon(model.toolbarShown ? 'mdi:eye-off-outline' : 'mdi:eye-outline')]),
            h('span', { class: 'rl', text: model.toolbarShown ? 'Hide toolbar' : 'Show toolbar' }),
            h('span', { class: 'state', text: model.toolbarShown ? 'Shown' : 'Hidden' }),
          ]);
          tb.addEventListener('click', () => { this.closeSheet(); this.h.toolbar(); });
          rows.append(menu, tb);
        }
        sheet.append(grab, rows);
        wrap.append(scrim, sheet);
        this.sheet = sheet;
      } else {
        this.sheet = null;
        this.isOpen = false;
      }

      root.append(wrap);
      this.wrap = wrap;
      this.activeKey = null;
      if (wasOpen && this.sheet) this.openSheet(true);
      return true;
    }

    _dragHandlers(grab, sheet) {
      let startY = null, dy = 0, id = null;
      grab.addEventListener('pointerdown', (e) => {
        startY = e.clientY; dy = 0; id = e.pointerId;
        try { grab.setPointerCapture(id); } catch (err) { /* jsdom */ }
        sheet.classList.add('dragging');
      });
      grab.addEventListener('pointermove', (e) => {
        if (startY === null) return;
        dy = Math.max(0, e.clientY - startY);
        sheet.style.transform = `translateY(${dy}px)`;
      });
      const end = () => {
        if (startY === null) return;
        startY = null;
        sheet.classList.remove('dragging');
        sheet.style.transform = '';
        if (dy > DRAG_CLOSE_PX) this.closeSheet();
      };
      grab.addEventListener('pointerup', end);
      grab.addEventListener('pointercancel', end);
    }

    openSheet(silent) {
      if (!this.sheet) return;
      this.isOpen = true;
      this.wrap.classList.add('open');
      const more = this.buttons.get('more');
      if (more) { more.setAttribute('aria-expanded', 'true'); more.classList.add('cur'); }
      document.addEventListener('keydown', this._onKey);
      if (!silent) {
        this.h.haptic();
        const sheet = this.sheet;
        setTimeout(() => { try { sheet.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 60);
      }
      this._place();
    }

    closeSheet() {
      if (!this.isOpen) return;
      this.isOpen = false;
      if (this.wrap) this.wrap.classList.remove('open');
      const more = this.buttons && this.buttons.get('more');
      if (more) more.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', this._onKey);
      this.setActive(this.activeKey, true);
    }

    // key: index (number) of the active route in [routes..., more...] or null
    setActive(key, force) {
      const k = key === null || key === undefined ? null : String(key);
      if (k === this.activeKey && !force) return;
      this.activeKey = k;
      const inTabs = k !== null && this.buttons.has(k);
      const overflowKeys = new Set((this.model.overflow || []).map((o) => String(o.key)));
      const moreActive = !inTabs && k !== null && overflowKeys.has(k) && this.buttons.has('more');
      for (const [bk, b] of this.buttons) {
        const on = bk === k || (bk === 'more' && (moreActive || this.isOpen));
        if (bk === k) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
        b.classList.toggle('cur', on && bk === 'more');
      }
      for (const [rk, r] of this.rows) {
        if (rk === k) r.setAttribute('aria-current', 'page'); else r.removeAttribute('aria-current');
      }
      this._place();
    }

    _target() {
      if (this.isOpen && this.buttons.has('more')) return this.buttons.get('more');
      const k = this.activeKey;
      if (k !== null && this.buttons.has(k)) return this.buttons.get(k);
      const overflowKeys = new Set((this.model.overflow || []).map((o) => String(o.key)));
      if (k !== null && overflowKeys.has(k) && this.buttons.has('more')) return this.buttons.get('more');
      return null;
    }

    // Move the indicator under the active tab.
    _place() {
      if (!this.ind) return;
      const t = this._target();
      if (!t) { this.ind.classList.remove('on'); return; }
      const a = t.style.getPropertyValue('--a');
      if (a) this.ind.style.setProperty('--a', a); else this.ind.style.removeProperty('--a');
      const tr = t.getBoundingClientRect();
      const pr = this.ind.parentNode.getBoundingClientRect();
      const x = tr.left - pr.left, y = tr.top - pr.top;
      this.ind.style.width = `${tr.width}px`;
      this.ind.style.height = `${tr.height}px`;
      this.ind.style.transform = `translate(${x}px, ${y}px)`;
      this.ind.classList.add('on');
      if (!this._readyQueued && !this.wrap.classList.contains('ready')) {
        this._readyQueued = true;
        const raf = window.requestAnimationFrame || ((f) => setTimeout(f, 16));
        raf(() => raf(() => { this._readyQueued = false; if (this.wrap) this.wrap.classList.add('ready'); }));
      }
    }

    place() { this._place(); }

    setBadges(map) {
      // map: key -> badge value or null
      let overflowBadge = false;
      const overflowKeys = new Set((this.model.overflow || []).map((o) => String(o.key)));
      const apply = (el, v) => {
        const b = el && el.querySelector('.badge');
        if (!b) return;
        b.classList.toggle('dot', !!(v && v.dot));
        b.classList.toggle('count', !!(v && v.count));
        b.textContent = v && v.count ? v.count : '';
      };
      for (const [k, v] of Object.entries(map)) {
        apply(this.buttons.get(k), v);
        apply(this.rows.get(k), v);
        if (v && overflowKeys.has(k)) overflowBadge = true;
      }
      if (this.buttons.has('more')) apply(this.buttons.get('more'), overflowBadge ? { dot: true } : null);
    }
  }

  /* ----------------------------------------------------------- controller */

  // One floating navigation per page, owned by the most recently connected card. A short grace
  // period on disconnect lets the next view's card take over without the bar flickering.
  class NavController {
    constructor() {
      this.cards = [];
      if (this._insetProbe) { this._insetProbe.remove(); this._insetProbe = null; }
      this.portal = null;
      this.surface = null;
      this.timer = null;
      this.toolbarOverride = false;
      this.headerStyle = null;
      this.pad = null;
      this.observed = null;
      this.badgeSeen = new Map();
      this.badges = {};
      this._raf = 0;
      this._onResize = () => this.schedule();
      this._onLocation = () => {
        const had = this.toolbarOverride;
        this.toolbarOverride = false;
        if (had) this.refresh(); else this.schedule();
        this.updateActive();
      };
      this._ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.schedule()) : null;
    }

    get owner() { return this.cards[this.cards.length - 1] || null; }

    attach(card) {
      clearTimeout(this.timer);
      this.timer = null;
      this.cards = this.cards.filter((c) => c !== card);
      this.cards.push(card);
      if (!this.portal) this._start();
      this.refresh();
    }

    detach(card) {
      const wasOwner = this.owner === card;
      this.cards = this.cards.filter((c) => c !== card);
      if (this.cards.length) { if (wasOwner) this.refresh(); return; }
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.timer = null; if (!this.cards.length) this._stop(); }, TEARDOWN_MS);
    }

    _start() {
      if (!customElements.get(PORTAL_TAG)) customElements.define(PORTAL_TAG, class extends HTMLElement {});
      this.portal = document.createElement(PORTAL_TAG);
      this.portal.attachShadow({ mode: 'open' });
      document.body.append(this.portal);
      this._insetProbe = document.createElement('div');
      this._insetProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;'
        + 'padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);';
      this._insetProbe.setAttribute('data-glasshouse-nav-probe', '');
      document.body.append(this._insetProbe); // not inside the portal: the surface re-renders its shadow root
      this.surface = new NavSurface(this.portal.shadowRoot, {
        navigate: (key) => this.navigate(key),
        menu: () => this.fire('hass-toggle-menu', {}),
        toolbar: () => { this.toolbarOverride = !this.toolbarOverride; this.refresh(); },
        haptic: () => this.fire('haptic', 'light'),
      });
      window.addEventListener('resize', this._onResize);
      window.addEventListener('location-changed', this._onLocation);
      window.addEventListener('popstate', this._onLocation);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.surface && this.surface.place()).catch(() => {});
    }

    _stop() {
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('location-changed', this._onLocation);
      window.removeEventListener('popstate', this._onLocation);
      if (this.surface) this.surface.closeSheet();
      if (this.portal) this.portal.remove();
      if (this._insetProbe) { this._insetProbe.remove(); this._insetProbe = null; }
      this.portal = null;
      this.surface = null;
      this._setHeader(null, false);
      this._setPad(null, null);
      this._observe(null);
      try { document.documentElement.style.removeProperty('--gh-nav-height'); } catch (e) { /* ignore */ }
      try { document.documentElement.style.removeProperty('--gh-nav-offset-left'); } catch (e) { /* ignore */ }
      this.toolbarOverride = false;
      this.badgeSeen.clear();
      this.badges = {};
    }

    schedule() {
      if (this._raf) return;
      const raf = window.requestAnimationFrame || ((f) => setTimeout(f, 16));
      this._raf = raf(() => { this._raf = 0; this.refresh(); });
    }

    fire(type, detail) {
      const card = this.owner;
      if (!card) return;
      card.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    }

    allRoutes() {
      const c = this.owner && this.owner._config;
      return c ? c.routes.concat(c.more) : [];
    }

    navigate(key) {
      const all = this.allRoutes();
      const route = all[Number(key)];
      if (!route) return;
      this.fire('haptic', 'light');
      const url = routeUrl(route, location.pathname);
      if (isActive(route, location.pathname, Number(key)) || url === location.pathname + location.search) {
        // Re-tapping the current tab scrolls to the top, like a native app.
        try { window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { /* ignore */ }
        return;
      }
      history.pushState(null, '', url);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
    }

    updateActive() {
      if (!this.surface) return;
      const idx = activeIndex(this.allRoutes(), location.pathname);
      this.surface.setActive(idx < 0 ? null : idx);
    }

    refresh() {
      const card = this.owner;
      if (!card || !card._config || !this.surface) return;
      const cfg = card._config;
      const ctx = card._context();
      const width = window.innerWidth || document.documentElement.clientWidth || 1024;
      const mode = modeFor(width, cfg, this._lastCfg === cfg ? this._lastMode : null);
      this._lastCfg = cfg; this._lastMode = mode;
      const editing = card._isEditing(ctx);
      this.lastEditing = editing;
      const wantHidden = wantsHeaderHidden(cfg, mode);
      const hideHeader = wantHidden && !editing && !this.toolbarOverride;
      const system = mode === 'mobile' && cfg.menu_button && wantHidden && !!ctx.root && !editing;

      // 1. header
      this._setHeader(ctx.root, hideHeader);

      // layout: none = phones only; on wide screens show nothing and push nothing
      if (this.portal) this.portal.style.display = mode === 'none' ? 'none' : '';
      if (mode === 'none') {
        document.documentElement.style.setProperty('--gh-nav-height', '0px');
        document.documentElement.style.setProperty('--gh-nav-offset-left', '0px');
        this._setPad(null, null);
        card._setSpacer(false);
        this._observe(ctx.view);
        return;
      }

      // 2. surface
      const all = cfg.routes.concat(cfg.more);
      const keyed = all.map((r, i) => ({ key: i, label: r.label, icon: r.icon, color: r.color }));
      let model;
      let side = null;
      if (mode === 'mobile' && cfg.side_rail && this._insetProbe && this._insetProbe.isConnected) {
        try {
          const cs = getComputedStyle(this._insetProbe);
          let l = parseFloat(cs.paddingLeft) || 0, r = parseFloat(cs.paddingRight) || 0;
          // also measure the real empty strip beside the dashboard (some apps pad the page instead of reporting insets)
          if (ctx.view && ctx.view.isConnected) {
            const vr = ctx.view.getBoundingClientRect();
            if (vr.width > 0) { l = Math.max(l, vr.left); r = Math.max(r, width - vr.right); }
          }
          if (Math.max(l, r) >= SIDE_MIN) {
            side = r >= l ? 'right' : 'left';
            this._sideW = Math.round(Math.max(l, r));
          }
        } catch (e) { /* no safe-area support */ }
      }
      if (mode === 'mobile') {
        const s = splitTabs(keyed.slice(0, cfg.routes.length), keyed.slice(cfg.routes.length), system);
        model = { mode, tabs: s.tabs, overflow: s.overflow, hasMore: s.hasMore, side };
      } else {
        model = { mode, tabs: keyed.slice(0, cfg.routes.length), overflow: keyed.slice(cfg.routes.length), hasMore: false };
      }
      Object.assign(model, {
        accent: cfg.accent, moreLabel: cfg.more_label, moreIcon: cfg.more_icon,
        system, toolbarShown: this.toolbarOverride, inline: false,
      });
      const rebuilt = this.surface.render(model);

      // 3. geometry + content push
      const root = document.documentElement;
      const dock = this.portal.shadowRoot.querySelector('.dock');
      let spacer = false;
      if (dock) { if (side && this._sideW) dock.style.setProperty('--gh-side-w', `${this._sideW}px`); else dock.style.removeProperty('--gh-side-w'); }
      if (mode === 'mobile' && side) {
        // the bar lives in the side safe-area: nothing to push
        root.style.setProperty('--gh-nav-height', '0px');
        root.style.setProperty('--gh-nav-offset-left', '0px');
        this._setPad(null, null);
      } else if (mode === 'mobile') {
        root.style.setProperty('--gh-nav-height', `calc(${BAR_H + BAR_GAP + 10}px + env(safe-area-inset-bottom))`);
        root.style.setProperty('--gh-nav-offset-left', '0px');
        if (cfg.push && ctx.view && !ctx.inFooter) this._setPad(ctx.view, { paddingBottom: 'var(--gh-nav-height)' });
        else { this._setPad(null, null); spacer = cfg.push; }
      } else {
        root.style.setProperty('--gh-nav-height', '0px');
        const hb = hideHeader ? 0 : headerBottom(ctx.root);
        const top = (hb === null ? 56 : hb) + EDGE + 4;
        let left = null, right = null;
        try {
          if (ctx.view && ctx.view.isConnected) {
            const r = ctx.view.getBoundingClientRect();
            if (r.width > 0) { left = r.left; right = Math.max(0, width - r.right); }
          }
        } catch (e) { /* fall back below */ }
        if (dock) {
          dock.style.setProperty('--gh-nav-top', `${top}px`);
          if (mode === 'rail') {
            dock.style.setProperty('--gh-nav-left', left === null ? `calc(var(--mdc-drawer-width, 0px) + ${EDGE}px)` : `${left + EDGE}px`);
          } else {
            dock.style.setProperty('--gh-nav-left', left === null ? 'var(--mdc-drawer-width, 0px)' : `${left}px`);
            dock.style.setProperty('--gh-nav-right', `${right === null ? 0 : right}px`);
          }
        }
        const inset = mode === 'rail' ? RAIL_W + EDGE * 2 : 0;
        root.style.setProperty('--gh-nav-offset-left', `${inset}px`);
        if (cfg.push && ctx.view) {
          this._setPad(ctx.view, mode === 'rail' ? { paddingLeft: `${inset}px` } : { paddingTop: `${TOP_H + EDGE * 2}px` });
        } else this._setPad(null, null);
      }
      card._setSpacer(spacer);
      this._observe(ctx.view);

      // 4. state
      if (rebuilt) { this.badgeSeen.clear(); }
      this.updateActive();
      this.surface.place();
      if (card._hass) this.setHass(card, card._hass, rebuilt);
    }

    setHass(card, hass, force) {
      if (card !== this.owner || !this.surface || !hass) return;
      // Edit mode can toggle without the card being re-created: re-evaluate cheaply.
      const editing = card._isEditing(card._context());
      if (editing !== this.lastEditing) { this.lastEditing = editing; card._update(); return; }
      const all = this.allRoutes();
      let changed = !!force;
      all.forEach((r, i) => {
        if (!r.badge) return;
        const st = hass.states && hass.states[r.badge];
        if (this.badgeSeen.get(r.badge) !== st) { changed = true; this.badgeSeen.set(r.badge, st); }
      });
      if (!changed) return;
      const map = {};
      all.forEach((r, i) => { map[String(i)] = r.badge ? badgeValue(hass.states && hass.states[r.badge]) : null; });
      this.badges = map;
      this.surface.setBadges(map);
    }

    _setHeader(root, hide) {
      try {
        if (this.headerStyle && (!hide || this.headerStyle.getRootNode() !== (root && root.shadowRoot))) {
          this.headerStyle.remove();
          this.headerStyle = null;
        }
        if (!hide || !root || !root.shadowRoot) return;
        if (!this.headerStyle) {
          const old = root.shadowRoot.getElementById(HEADER_STYLE_ID);
          if (old) old.remove();
          const st = document.createElement('style');
          st.id = HEADER_STYLE_ID;
          st.textContent = HEADER_CSS;
          root.shadowRoot.append(st);
          this.headerStyle = st;
        }
      } catch (e) { /* never break Home Assistant */ }
    }

    // Inline padding on the view host; the previous inline values are restored afterwards.
    _setPad(el, props) {
      try {
        const cur = this.pad;
        if (cur && (cur.el !== el || JSON.stringify(cur.props) !== JSON.stringify(props))) {
          for (const [k, v] of Object.entries(cur.orig)) cur.el.style[k] = v;
          this.pad = null;
        }
        if (!el || !props || this.pad) return;
        const orig = {};
        for (const k of Object.keys(props)) orig[k] = el.style[k];
        for (const [k, v] of Object.entries(props)) el.style[k] = v;
        this.pad = { el, props, orig };
      } catch (e) { /* ignore */ }
    }

    _observe(el) {
      if (!this._ro || this.observed === el) return;
      if (this.observed) this._ro.unobserve(this.observed);
      this.observed = el;
      if (el) this._ro.observe(el);
    }
  }

  function reducedMotion() {
    try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  const controller = new NavController();

  /* ------------------------------------------------------------------ card */

  class GlasshouseNavCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._preview = false;
      this._editMode = false;
      this._mode = null;
      this._inlineSurface = null;
    }

    static getStubConfig() {
      return {
        routes: [
          { path: '0', label: 'Home', icon: 'mdi:home-variant' },
          { path: '1', label: 'Rooms', icon: 'mdi:floor-plan' },
          { path: '2', label: 'Climate', icon: 'mdi:thermostat' },
        ],
      };
    }

    setConfig(config) {
      this._config = normalizeConfig(config);
      this._rawConfig = config;
      this._update();
    }

    set hass(hass) {
      this._hass = hass;
      if (this._mode === 'inline' && this._inlineSurface) this._inlineBadges();
      else controller.setHass(this, hass);
    }
    get hass() { return this._hass; }

    // Set by Home Assistant on cards in edit mode / previews.
    set preview(v) { const b = !!v; if (b !== this._preview) { this._preview = b; this._update(); } }
    get preview() { return this._preview; }
    set editMode(v) { const b = !!v; if (b !== this._editMode) { this._editMode = b; this._update(); } }
    get editMode() { return this._editMode; }

    getCardSize() { return 0; }
    getGridOptions() { return { columns: 'full', rows: 'auto' }; }

    connectedCallback() { this._connected = true; this._ctx = null; this._update(); }
    disconnectedCallback() {
      this._connected = false;
      this._ctx = null;
      controller.detach(this);
    }

    _context() {
      if (!this._ctx || (this._ctx.view && !this._ctx.view.isConnected) || (this._ctx.root && !this._ctx.root.isConnected)) {
        this._ctx = findContext(this);
      }
      return this._ctx;
    }

    _isEditing(ctx) {
      if (this._editMode) return true;
      if (this._preview && ctx && ctx.view) return true;
      try {
        if (ctx && ctx.root && ctx.root.lovelace && ctx.root.lovelace.editMode) return true;
      } catch (e) { /* ignore */ }
      return /[?&]edit=1\b/.test(location.search || '');
    }

    _setSpacer(on) { this.toggleAttribute('data-spacer', !!on); }

    _update() {
      if (!this._config || !this._connected) return;
      const ctx = this._context();
      const inline = ctx.inPreview || (this._preview && !ctx.view);
      if (inline) {
        controller.detach(this);
        this._setSpacer(false);
        this._renderInline();
        return;
      }
      const editing = this._isEditing(ctx);
      const mode = editing ? 'edit' : 'live';
      if (mode !== this._mode || this._renderedFor !== this._config) {
        this._mode = mode;
        this._renderedFor = this._config;
        this._inlineSurface = null;
        this.setAttribute('data-mode', mode);
        this.shadowRoot.innerHTML = '';
        this.shadowRoot.append(h('style', { text: CARD_STYLE }));
        if (editing) {
          const n = this._config.routes.length + this._config.more.length;
          this.shadowRoot.append(h('ha-card', null, [
            h('span', { class: 'eic' }, [icon('mdi:dock-bottom')]),
            h('div', null, [
              h('div', { class: 'et', text: 'Glasshouse Nav' }),
              h('div', { class: 'es', text: `Floating navigation · ${n} ${n === 1 ? 'route' : 'routes'}` }),
            ]),
          ]));
        }
      }
      controller.attach(this);
    }

    _renderInline() {
      if (this._mode !== 'inline') {
        this._mode = 'inline';
        this.setAttribute('data-mode', 'inline');
        this.shadowRoot.innerHTML = '';
        this.shadowRoot.append(h('style', { text: CARD_STYLE }));
        const holder = h('div');
        holder.attachShadow({ mode: 'open' });
        this.shadowRoot.append(holder);
        this._inlineSurface = new NavSurface(holder.shadowRoot, { navigate: (k) => this._inlineSurface.setActive(k), menu() {}, toolbar() {}, haptic() {} });
      }
      const cfg = this._config;
      const keyed = cfg.routes.concat(cfg.more).map((r, i) => ({ key: i, label: r.label, icon: r.icon, color: r.color }));
      const s = splitTabs(keyed.slice(0, cfg.routes.length), keyed.slice(cfg.routes.length), false);
      this._inlineSurface.render({
        mode: 'mobile', tabs: s.tabs, overflow: s.overflow, hasMore: s.hasMore, accent: cfg.accent,
        moreLabel: cfg.more_label, moreIcon: cfg.more_icon, system: false, toolbarShown: false, inline: true,
      });
      const idx = activeIndex(cfg.routes.concat(cfg.more), location.pathname);
      this._inlineSurface.setActive(idx < 0 ? 0 : idx, true);
      this._inlineBadges();
    }

    _inlineBadges() {
      const hass = this._hass;
      if (!hass || !this._inlineSurface) return;
      const map = {};
      this._config.routes.concat(this._config.more).forEach((r, i) => {
        map[String(i)] = r.badge ? badgeValue(hass.states && hass.states[r.badge]) : null;
      });
      this._inlineSurface.setBadges(map);
    }
  }

  // Exposed for the test suite only.
  GlasshouseNavCard._internals = {
    normalizeConfig, routeUrl, isActive, activeIndex, badgeValue, splitTabs, modeFor, wantsHeaderHidden,
    controller, HEADER_STYLE_ID, PORTAL_TAG,
  };

  if (!customElements.get(TAG)) {
    customElements.define(TAG, GlasshouseNavCard);
    window.customCards = window.customCards || [];
    window.customCards.push({
      type: TAG,
      name: 'Glasshouse Nav Card',
      description: 'App-like navigation between dashboard views: a floating tab bar on phones, a rail on desktop.',
      preview: true,
      documentationURL: 'https://github.com/petergCA/glasshouse-nav-card',
    });
    console.info(
      `%c GLASSHOUSE-NAV-CARD %c v${VERSION} `,
      'color:#0a0f18;background:#58a6ff;font-weight:700;border-radius:4px 0 0 4px;padding:2px 4px',
      'color:#e9eef6;background:#1b2333;font-weight:600;border-radius:0 4px 4px 0;padding:2px 4px',
    );
  }
})();
