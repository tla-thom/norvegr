function bindExclusiveProductAccordions(container) {
  if (!container || container.dataset.exclusiveAccordionBound === 'true') return;
  container.dataset.exclusiveAccordionBound = 'true';

  container.addEventListener(
    'click',
    (event) => {
      const summary = event.target.closest('.product__accordion summary');
      if (!summary || !container.contains(summary)) return;

      const details = summary.closest('details');
      if (!details || details.hasAttribute('open')) return;

      container.querySelectorAll('.product__accordion details[open]').forEach((other) => {
        if (other !== details) other.removeAttribute('open');
      });
    },
    true
  );
}

function initProductAccordions(root = document) {
  const containers = new Set();

  if (root.matches?.('product-info')) containers.add(root);
  root.querySelectorAll('product-info').forEach((node) => containers.add(node));
  if (root.matches?.('.product__info-container')) containers.add(root);
  root.querySelectorAll('.product__info-container').forEach((node) => containers.add(node));

  containers.forEach((container) => bindExclusiveProductAccordions(container));
}

initProductAccordions();
document.addEventListener('DOMContentLoaded', () => initProductAccordions());
document.addEventListener('product-info:loaded', (event) => initProductAccordions(event.target));
document.addEventListener('shopify:section:load', (event) => initProductAccordions(event.target));
