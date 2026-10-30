/* Local preview shim approximating the Design canvas runtime, for screenshots only. */
document.write('<script src="/_rt/react.js"><\/script><script src="/_rt/react-dom.js"><\/script>');
(function () {
  var EV = {};
  'Click Submit Change Input KeyDown KeyUp Focus Blur MouseEnter MouseLeave DoubleClick PointerDown DragOver Drop DragLeave DragStart DragEnd DragEnter Scroll'.split(' ').forEach(function (e) { EV['on' + e.toLowerCase()] = 'on' + e; });
  window.__dcErrors = [];
  function camel(s) { return s.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }); }
  function getPath(path, scope) {
    var parts = path.trim().split('.'); var o = scope[parts[0]];
    for (var i = 1; i < parts.length; i++) { if (o == null) return undefined; o = o[parts[i]]; }
    return o;
  }
  function whole(s) { var m = /^\s*\{\{([^}]+)\}\}\s*$/.exec(s); return m ? m[1] : null; }
  function interp(s, scope) { return s.replace(/\{\{([^}]+)\}\}/g, function (_, p) { var v = getPath(p, scope); if (v === undefined) window.__dcErrors.push('hole ' + p); return v == null || v === false ? '' : String(v); }); }
  function val(s, scope) { var w = whole(s); if (w) { var v = getPath(w, scope); if (v === undefined) window.__dcErrors.push('hole ' + w); return v; } return interp(s, scope); }
  function styleObj(s) { var o = {}; s.split(';').forEach(function (d) { var i = d.indexOf(':'); if (i < 0) return; var k = d.slice(0, i).trim(); if (!k) return; o[k.indexOf('--') === 0 ? k : camel(k)] = d.slice(i + 1).trim(); }); return o; }
  var cache = {};
  function loadChild(name) {
    if (cache[name]) return cache[name];
    var x = new XMLHttpRequest(); x.open('GET', name + '.dc.html', false); x.send();
    var C = build(x.responseText, true); cache[name] = C; return C;
  }
  function conv(n, scope, key) {
    var h = React.createElement;
    if (n.nodeType === 3) { var t = n.nodeValue; var w = whole(t); if (w) { var v = getPath(w, scope); if (v === undefined) window.__dcErrors.push('hole ' + w); return v === false || v == null ? null : v; } return t.indexOf('{{') >= 0 ? interp(t, scope) : t; }
    if (n.nodeType !== 1) return null;
    var tag = n.tagName.toLowerCase();
    var kids = function (sc) { var out = []; n.childNodes.forEach(function (c, i) { var r = conv(c, sc, i); if (r !== null && r !== '') out.push(r); }); return out; };
    if (tag === 'helmet') return null;
    if (tag === 'sc-if') { return val(n.getAttribute('value') || '', scope) ? h(React.Fragment, { key: key }, kids(scope)) : null; }
    if (tag === 'sc-for') {
      var L = val(n.getAttribute('list') || '', scope) || []; var as = n.getAttribute('as') || 'item';
      if (!Array.isArray(L)) { window.__dcErrors.push('list not array ' + n.getAttribute('list')); return null; }
      return h(React.Fragment, { key: key }, L.map(function (it, i) { var s = Object.assign({}, scope); s[as] = it; return h(React.Fragment, { key: i }, kids(s)); }));
    }
    var props = { key: key }; var comp = tag;
    if (tag === 'x-import' || tag === 'dc-import') {
      if (tag === 'x-import') { comp = getPath(n.getAttribute('component-from-global-scope'), window); if (!comp) { window.__dcErrors.push('no comp ' + n.getAttribute('component-from-global-scope')); return null; } }
      else comp = loadChild(n.getAttribute('name'));
      Array.prototype.forEach.call(n.attributes, function (a) {
        if (a.name === 'component-from-global-scope' || (tag === 'dc-import' && a.name === 'name') || a.name.indexOf('hint-') === 0) return;
        var k = a.name === 'class' ? 'className' : camel(a.name);
        var v = val(a.value, scope); if (whole(a.value) == null && a.value === '') v = true;
        props[k] = v;
      });
      var ch = kids(scope); return h.apply(null, [comp, props].concat(ch));
    }
    Array.prototype.forEach.call(n.attributes, function (a) {
      var nm = a.name, v;
      if (EV[nm]) { props[EV[nm]] = val(a.value, scope); return; }
      if (nm === 'class') { props.className = interp(a.value, scope); return; }
      if (nm === 'style') { props.style = styleObj(interp(a.value, scope)); return; }
      if (nm === 'for') { props.htmlFor = a.value; return; }
      v = val(a.value, scope);
      if ((tag === 'input' || tag === 'textarea' || tag === 'select') && (nm === 'value' || nm === 'checked')) { if (whole(a.value)) props[nm] = v; else props[nm === 'value' ? 'defaultValue' : 'defaultChecked'] = nm === 'checked' ? true : v; if (whole(a.value) && !props.onChange) props.readOnly = undefined; return; }
      if (nm === 'tabindex') nm = 'tabIndex'; if (nm === 'maxlength') nm = 'maxLength'; if (nm === 'readonly') nm = 'readOnly'; if (nm === 'colspan') nm = 'colSpan'; if (nm === 'inputmode') nm = 'inputMode'; if (nm === 'autocomplete') nm = 'autoComplete';
      if (a.value === '' && ['disabled', 'required', 'checked', 'readOnly', 'hidden', 'open', 'multiple', 'selected'].indexOf(nm) >= 0) v = true;
      props[nm] = v;
    });
    if (tag === 'textarea' && n.textContent && props.defaultValue == null && props.value == null) { props.defaultValue = n.textContent; return h(tag, props); }
    if (['input', 'img', 'br', 'hr', 'meta', 'link'].indexOf(tag) >= 0) return h(tag, props);
    return h.apply(null, [tag, props].concat(kids(scope)));
  }
  function build(src, child) {
    var doc = new DOMParser().parseFromString(src, 'text/html');
    var root = doc.querySelector('x-dc');
    if (!child) { var hel = root.querySelector('helmet'); if (hel) Array.prototype.forEach.call(hel.children, function (c) { document.head.appendChild(document.importNode(c, true)); }); }
    else { var hel2 = root.querySelector('helmet'); if (hel2) Array.prototype.forEach.call(hel2.children, function (c) { if (c.tagName === 'STYLE') document.head.appendChild(document.importNode(c, true)); }); }
    var sc = doc.querySelector('script[type="text/x-dc"]');
    var C;
    try { C = new Function('DCLogic', 'React', sc.textContent + ';return Component;')(window.DCLogic, React); } catch (e) { window.__dcErrors.push('script ' + e.message); C = window.DCLogic; }
    var tplNodes = Array.prototype.filter.call(root.childNodes, function (c) { return !(c.nodeType === 1 && c.tagName.toLowerCase() === 'helmet'); });
    var orig = C.prototype.render;
    C.prototype.render = function () {
      var v; try { v = this.renderVals ? this.renderVals() : {}; } catch (e) { window.__dcErrors.push('renderVals ' + e.message); v = {}; }
      var scope = Object.assign({}, v);
      return React.createElement(React.Fragment, null, tplNodes.map(function (n, i) { return conv(n, scope, i); }));
    };
    return C;
  }
  window.addEventListener('DOMContentLoaded', function () {
    window.DCLogic = class extends React.Component { constructor(p) { super(p); this.state = this.state || {}; } };
    var x = new XMLHttpRequest(); x.open('GET', location.pathname, false); x.send();
    var C = build(x.responseText, false);
    var props = {}; try { props = JSON.parse(document.querySelector('script[type="text/x-dc"]').getAttribute('data-props') || '{}'); } catch (e) {}
    var host = document.createElement('div'); host.id = '__dc'; document.body.innerHTML = ''; document.body.appendChild(host);
    window.addEventListener('error', function (e) { window.__dcErrors.push('err ' + e.message); });
    var Boundary = class extends React.Component { constructor(p) { super(p); this.state = {}; } static getDerivedStateFromError(e) { return { e: e }; } componentDidCatch(e) { window.__dcErrors.push('render ' + e.message); } render() { return this.state.e ? React.createElement('pre', null, String(this.state.e)) : this.props.children; } };
    var p2 = {}; for (var k in props) if (k[0] !== '$') p2[k] = props[k] && props[k].editor === null ? undefined : props[k];
    ReactDOM.createRoot(host).render(React.createElement(Boundary, null, React.createElement(C, p2)));
  });
})();
