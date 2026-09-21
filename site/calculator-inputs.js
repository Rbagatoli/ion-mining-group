/* Presentation only: read the existing calculator fields, never change their values. */
(function () {
    'use strict';
    var root = document.querySelector('.calc-inputs');
    if (!root) return;
    var media = window.matchMedia('(max-width: 640px)');
    function value(id) { var node = document.getElementById(id); return node ? node.value : ''; }
    function number(id, digits) {
        var raw = value(id), n = Number(raw);
        return raw !== '' && Number.isFinite(n) ? n.toLocaleString('en-US', {maximumFractionDigits:digits === undefined ? 3 : digits}) : '—';
    }
    function text(key, message) { var node = root.querySelector('[data-calc-summary="'+key+'"]'); if (node) node.textContent = message; }
    function refresh() {
        text('machines', (root.querySelector('[data-mode="energy"]').getAttribute('aria-pressed') === 'true' ? 'Sized from your energy' : number('machineCount',0)+' machines')+' · $'+number('capex',0)+' each');
        text('specs',number('hashrate')+' TH/s · '+number('power')+' kW each');
        text('lifecycle',number('minerLifespan',0)+' months · Auto-replace '+(document.getElementById('autoReplace').checked?'on':'off'));
        text('operating','$'+number('elecCost')+'/kWh · '+number('uptime')+'% uptime');
        var units = {mw:'MW',kw:'kW',mcfd:'Mcf/day'};
        text('energy',number('energyValue')+' '+(units[value('energyBasis')] || ''));
    }
    function reveal(node) {
        for (var parent=node.parentElement;parent&&parent!==root;parent=parent.parentElement) if(parent.tagName==='DETAILS')parent.open=true;
    }
    root.addEventListener('input',refresh);
    root.addEventListener('change',function(event){
        refresh();
        if (event.target.id==='minerModel' && value('minerModel')==='__custom__') reveal(document.getElementById('hashrate'));
    });
    root.addEventListener('click',function(event){
        var mode=event.target.closest('[data-mode]');
        if(mode&&media.matches&&mode.dataset.mode==='energy')root.querySelector('[data-calc-section="energy"]').open=true;
        refresh();
    });
    root.addEventListener('invalid',function(event){reveal(event.target);},true);
    function ready() {
        refresh();
        if (media.matches && root.querySelector('[data-mode="energy"]').getAttribute('aria-pressed')==='true') root.querySelector('[data-calc-section="energy"]').open=true;
        if (value('minerModel')==='__custom__') reveal(document.getElementById('hashrate'));
    }
    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',ready);
    else ready();
})();
