/* Tests for glasshouse-nav-card, run with node + jsdom (not a repo dependency):
 *   mkdir /tmp/ghtest && cd /tmp/ghtest && npm i jsdom
 *   node /path/to/repo/test/nav.test.cjs
 * Builds a fake Home Assistant tree:
 *   home-assistant ⟶ home-assistant-main ⟶ ha-panel-lovelace ⟶ hui-root (.header, hui-view ⟶ hui-sections-view ⟶ hui-view-footer)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(require.resolve('jsdom', { paths: [process.cwd(), __dirname] }));

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log('  ✓', msg); }
  else { failed += 1; console.log('  ✗', msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)})`); }
function throws(fn, re, msg) {
  try { fn(); ok(false, `${msg} (did not throw)`); } catch (e) { ok(re.test(e.message), `${msg} (${e.message})`); }
}

const CONFIG = {
  routes: [
    { path: 'home', label: 'Now', icon: 'mdi:home-variant', badge: 'binary_sensor.alerting' },
    { path: 'rooms', label: 'Rooms', icon: 'mdi:floor-plan' },
    { path: 'climate', label: 'Climate', icon: 'mdi:thermostat' },
    { path: 'security', label: 'Security', icon: 'mdi:shield-home', badge: 'sensor.open_doors' },
  ],
  more: [
    { path: 'energy', label: 'Energy', icon: 'mdi:lightning-bolt', badge: 'binary_sensor.peak' },
    { path: 'media', label: 'Media', icon: 'mdi:television-play' },
  ],
};

function st(id, state) { return { entity_id: id, state, attributes: {} }; }

function setup(opts = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', {
    url: `https://ha.example/glass/${opts.view || 'home'}`, runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  Object.defineProperty(w, 'innerWidth', { value: opts.width || 390, writable: true, configurable: true });
  w.console.info = () => {};
  w.scrollTo = () => {};
  w.eval(`
    customElements.define('ha-card', class extends HTMLElement {});
    customElements.define('ha-icon', class extends HTMLElement {});
    function shell(tag, html) {
      customElements.define(tag, class extends HTMLElement {
        constructor() { super(); this.attachShadow({ mode: 'open' }).innerHTML = html; }
      });
    }
    shell('home-assistant', '<home-assistant-main></home-assistant-main>');
    shell('home-assistant-main', '<partial-panel-resolver><ha-panel-lovelace></ha-panel-lovelace></partial-panel-resolver>');
    shell('ha-panel-lovelace', '<hui-root></hui-root>');
    shell('hui-root', '<div class="header"><div class="toolbar">toolbar</div></div><div id="view"><hui-view><hui-sections-view></hui-sections-view></hui-view></div>');
    shell('hui-sections-view', '<div class="sections"></div><hui-view-footer></hui-view-footer>');
    customElements.define('hui-view', class extends HTMLElement {});
    customElements.define('hui-view-footer', class extends HTMLElement {});
  `);
  w.eval(read('glasshouse-nav-card.js'));
  const ha = w.document.createElement('home-assistant');
  w.document.body.append(ha);
  const main = ha.shadowRoot.querySelector('home-assistant-main');
  const huiRoot = main.shadowRoot.querySelector('ha-panel-lovelace').shadowRoot.querySelector('hui-root');
  huiRoot.lovelace = { editMode: !!opts.edit };
  const view = huiRoot.shadowRoot.querySelector('hui-view');
  const sections = huiRoot.shadowRoot.querySelector('hui-sections-view').shadowRoot;
  const card = w.document.createElement('glasshouse-nav-card');
  card.setConfig({ ...CONFIG, ...(opts.config || {}) });
  card.hass = { states: {
    'binary_sensor.alerting': st('binary_sensor.alerting', 'off'),
    'sensor.open_doors': st('sensor.open_doors', '0'),
    'binary_sensor.peak': st('binary_sensor.peak', 'off'),
  } };
  (opts.inSection ? sections.querySelector('.sections') : sections.querySelector('hui-view-footer')).append(card);
  const portal = () => w.document.querySelector('glasshouse-nav-portal');
  const $ = (sel) => portal() && portal().shadowRoot.querySelector(sel);
  const $$ = (sel) => (portal() ? [...portal().shadowRoot.querySelectorAll(sel)] : []);
  const headerStyle = () => huiRoot.shadowRoot.getElementById('glasshouse-nav-hide-header');
  const resize = (width) => { w.innerWidth = width; w.dispatchEvent(new w.Event('resize')); return sleep(40); };
  const events = [];
  w.addEventListener('location-changed', (e) => events.push(['location-changed', e.detail, w.location.pathname]));
  w.document.addEventListener('hass-toggle-menu', () => events.push(['menu']));
  w.document.addEventListener('haptic', (e) => events.push(['haptic', e.detail]));
  return { w, card, huiRoot, view, portal, $, $$, headerStyle, resize, events, I: w.customElements.get('glasshouse-nav-card')._internals };
}

(async () => {
  console.log('pure helpers');
  {
    const { I } = setup();
    const r = (p) => ({ path: p });
    eq(I.routeUrl(r('rooms'), '/glass/home'), '/glass/rooms', 'relative route keeps the dashboard');
    eq(I.routeUrl(r('rooms'), '/glass'), '/glass/rooms', 'relative route from the dashboard root');
    eq(I.routeUrl(r('/other-dash/main'), '/glass/home'), '/other-dash/main', 'absolute route used as is');
    ok(I.isActive(r('rooms'), '/glass/rooms', 1), 'last segment matches');
    ok(I.isActive(r('rooms'), '/glass/rooms/', 1), 'trailing slash ignored');
    ok(!I.isActive(r('rooms'), '/glass/home', 1), 'other view does not match');
    ok(I.isActive(r('home'), '/glass', 0), 'dashboard root activates the first route');
    ok(!I.isActive(r('rooms'), '/glass', 1), 'dashboard root does not activate later routes');
    ok(I.isActive(r('/other-dash/main'), '/other-dash/main', 3), 'absolute route matches the pathname');
    ok(I.isActive(r('living room'), '/glass/living%20room', 1), 'encoded segments are decoded');
    eq(I.activeIndex([r('home'), r('rooms'), r('energy')], '/glass/energy'), 2, 'activeIndex finds overflow routes');
    eq(I.activeIndex([r('home'), r('rooms')], '/glass/nope'), -1, 'activeIndex -1 when nothing matches');
    eq(I.badgeValue(st('b.x', 'on')), { dot: true }, 'badge: on → dot');
    eq(I.badgeValue(st('b.x', 'off')), null, 'badge: off → none');
    eq(I.badgeValue(st('s.x', '3')), { count: '3' }, 'badge: numeric → count');
    eq(I.badgeValue(st('s.x', '0')), null, 'badge: 0 → none');
    eq(I.badgeValue(st('s.x', '250')), { count: '99+' }, 'badge: capped at 99+');
    eq(I.badgeValue(st('s.x', 'unavailable')), null, 'badge: unavailable → none');
    eq(I.badgeValue(undefined), null, 'badge: missing entity → none');
    const five = [1, 2, 3, 4, 5], six = [1, 2, 3, 4, 5, 6];
    eq(I.splitTabs(five, [], false), { tabs: five, overflow: [], hasMore: false }, '5 routes fit without More');
    eq(I.splitTabs(six, [], false), { tabs: [1, 2, 3, 4], overflow: [5, 6], hasMore: true }, '6 routes: 4 tabs + More');
    eq(I.splitTabs([1, 2], ['m'], false), { tabs: [1, 2], overflow: ['m'], hasMore: true }, 'more list adds the More tab');
    eq(I.modeFor(390, { mobile_breakpoint: 768, layout: 'rail' }), 'mobile', 'mode: phone');
    eq(I.modeFor(1300, { mobile_breakpoint: 768, layout: 'top' }), 'top', 'mode: desktop top');
    eq(I.modeFor(762, { mobile_breakpoint: 768, layout: 'none' }, 'none'), 'none', 'mode: wide stays wide just under the breakpoint');
    eq(I.modeFor(774, { mobile_breakpoint: 768, layout: 'none' }, 'mobile'), 'mobile', 'mode: phone stays phone just over it');
    eq(I.modeFor(740, { mobile_breakpoint: 768, layout: 'none' }, 'none'), 'mobile', 'mode: a real change still switches');
  }

  console.log('config validation');
  {
    const { card } = setup();
    throws(() => card.setConfig({}), /routes/, 'routes required');
    throws(() => card.setConfig({ routes: [{ label: 'x', icon: 'mdi:x' }] }), /path/, 'path required');
    throws(() => card.setConfig({ routes: [{ path: 'a' }] }), /icon/, 'icon or label required');
    throws(() => card.setConfig({ routes: [{ path: 'a', icon: 'mdi:a', badge: 'nope' }] }), /entity id/, 'badge must be an entity id');
    throws(() => card.setConfig({ routes: [{ path: 'a', icon: 'mdi:a' }], hide_header: 'sometimes' }), /hide_header/, 'hide_header validated');
    throws(() => card.setConfig({ routes: [{ path: 'a', icon: 'mdi:a' }], layout: 'bottom' }), /layout/, 'layout validated');
    eq(card.getGridOptions(), { columns: 'full', rows: 'auto' }, 'getGridOptions');
  }

  console.log('mobile: bar, header, spacer, navigation');
  {
    const { w, card, $, $$, headerStyle, view, events } = setup();
    ok(!!$('.dock.mobile'), 'portal renders the mobile dock');
    eq($$('.tab').map((b) => b.dataset.key), ['0', '1', '2', '3', 'more'], '4 tabs + More');
    eq($('.tab[aria-current="page"]').dataset.key, '0', 'current view is active');
    ok(!!headerStyle(), 'header hidden on mobile (style injected into hui-root)');
    ok(/\.header\s*\{\s*display: none/.test(headerStyle().textContent), 'style hides .header');
    ok(card.hasAttribute('data-spacer'), 'footer card becomes the spacer');
    ok(/env\(safe-area-inset-bottom\)/.test(w.document.documentElement.style.getPropertyValue('--gh-nav-height')), '--gh-nav-height set with safe area');
    eq(view.style.paddingBottom, '', 'view not padded when the card is the spacer');

    $('.tab[data-key="1"]').click();
    eq(w.location.pathname, '/glass/rooms', 'tap pushes the view URL');
    const nav = events.find((e) => e[0] === 'location-changed');
    eq(nav && nav[1], { replace: false }, 'location-changed fired with {replace:false}');
    eq(nav && nav[2], '/glass/rooms', 'pathname already updated when the event fires');
    ok(events.some((e) => e[0] === 'haptic' && e[1] === 'light'), 'haptic on tab tap');
    eq($('.tab[aria-current="page"]').dataset.key, '1', 'active tab follows location-changed');

    const navCount = () => events.filter((e) => e[0] === 'location-changed').length;
    const n = navCount();
    $('.tab[data-key="1"]').click();
    eq(navCount(), n, 're-tapping the active tab does not navigate (scrolls to top instead)');

    w.history.pushState(null, '', '/glass/energy');
    w.dispatchEvent(new w.PopStateEvent('popstate'));
    ok(!$('.tab[aria-current="page"]'), 'overflow route: no direct tab current');
    ok($('.tab[data-key="more"]').classList.contains('cur'), 'overflow route highlights More');

    // sheet
    $('.tab[data-key="more"]').click();
    ok($('.wrap').classList.contains('open'), 'More opens the sheet');
    eq($('.tab[data-key="more"]').getAttribute('aria-expanded'), 'true', 'aria-expanded true');
    eq($$('.row:not(.sys)').map((r) => r.dataset.key), ['4', '5'], 'sheet lists the more routes');
    eq($('.row[aria-current="page"]').dataset.key, '4', 'current overflow route marked in the sheet');
    $('.scrim').click();
    ok(!$('.wrap').classList.contains('open'), 'tap outside closes the sheet');
    $('.tab[data-key="more"]').click();
    $('.row[data-key="5"]').click();
    eq(w.location.pathname, '/glass/media', 'sheet row navigates');
    ok(!$('.wrap').classList.contains('open'), 'sheet closes after navigating');
    $('.tab[data-key="more"]').click();
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    ok(!$('.wrap').classList.contains('open'), 'Escape closes the sheet');

    $('.tab[data-key="more"]').click();
    $('.row[data-key="sys-menu"]').click();
    ok(events.some((e) => e[0] === 'menu'), 'menu row fires hass-toggle-menu (composed, from the card)');
    $('.tab[data-key="more"]').click();
    $('.row[data-key="sys-toolbar"]').click();
    ok(!headerStyle(), '"Show toolbar" restores the header');
    w.history.pushState(null, '', '/glass/home');
    w.dispatchEvent(new w.CustomEvent('location-changed', { detail: { replace: false } }));
    ok(!!headerStyle(), 'header hidden again after navigating');
  }

  console.log('badges');
  {
    const { card, $ } = setup();
    const badge = (k) => $(`.tab[data-key="${k}"] .badge`);
    ok(!badge('0').classList.contains('dot'), 'no badge while off');
    card.hass = { states: {
      'binary_sensor.alerting': st('binary_sensor.alerting', 'on'),
      'sensor.open_doors': st('sensor.open_doors', '3'),
      'binary_sensor.peak': st('binary_sensor.peak', 'off'),
    } };
    ok(badge('0').classList.contains('dot'), 'dot when on');
    ok(badge('3').classList.contains('count') && badge('3').textContent === '3', 'count when numeric');
    ok(!badge('more').classList.contains('dot'), 'More has no dot while overflow badges are clear');
    card.hass = { states: { ...card.hass.states, 'binary_sensor.peak': st('binary_sensor.peak', 'on') } };
    ok(badge('more').classList.contains('dot'), 'More shows a dot when an overflow route has a badge');
    ok($('.row[data-key="4"] .badge').classList.contains('dot'), 'sheet row shows its badge');
    const same = card.hass;
    const el = badge('0');
    card.hass = { states: same.states };
    ok(badge('0') === el, 'unchanged states do not rebuild the bar');
  }

  console.log('desktop: rail, header restore, push');
  {
    const { w, card, $, $$, headerStyle, view, resize } = setup({ width: 390 });
    ok(!!headerStyle(), 'header hidden on phone');
    await resize(1300);
    ok(!headerStyle(), 'header restored when crossing the breakpoint');
    ok(!!$('.dock.rail'), 'rail on desktop');
    eq($$('.tab').map((b) => b.dataset.key), ['0', '1', '2', '3', '4', '5'], 'rail lists every route (no More)');
    ok(!!$('.sep'), 'separator before the more routes');
    eq(view.style.paddingLeft, '100px', 'view padded left for the rail');
    ok(!card.hasAttribute('data-spacer'), 'no spacer on desktop');
    eq(w.document.documentElement.style.getPropertyValue('--gh-nav-height'), '0px', '--gh-nav-height 0 on desktop');
    await resize(500);
    eq(view.style.paddingLeft, '', 'rail padding removed on phone');
    ok(!!headerStyle(), 'header hidden again on phone');
  }
  {
    const { $, view, headerStyle } = setup({ width: 1300, config: { layout: 'top', hide_header: true } });
    ok(!!$('.dock.top'), 'layout: top renders the top bar');
    eq(view.style.paddingTop, '72px', 'view padded for the top bar');
    ok(!!headerStyle(), 'hide_header: true hides on desktop too');
  }
  {
    const { headerStyle, card, view } = setup({ config: { hide_header: false }, inSection: true });
    ok(!headerStyle(), 'hide_header: false never hides');
    ok(!card.hasAttribute('data-spacer'), 'card in a section: no spacer');
    eq(view.style.paddingBottom, 'var(--gh-nav-height)', 'card in a section: view padded instead');
  }

  console.log('edit mode and teardown');
  {
    const { headerStyle, card, $ } = setup({ edit: true });
    ok(!headerStyle(), 'header kept in edit mode');
    ok(!!card.shadowRoot.querySelector('ha-card'), 'edit mode shows a placeholder card');
    ok(!!$('.dock'), 'bar still shown in edit mode');
    ok(!$('.row[data-key="sys-menu"]'), 'no system rows while editing');
  }
  {
    const { w, card, portal, headerStyle, view, resize } = setup({ width: 1300 });
    eq(view.style.paddingLeft, '100px', 'padded before teardown');
    card.remove();
    ok(!!portal(), 'portal kept during the grace period');
    await sleep(500);
    ok(!portal(), 'portal removed after disconnect');
    eq(view.style.paddingLeft, '', 'view padding restored');
    eq(w.document.documentElement.style.getPropertyValue('--gh-nav-height'), '', '--gh-nav-height removed');
    await resize(390);
    ok(!headerStyle(), 'no header hiding after teardown');
  }
  {
    const s = setup();
    const card2 = s.w.document.createElement('glasshouse-nav-card');
    card2.setConfig(CONFIG);
    const footer = s.card.parentNode;
    s.card.remove();
    footer.append(card2); // next view's card takes over
    await sleep(500);
    ok(!!s.portal(), 'a new card adopts the portal (no flicker across views)');
    ok(!!s.headerStyle(), 'header stays hidden across the hand-over');
    eq(s.w.document.querySelectorAll('glasshouse-nav-portal').length, 1, 'only one portal');
  }
  {
    // DOM without Home Assistant: must still work, never throw
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.example/d/a', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    Object.defineProperty(w, 'innerWidth', { value: 1300, writable: true, configurable: true });
    w.console.info = () => {};
    w.eval(read('glasshouse-nav-card.js'));
    const c = w.document.createElement('glasshouse-nav-card');
    c.setConfig(CONFIG);
    let err = null;
    try { w.document.body.append(c); } catch (e) { err = e; }
    ok(!err, 'works without the Home Assistant DOM');
    const dock = w.document.querySelector('glasshouse-nav-portal').shadowRoot.querySelector('.dock.rail');
    ok(/mdc-drawer-width/.test(dock.style.getPropertyValue('--gh-nav-left')), 'rail falls back to --mdc-drawer-width');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
