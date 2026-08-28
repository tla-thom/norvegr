function initProductAccordions(root = document) {
  root.querySelectorAll('product-info .product__accordion details').forEach((details) => {
    if (details.dataset.exclusiveAccordion === 'true') return;
    details.dataset.exclusiveAccordion = 'true';

    details.addEventListener('toggle', () => {
      if (!details.open) return;

      const accordionGroup = details.closest('product-info');
      if (!accordionGroup) return;

      accordionGroup.querySelectorAll('.product__accordion details[open]').forEach((other) => {
        if (other !== details) other.open = false;
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', () => initProductAccordions());
document.addEventListener('product-info:loaded', (event) => initProductAccordions(event.target));
document.addEventListener('shopify:section:load', (event) => initProductAccordions(event.target));
