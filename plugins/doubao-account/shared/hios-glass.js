/* Presentation-only range fill. No state writes, synthetic events, bridge or network. */
(() => {
  const selector = document.currentScript?.dataset.ranges;
  if (!selector) return;
  const ranges = new Set(), visible = new Set(), previous = new WeakMap();
  let timer;
  const sync = el => {
    const min = Number(el.min || 0), max = Number(el.max || 100), value = Number(el.value);
    const fill = Number.isFinite(value) && max > min ? Math.max(0, Math.min(100, (value-min)/(max-min)*100)) : 0;
    const css = `${fill}%`;
    if (previous.get(el) !== css) { el.style.setProperty('--range-fill', css); previous.set(el, css); }
  };
  const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const {target, isIntersecting} of entries) { if (isIntersecting) {visible.add(target);sync(target);} else visible.delete(target); }
    schedule();
  }) : null;
  const schedule = () => {
    if (document.visibilityState === 'hidden' || !visible.size) {clearTimeout(timer);timer=null;return;}
    if (timer) return;
    // Framework property assignments do not emit DOM mutations. A bounded visible-only
    // sweep handles preset/reset/undo without patching native or React value setters.
    timer = setTimeout(() => {
      timer=null;
      for (const el of visible) {
        if (!el.isConnected || !el.matches(selector)) {visible.delete(el);ranges.delete(el);intersection?.unobserve(el);}
        else sync(el);
      }
      schedule();
    }, 160);
  };
  const add = el => {
    if (!el.matches?.(selector) || ranges.has(el)) return;
    ranges.add(el);sync(el);
    if (intersection) intersection.observe(el); else visible.add(el);
  };
  const scan = root => { add(root); root.querySelectorAll?.(selector).forEach(add); };
  const start = () => {
    scan(document);schedule();
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') { add(record.target);if (ranges.has(record.target)) sync(record.target); }
        else for (const node of record.addedNodes) scan(node);
      }
      for (const el of ranges) if (!el.isConnected) {ranges.delete(el);visible.delete(el);intersection?.unobserve(el);}
      schedule();
    }).observe(document.documentElement, {subtree:true,childList:true,attributes:true,attributeFilter:['min','max','value','type']});
  };
  for (const type of ['input','change']) document.addEventListener(type,event=>{if(event.target.matches?.(selector))sync(event.target);},true);
  document.addEventListener('visibilitychange',schedule);
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
