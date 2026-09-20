(function () {
    'use strict';
    var button = document.querySelector('[data-print-checklist]');
    if (!button) return;
    button.hidden = false;
    button.addEventListener('click', function () { window.print(); });
}());
