/**
 * Bed-linen template: hide Size until Product Type is chosen,
 * then show only sizes valid for that type.
 * Scoped to variant-selects[data-dependent-options] only.
 */
(function () {
  const INIT_FLAG = 'dependentOptionsInit';
  const REVEALED_FLAG = 'dependentRevealed';

  class DependentVariantOptions {
    constructor(root) {
      this.root = root;
      this.productInfo = root.closest('product-info');
      [this.controllerName, this.dependentName] = root.dataset.dependentOptions.split(':');
      this.typeToSizes = this.buildTypeMap();
      this.controllerFieldset = this.findOptionGroup(this.controllerName);
      this.dependentFieldset = this.findOptionGroup(this.dependentName);
      this.revealed =
        this.productInfo?.dataset[REVEALED_FLAG] === 'true' || this.hasVariantInUrl();
    }

    buildTypeMap() {
      const map = {};
      const script = this.root.querySelector('[data-dependent-variants]');
      if (!script) return map;

      let variants;
      try {
        variants = JSON.parse(script.textContent);
      } catch {
        return map;
      }

      variants.forEach((variant) => {
        const type = variant.option1;
        const size = variant.option2;
        if (!type || !size) return;

        if (!map[type]) map[type] = new Set();
        map[type].add(size);
      });

      return map;
    }

    findOptionGroup(name) {
      return this.root.querySelector(`[data-option-name="${name}"]`);
    }

    hasVariantInUrl() {
      return new URLSearchParams(window.location.search).has('variant');
    }

    bind() {
      if (!this.controllerFieldset || !this.dependentFieldset) return;

      this.onChange = (event) => {
        const input = event.target;
        if (input.type !== 'radio' || !this.controllerFieldset.contains(input)) return;
        this.setRevealed(true);
        this.update();
      };

      this.root.addEventListener('change', this.onChange);
      this.update();
    }

    setRevealed(revealed) {
      this.revealed = revealed;
      if (this.productInfo) {
        this.productInfo.dataset[REVEALED_FLAG] = revealed ? 'true' : 'false';
      }
    }

    hideDependent() {
      this.dependentFieldset.classList.add('variant-option--dependent-hidden');
    }

    showDependent() {
      this.dependentFieldset.classList.remove('variant-option--dependent-hidden');
    }

    getSelectedController() {
      const checked = this.controllerFieldset.querySelector('input[type="radio"]:checked');
      return checked ? checked.value : null;
    }

    getDependentInputs() {
      return Array.from(this.dependentFieldset.querySelectorAll('input[type="radio"]'));
    }

    getLabelForInput(input) {
      if (input.nextElementSibling?.matches('label')) return input.nextElementSibling;
      return this.dependentFieldset.querySelector(`label[for="${input.id}"]`);
    }

    update() {
      const selectedType = this.getSelectedController();

      if (!selectedType || !this.revealed) {
        this.hideDependent();
        return;
      }

      this.showDependent();

      const validSizes = this.typeToSizes[selectedType] || new Set();
      const inputs = this.getDependentInputs();
      let hasCheckedVisible = false;

      inputs.forEach((input) => {
        const label = this.getLabelForInput(input);
        const isValid = validSizes.has(input.value);

        input.classList.toggle('dependent-option--hidden', !isValid);
        label?.classList.toggle('dependent-option--hidden', !isValid);

        if (!isValid) {
          input.classList.remove('disabled');
          if (input.checked) input.checked = false;
          return;
        }

        if (input.checked) hasCheckedVisible = true;
      });

      if (!hasCheckedVisible) {
        const firstAvailable = inputs.find(
          (input) => validSizes.has(input.value) && !input.classList.contains('disabled')
        );
        if (firstAvailable) {
          firstAvailable.checked = true;
          firstAvailable.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }

    destroy() {
      if (this.onChange) this.root.removeEventListener('change', this.onChange);
    }
  }

  function init(root = document) {
    root.querySelectorAll('variant-selects[data-dependent-options]').forEach((element) => {
      if (element._dependentVariantOptions) {
        element._dependentVariantOptions.destroy();
      }

      element.dataset[INIT_FLAG] = 'true';
      element._dependentVariantOptions = new DependentVariantOptions(element);
      element._dependentVariantOptions.bind();
    });
  }

  function bindVariantChangeListener() {
    if (typeof subscribe !== 'function' || typeof PUB_SUB_EVENTS === 'undefined') return;
    if (window._dependentVariantChangeBound) return;
    window._dependentVariantChangeBound = true;

    subscribe(PUB_SUB_EVENTS.variantChange, () => {
      requestAnimationFrame(() => init());
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
    bindVariantChangeListener();
  });

  document.addEventListener('product-info:loaded', (event) => {
    init(event.target || document);
    bindVariantChangeListener();
  });
})();
