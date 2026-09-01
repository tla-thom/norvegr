/**
 * Bed-linen template: hide Size until Product Type is chosen,
 * then show only sizes valid for that type (no strikethrough clutter).
 * Active only on variant-selects[data-dependent-options] (premium-bed-linen template).
 */
(function () {
  const INIT_FLAG = 'dependentOptionsInit';

  class DependentVariantOptions {
    constructor(root) {
      this.root = root;
      [this.controllerName, this.dependentName] = root.dataset.dependentOptions.split(':');
      this.typeToSizes = this.buildTypeMap();
      this.controllerFieldset = this.findOptionGroup(this.controllerName);
      this.dependentFieldset = this.findOptionGroup(this.dependentName);
        this.revealed = root.dataset.dependentRevealed === 'true' || this.hasVariantInUrl();
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
        const options = variant.options || [];
        const typeIndex = this.getOptionIndex(this.controllerName);
        const sizeIndex = this.getOptionIndex(this.dependentName);
        if (typeIndex === -1 || sizeIndex === -1) return;

        const type = options[typeIndex];
        const size = options[sizeIndex];
        if (!type || !size) return;

        if (!map[type]) map[type] = new Set();
        map[type].add(size);
      });

      return map;
    }

    getOptionIndex(name) {
      const fieldsets = this.root.querySelectorAll('[data-option-name]');
      for (let i = 0; i < fieldsets.length; i++) {
        if (fieldsets[i].dataset.optionName === name) return i;
      }
      return -1;
    }

    findOptionGroup(name) {
      return this.root.querySelector(`[data-option-name="${CSS.escape(name)}"]`);
    }

    hasVariantInUrl() {
      return new URLSearchParams(window.location.search).has('variant');
    }

    bind() {
      if (!this.controllerFieldset || !this.dependentFieldset) return;

      this.root.addEventListener('change', (event) => {
        const input = event.target;
        if (input.type !== 'radio' || !this.controllerFieldset.contains(input)) return;
        this.revealed = true;
        this.root.dataset.dependentRevealed = 'true';
        this.update();
      });

      if (this.revealed) {
        this.update();
      } else {
        this.hideDependent();
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
        const label = this.dependentFieldset.querySelector(`label[for="${CSS.escape(input.id)}"]`);
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
  }

  function init(root = document) {
    root.querySelectorAll('variant-selects[data-dependent-options]').forEach((element) => {
      if (element.dataset[INIT_FLAG]) return;
      element.dataset[INIT_FLAG] = 'true';
      new DependentVariantOptions(element).bind();
    });
  }

  document.addEventListener('DOMContentLoaded', () => init());

  document.addEventListener('product-info:loaded', (event) => {
    init(event.target || document);
  });

  if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
    subscribe(PUB_SUB_EVENTS.variantChange, () => {
      requestAnimationFrame(() => {
        document.querySelectorAll('variant-selects[data-dependent-options]').forEach((element) => {
          delete element.dataset[INIT_FLAG];
        });
        init();
      });
    });
  }
})();
