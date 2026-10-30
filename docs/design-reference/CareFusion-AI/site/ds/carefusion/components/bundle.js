/* @ds-bundle: {"format":4,"namespace":"CareFusion","components":[{"name":"Button"},{"name":"TextField"},{"name":"Switch"},{"name":"Card"},{"name":"Modal"},{"name":"Badge"},{"name":"Alert"},{"name":"Skeleton"},{"name":"Sidebar"},{"name":"BottomNav"},{"name":"Tabs"},{"name":"Stepper"},{"name":"Table"},{"name":"PageHeader"},{"name":"StatCard"},{"name":"AIInsight"},{"name":"Select"},{"name":"Textarea"},{"name":"Checkbox"},{"name":"EmptyState"},{"name":"Avatar"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;
  var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef, useId = React.useId;

  function cx() {
    return Array.prototype.filter.call(arguments, Boolean).join(' ');
  }
  function omit(obj, keys) {
    var out = {};
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k) && keys.indexOf(k) < 0) out[k] = obj[k];
    return out;
  }

  /* Small built-in glyphs (24px grid, 2px stroke) for states the system draws itself. */
  var GLYPHS = {
    info: 'M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z',
    success: 'M8 12.5l2.5 2.5L16 9.5M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z',
    warning: 'M12 9v4M12 17h.01M10.3 4.2L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z',
    danger: 'M12 8v5M12 16.5h.01M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z',
    close: 'M6 6l12 12M18 6L6 18',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    eye: 'M2 12s3.5-7 10-7s10 7 10 7s-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
    eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
    ai: 'M10.5 3h3a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 19.5v-15A1.5 1.5 0 0 1 10.5 3zM4.5 9h15A1.5 1.5 0 0 1 21 10.5v3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 13.5v-3A1.5 1.5 0 0 1 4.5 9z',
    up: 'M7 14l5-5l5 5',
    down: 'M7 10l5 5l5-5',
    inbox: 'M4 13l2.5-7h11L20 13M4 13v6h16v-6M4 13h4.5l1 2h5l1-2H20',
    shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9c-4.6-.7-8-4.5-8-9V6zM9 12l2 2l4-4',
    question: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z'
  };
  function Glyph(props) {
    return h('svg', {
      className: cx('cf-glyph', props.className), width: props.size || 20, height: props.size || 20,
      viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
      strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false'
    }, h('path', { d: GLYPHS[props.name] }));
  }

  /* ---------- Actions ---------- */
  function Button(props) {
    var variant = props.variant || 'primary', size = props.size || 'md';
    var rest = omit(props, ['variant', 'size', 'loading', 'icon', 'fullWidth', 'className', 'children']);
    return h('button', Object.assign({ type: 'button' }, rest, {
      className: cx('cf-btn', 'cf-btn-' + variant, 'cf-btn-' + size, props.fullWidth && 'cf-btn-full', props.loading && 'is-loading', props.className),
      disabled: props.disabled || props.loading,
      'aria-busy': props.loading ? 'true' : undefined
    }),
      props.loading ? h('span', { className: 'cf-spinner', 'aria-hidden': 'true' }) : props.icon ? h('span', { className: 'cf-btn-icon', 'aria-hidden': 'true' }, props.icon) : null,
      h('span', { className: 'cf-btn-label' }, props.children)
    );
  }

  /* ---------- Forms ---------- */
  function TextField(props) {
    var autoId = useId();
    var id = props.id || 'cf-field-' + autoId.replace(/:/g, '');
    var isPassword = props.type === 'password';
    var shown = useState(false);
    var msgId = id + '-msg';
    var message = props.error || props.helper;
    var rest = omit(props, ['label', 'helper', 'error', 'prefix', 'className', 'type', 'id', 'optional']);
    return h('div', { className: cx('cf-field', props.error && 'has-error', props.disabled && 'is-disabled', props.className) },
      h('label', { className: 'cf-field-label', htmlFor: id }, props.label,
        props.required ? h('span', { className: 'cf-req', 'aria-hidden': 'true' }, ' *') : props.optional ? h('span', { className: 'cf-opt' }, ' (optional)') : null),
      h('div', { className: 'cf-field-box' },
        props.prefix ? h('span', { className: 'cf-field-prefix', 'aria-hidden': typeof props.prefix === 'string' ? undefined : 'true' }, props.prefix) : null,
        h('input', Object.assign({}, rest, {
          id: id, className: 'cf-field-input',
          type: isPassword && shown[0] ? 'text' : (props.type || 'text'),
          'aria-invalid': props.error ? 'true' : undefined,
          'aria-required': props.required ? 'true' : undefined,
          'aria-describedby': message ? msgId : undefined
        })),
        isPassword ? h('button', {
          type: 'button', className: 'cf-field-reveal',
          'aria-label': shown[0] ? 'Hide password' : 'Show password', 'aria-pressed': shown[0] ? 'true' : 'false',
          onClick: function () { shown[1](!shown[0]); }
        }, h(Glyph, { name: shown[0] ? 'eyeOff' : 'eye' })) : null
      ),
      message ? h('p', { id: msgId, className: cx('cf-field-msg', props.error && 'is-error') },
        props.error ? h(Glyph, { name: 'danger', size: 16 }) : null, h('span', null, message)) : null
    );
  }

  function Switch(props) {
    var inner = useState(!!props.defaultChecked);
    var controlled = props.checked !== undefined;
    var on = controlled ? props.checked : inner[0];
    var autoId = useId();
    var labelId = 'cf-sw-' + autoId.replace(/:/g, '');
    function toggle() {
      if (props.disabled) return;
      if (!controlled) inner[1](!on);
      if (props.onChange) props.onChange(!on);
    }
    return h('div', { className: cx('cf-switch-row', props.className) },
      h('span', { className: 'cf-switch-text' },
        h('span', { id: labelId, className: 'cf-switch-label' }, props.label),
        props.description ? h('span', { className: 'cf-switch-desc' }, props.description) : null),
      h('button', {
        type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-labelledby': labelId,
        disabled: props.disabled, className: cx('cf-switch', on && 'is-on'), onClick: toggle
      }, h('span', { className: 'cf-switch-thumb', 'aria-hidden': 'true' }))
    );
  }

  /* ---------- Layout ---------- */
  function Card(props) {
    var Tag = props.as || (props.onClick ? 'button' : 'div');
    var rest = omit(props, ['as', 'titleAs', 'title', 'eyebrow', 'actions', 'padding', 'tone', 'interactive', 'className', 'children']);
    return h(Tag, Object.assign({}, rest, {
      type: Tag === 'button' ? 'button' : undefined,
      className: cx('cf-card', 'cf-card-' + (props.padding || 'default'), props.tone && 'cf-card-' + props.tone, (props.interactive || props.onClick) && 'is-interactive', props.className)
    }),
      (props.title || props.actions || props.eyebrow) ? h('div', { className: 'cf-card-head' },
        h('div', null,
          props.eyebrow ? h(Tag === 'button' ? 'span' : 'p', { className: 'cf-card-eyebrow' }, props.eyebrow) : null,
          props.title ? h(Tag === 'button' ? 'span' : (props.titleAs || 'h3'), { className: 'cf-card-title' }, props.title) : null),
        props.actions ? h('div', { className: 'cf-card-actions' }, props.actions) : null) : null,
      props.children
    );
  }

  function Modal(props) {
    var panel = useRef(null);
    var autoId = useId();
    var titleId = 'cf-modal-' + autoId.replace(/:/g, '');
    useEffect(function () {
      if (!props.open) return;
      var prev = document.activeElement;
      var node = panel.current;
      var sel = 'button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
      if (node) node.focus();
      function onKey(e) {
        if (e.key === 'Escape' && props.onClose) { e.preventDefault(); props.onClose(); }
        if (e.key === 'Tab' && node) {
          var items = node.querySelectorAll(sel);
          if (!items.length) return;
          var a = items[0], z = items[items.length - 1];
          if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
          else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
        }
      }
      document.addEventListener('keydown', onKey);
      return function () {
        document.removeEventListener('keydown', onKey);
        if (prev && prev.focus) prev.focus();
      };
    }, [props.open]);
    if (!props.open) return null;
    return h('div', { className: cx('cf-modal-scrim', props.glass && 'is-glass', props.inline && 'is-inline'), onMouseDown: function (e) { if (e.target === e.currentTarget && props.onClose) props.onClose(); } },
      h('div', { ref: panel, tabIndex: -1, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, className: cx('cf-modal', 'cf-modal-' + (props.size || 'md'), props.className) },
        h('div', { className: 'cf-modal-head' },
          h('h2', { id: titleId, className: 'cf-modal-title' }, props.title),
          props.onClose ? h('button', { type: 'button', className: 'cf-icon-btn', 'aria-label': 'Close', onClick: props.onClose }, h(Glyph, { name: 'close' })) : null),
        h('div', { className: 'cf-modal-body' }, props.children),
        props.footer ? h('div', { className: 'cf-modal-foot' }, props.footer) : null)
    );
  }

  /* ---------- Status ---------- */
  function Badge(props) {
    var tone = props.tone || 'neutral';
    return h('span', { className: cx('cf-badge', 'cf-badge-' + tone, props.className) },
      props.icon ? h('span', { className: 'cf-badge-icon', 'aria-hidden': 'true' }, props.icon) : props.dot ? h('span', { className: 'cf-badge-dot', 'aria-hidden': 'true' }) : null,
      props.children);
  }

  function Alert(props) {
    var tone = props.tone || 'info';
    var urgent = tone === 'danger';
    return h('div', {
      role: urgent ? 'alert' : 'status',
      className: cx('cf-alert', 'cf-alert-' + tone, props.banner && 'is-banner', props.className)
    },
      h(Glyph, { name: tone, className: 'cf-alert-glyph' }),
      h('div', { className: 'cf-alert-text' },
        props.title ? h('p', { className: 'cf-alert-title' }, props.title) : null,
        props.children ? h('div', { className: 'cf-alert-body' }, props.children) : null),
      props.action ? h('div', { className: 'cf-alert-action' }, props.action) : null,
      props.onDismiss ? h('button', { type: 'button', className: 'cf-icon-btn', 'aria-label': 'Dismiss', onClick: props.onDismiss }, h(Glyph, { name: 'close', size: 18 })) : null
    );
  }

  function Skeleton(props) {
    var lines = props.lines || 0;
    if (lines > 1) {
      var out = [];
      for (var i = 0; i < lines; i++) out.push(h('span', { key: i, className: 'cf-skel', style: { height: props.height || 12, width: i === lines - 1 ? '60%' : '100%' } }));
      return h('span', { className: cx('cf-skel-stack', props.className), 'aria-hidden': 'true' }, out);
    }
    return h('span', {
      className: cx('cf-skel', props.circle && 'is-circle', props.className), 'aria-hidden': 'true',
      style: { width: props.width || '100%', height: props.height || 12, borderRadius: props.radius }
    });
  }

  /* ---------- Navigation ---------- */
  function NavItem(item, active, onSelect, cls) {
    var isActive = item.id === active;
    var Tag = item.href ? 'a' : 'button';
    return h(Tag, {
      key: item.id, href: item.href, type: Tag === 'button' ? 'button' : undefined,
      className: cx(cls, isActive && 'is-active'), 'aria-current': isActive ? 'page' : undefined,
      onClick: onSelect ? function (e) { if (!item.href) e.preventDefault(); onSelect(item.id); } : undefined
    },
      item.icon ? h('span', { className: cls + '-icon', 'aria-hidden': 'true' }, item.icon) : null,
      h('span', { className: cls + '-label' }, item.label),
      item.badge != null ? h('span', { className: cls + '-count', 'aria-label': item.badge + ' new' }, item.badge) : null
    );
  }

  function Sidebar(props) {
    return h('nav', { className: cx('cf-sidebar', props.className), 'aria-label': props.label || 'Main' },
      props.header ? h('div', { className: 'cf-sidebar-head' }, props.header) : null,
      (props.sections || [{ items: props.items || [] }]).map(function (sec, i) {
        return h('div', { key: i, className: 'cf-sidebar-section' },
          sec.title ? h('p', { className: 'cf-sidebar-title' }, sec.title) : null,
          sec.items.map(function (it) { return NavItem(it, props.activeId, props.onSelect, 'cf-nav'); }));
      }),
      props.footer ? h('div', { className: 'cf-sidebar-foot' }, props.footer) : null
    );
  }

  function BottomNav(props) {
    return h('nav', { className: cx('cf-bottomnav', props.className), 'aria-label': props.label || 'Main' },
      (props.items || []).map(function (it) { return NavItem(it, props.activeId, props.onSelect, 'cf-tab'); }));
  }

  function Tabs(props) {
    var inner = useState(props.defaultValue || (props.tabs && props.tabs[0] && props.tabs[0].id));
    var controlled = props.value !== undefined;
    var value = controlled ? props.value : inner[0];
    var refs = useRef({});
    function select(id) {
      if (!controlled) inner[1](id);
      if (props.onChange) props.onChange(id);
    }
    function onKey(e) {
      var ids = props.tabs.map(function (t) { return t.id; });
      var i = ids.indexOf(value), next = null;
      if (e.key === 'ArrowRight') next = ids[(i + 1) % ids.length];
      if (e.key === 'ArrowLeft') next = ids[(i - 1 + ids.length) % ids.length];
      if (e.key === 'Home') next = ids[0];
      if (e.key === 'End') next = ids[ids.length - 1];
      if (next) { e.preventDefault(); select(next); var n = refs.current[next]; n && n.focus(); }
    }
    return h('div', { role: 'tablist', 'aria-label': props.label, className: cx('cf-tabs', 'cf-tabs-' + (props.variant || 'underline'), props.className), onKeyDown: onKey },
      props.tabs.map(function (t) {
        var sel = t.id === value;
        return h('button', {
          key: t.id, type: 'button', role: 'tab', id: t.id + '-tab', 'aria-selected': sel ? 'true' : 'false',
          'aria-controls': t.panelId, tabIndex: sel ? 0 : -1, className: cx('cf-tabs-tab', sel && 'is-selected'),
          ref: function (n) { refs.current[t.id] = n; }, onClick: function () { select(t.id); }
        }, t.label, t.count != null ? h('span', { className: 'cf-tabs-count' }, t.count) : null);
      }));
  }

  function Stepper(props) {
    var current = props.current || 0;
    return h('ol', { className: cx('cf-stepper', props.className), 'aria-label': props.label || 'Progress' },
      props.steps.map(function (label, i) {
        var state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return h('li', { key: i, className: 'cf-step is-' + state, 'aria-current': state === 'current' ? 'step' : undefined },
          h('span', { className: 'cf-step-marker', 'aria-hidden': 'true' }, state === 'done' ? h(Glyph, { name: 'check', size: 16 }) : i + 1),
          h('span', { className: 'cf-step-label' }, label,
            h('span', { className: 'cf-sr' }, state === 'done' ? ' (completed)' : state === 'current' ? ' (current step)' : '')));
      }));
  }

  /* ---------- Data ---------- */
  function Table(props) {
    var cols = props.columns || [], rows = props.rows || [];
    return h('div', { className: cx('cf-table-wrap', props.stickyHeader && 'is-sticky', props.className), style: props.maxHeight ? { maxHeight: props.maxHeight } : undefined, tabIndex: props.maxHeight ? 0 : undefined },
      h('table', { className: cx('cf-table', props.striped && 'is-striped', props.density === 'compact' && 'is-compact') },
        props.caption ? h('caption', { className: 'cf-sr' }, props.caption) : null,
        h('thead', null, h('tr', null, cols.map(function (c) {
          return h('th', { key: c.key, scope: 'col', className: c.align === 'right' ? 'is-right' : undefined, style: c.width ? { width: c.width } : undefined }, c.header);
        }))),
        h('tbody', null, rows.length ? rows.map(function (r, i) {
          return h('tr', { key: props.rowKey ? r[props.rowKey] : i, className: props.isRowHighlighted && props.isRowHighlighted(r) ? 'is-flagged' : undefined },
            cols.map(function (c) {
              return h('td', { key: c.key, className: cx(c.align === 'right' && 'is-right', c.mono && 'is-mono') }, c.render ? c.render(r) : r[c.key]);
            }));
        }) : h('tr', null, h('td', { colSpan: cols.length, className: 'cf-table-empty' }, props.empty || 'Nothing to show yet.'))))
    );
  }

  /* ---------- Page ---------- */
  function PageHeader(props) {
    return h('header', { className: cx('cf-pagehead', props.className) },
      h('div', { className: 'cf-pagehead-text' },
        props.eyebrow ? h('p', { className: 'cf-pagehead-eyebrow' }, props.eyebrow) : null,
        h(props.titleAs || 'h1', { className: 'cf-pagehead-title' }, props.title),
        props.subtitle ? h('p', { className: 'cf-pagehead-sub' }, props.subtitle) : null),
      props.actions ? h('div', { className: 'cf-pagehead-actions' }, props.actions) : null);
  }

  function StatCard(props) {
    var t = props.trend;
    return h('div', { className: cx('cf-stat', props.tone && 'cf-tone-' + props.tone, props.className) },
      h('div', { className: 'cf-stat-top' },
        h('p', { className: 'cf-stat-label' }, props.label),
        props.icon ? h('span', { className: 'cf-stat-icon', 'aria-hidden': 'true' }, props.icon) : null),
      h('p', { className: 'cf-stat-value' }, props.value, props.unit ? h('span', { className: 'cf-stat-unit' }, props.unit) : null),
      t ? h('p', { className: cx('cf-stat-hint', t.direction === 'up' && 'is-up', t.direction === 'down' && 'is-down') },
        t.direction ? h(Glyph, { name: t.direction, size: 16 }) : null, t.text) :
        props.hint ? h('p', { className: 'cf-stat-hint' }, props.hint) : null);
  }

  var AI_STATUS = {
    verified: { cls: 'is-verified', label: 'VERIFIED', glyph: 'check' },
    caution: { cls: 'is-caution', label: 'SUPPORTED_WITH_CAUTION', glyph: 'warning' },
    uncertain: { cls: 'is-uncertain', label: 'UNCERTAIN', glyph: 'question' }
  };
  function AIInsight(props) {
    var st = props.status ? AI_STATUS[props.status] : null;
    var simulated = props.simulated !== false;
    var conf = typeof props.confidence === 'number' ? Math.max(0, Math.min(1, props.confidence)) : null;
    return h('section', { className: cx('cf-ai', props.className), 'aria-label': props.label || 'AI insight' },
      h('div', { className: 'cf-ai-head' },
        h('span', { className: 'cf-ai-tag' }, h(Glyph, { name: 'ai', size: 14 }), simulated ? 'Simulated AI output' : 'AI-generated insight'),
        props.module ? h('span', { className: 'cf-ai-module' }, props.module) : null,
        st ? h('span', { className: cx('cf-ai-status', st.cls) }, h(Glyph, { name: st.glyph, size: 14 }), st.label) : null),
      props.title ? h(props.titleAs || 'h3', { className: 'cf-ai-title' }, props.title) : null,
      props.children ? h('div', { className: 'cf-ai-body' }, props.children) : null,
      conf !== null ? h('div', { className: 'cf-ai-conf' }, h('span', null, 'Confidence'),
        h('span', { className: 'cf-ai-bar', role: 'img', 'aria-label': 'Confidence ' + Math.round(conf * 100) + ' percent' }, h('span', { style: { width: Math.round(conf * 100) + '%' } })),
        h('span', { className: 'cf-num' }, Math.round(conf * 100) + '%')) : null,
      props.evidence && props.evidence.length ? h('ul', { className: 'cf-ai-evidence', 'aria-label': 'Evidence' }, props.evidence.map(function (e, i) { return h('li', { key: i }, e); })) : null,
      h('div', { className: 'cf-ai-foot' },
        h('span', { className: 'cf-ai-review' }, h(Glyph, { name: props.reviewed ? 'check' : 'shield', size: 16 }),
          props.reviewed ? (props.reviewedBy ? 'Reviewed by ' + props.reviewedBy : 'Reviewed by a clinician') : 'Requires clinician review'),
        props.footer || null));
  }

  function Select(props) {
    var autoId = useId();
    var id = props.id || 'cf-sel-' + autoId.replace(/:/g, '');
    var msgId = id + '-msg';
    var message = props.error || props.helper;
    var opts = (props.options || []).map(function (o) { return typeof o === 'string' ? { value: o, label: o } : o; });
    var rest = omit(props, ['label', 'helper', 'error', 'options', 'className', 'id', 'onChange', 'placeholder', 'optional']);
    return h('div', { className: cx('cf-field', props.error && 'has-error', props.className) },
      props.label ? h('label', { className: 'cf-field-label', htmlFor: id }, props.label,
        props.required ? h('span', { className: 'cf-req', 'aria-hidden': 'true' }, ' *') : props.optional ? h('span', { className: 'cf-opt' }, ' (optional)') : null) : null,
      h('select', Object.assign({}, rest, {
        id: id, className: 'cf-select', 'aria-invalid': props.error ? 'true' : undefined, 'aria-describedby': message ? msgId : undefined,
        onChange: props.onChange ? function (e) { props.onChange(e.target.value, e); } : undefined
      }),
        props.placeholder ? h('option', { value: '' }, props.placeholder) : null,
        opts.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); })),
      message ? h('p', { id: msgId, className: cx('cf-field-msg', props.error && 'is-error') }, props.error ? h(Glyph, { name: 'danger', size: 16 }) : null, h('span', null, message)) : null);
  }

  function Textarea(props) {
    var autoId = useId();
    var id = props.id || 'cf-ta-' + autoId.replace(/:/g, '');
    var msgId = id + '-msg';
    var message = props.error || props.helper;
    var rest = omit(props, ['label', 'helper', 'error', 'className', 'id', 'optional']);
    return h('div', { className: cx('cf-field', props.error && 'has-error', props.className) },
      h('label', { className: 'cf-field-label', htmlFor: id }, props.label,
        props.required ? h('span', { className: 'cf-req', 'aria-hidden': 'true' }, ' *') : props.optional ? h('span', { className: 'cf-opt' }, ' (optional)') : null),
      h('textarea', Object.assign({ rows: 4 }, rest, { id: id, className: 'cf-textarea', 'aria-invalid': props.error ? 'true' : undefined, 'aria-describedby': message ? msgId : undefined })),
      message ? h('p', { id: msgId, className: cx('cf-field-msg', props.error && 'is-error') }, props.error ? h(Glyph, { name: 'danger', size: 16 }) : null, h('span', null, message)) : null);
  }

  function Checkbox(props) {
    var inner = useState(!!props.defaultChecked);
    var controlled = props.checked !== undefined;
    var on = controlled ? props.checked : inner[0];
    return h('label', { className: cx('cf-check', props.disabled && 'is-disabled', props.className) },
      h('input', { type: 'checkbox', checked: on, disabled: props.disabled, name: props.name, required: props.required,
        onChange: function (e) { if (!controlled) inner[1](e.target.checked); if (props.onChange) props.onChange(e.target.checked); } }),
      h('span', { className: 'cf-check-box', 'aria-hidden': 'true' }, h(Glyph, { name: 'check', size: 14 })),
      h('span', { className: 'cf-check-text' }, h('span', null, props.label), props.description ? h('span', { className: 'cf-check-desc' }, props.description) : null));
  }

  function EmptyState(props) {
    return h('div', { className: cx('cf-empty', props.className) },
      h('span', { className: 'cf-empty-icon', 'aria-hidden': 'true' }, props.icon || h(Glyph, { name: 'inbox', size: 26 })),
      h(props.titleAs || 'h3', { className: 'cf-empty-title' }, props.title),
      props.children ? h('p', { className: 'cf-empty-body' }, props.children) : null,
      props.action || null);
  }

  var AV_TONES = ['teal', 'lavender', 'peach', 'blue', 'sage'];
  function Avatar(props) {
    var name = props.name || '';
    var parts = name.replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '').split(/\s+/).filter(Boolean);
    var initials = ((parts[0] || '')[0] || '') + ((parts.length > 1 ? parts[parts.length - 1][0] : '') || '');
    var sum = 0; for (var i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    var tone = props.tone || AV_TONES[sum % AV_TONES.length];
    var size = props.size || 40;
    return h('span', { className: cx('cf-avatar', 'cf-avatar-' + tone, props.className), role: 'img', 'aria-label': name,
      style: { width: size, height: size, fontSize: Math.round(size * 0.38) } }, initials.toUpperCase());
  }

  var api = {
    Button: Button, TextField: TextField, Switch: Switch, Card: Card, Modal: Modal,
    Badge: Badge, Alert: Alert, Skeleton: Skeleton, Sidebar: Sidebar, BottomNav: BottomNav,
    Tabs: Tabs, Stepper: Stepper, Table: Table, PageHeader: PageHeader, StatCard: StatCard, AIInsight: AIInsight,
    Select: Select, Textarea: Textarea, Checkbox: Checkbox, EmptyState: EmptyState, Avatar: Avatar
  };
  window.CareFusion = Object.assign(window.CareFusion || {}, api);
})();
