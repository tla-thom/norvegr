class BrandSliderComponent extends HTMLElement {
  connectedCallback() {
    if (this._brandSliderReady) return;
    this._brandSliderReady = true;

    this.slider = this.querySelector('[id^="Slider-"]');
    this.currentPageElement = this.querySelector('.slider-counter--current');
    this.pageTotalElement = this.querySelector('.slider-counter--total');
    this.prevButton = this.querySelector('button[name="previous"]');
    this.nextButton = this.querySelector('button[name="next"]');

    if (!this.slider || !this.nextButton) return;

    this.initPages();
    const resizeObserver = new ResizeObserver(() => this.initPages());
    resizeObserver.observe(this.slider);

    this.slider.addEventListener('scroll', () => this.onScroll(), { passive: true });
    this.prevButton.addEventListener('click', (event) => this.onButtonClick(event));
    this.nextButton.addEventListener('click', (event) => this.onButtonClick(event));
  }

  getOriginalSlides() {
    return Array.from(this.slider.querySelectorAll('[id^="Slide-"]')).filter(
      (element) => !element.hasAttribute('data-brand-slider-clone')
    );
  }

  removeClones() {
    this.slider.querySelectorAll('[data-brand-slider-clone]').forEach((clone) => clone.remove());
  }

  appendClones() {
    const originals = this.getOriginalSlides().filter((element) => element.clientWidth > 0);
    if (originals.length <= this.slidesPerPage) return;

    const cloneCount = Math.min(this.slidesPerPage, originals.length);
    for (let i = 0; i < cloneCount; i++) {
      const clone = originals[i].cloneNode(true);
      clone.removeAttribute('id');
      clone.removeAttribute('data-shopify-editor-block');
      clone.setAttribute('data-brand-slider-clone', '');
      clone.setAttribute('aria-hidden', 'true');
      clone.classList.add('brand-slider__item--clone');
      this.slider.appendChild(clone);
    }
  }

  initPages() {
    const previousScrollLeft = this.slider.scrollLeft;
    this.removeClones();
    this.sliderItemsToShow = this.getOriginalSlides().filter((element) => element.clientWidth > 0);
    if (this.sliderItemsToShow.length < 2) return;

    this.sliderItemOffset = this.sliderItemsToShow[1].offsetLeft - this.sliderItemsToShow[0].offsetLeft;
    this.slidesPerPage = Math.floor(this.slider.clientWidth / this.sliderItemOffset) || 1;
    this.originalCount = this.sliderItemsToShow.length;
    this.totalPages = Math.max(1, this.originalCount - this.slidesPerPage + 1);

    if (this.originalCount > this.slidesPerPage) {
      this.appendClones();
      const firstClone = this.slider.querySelector('[data-brand-slider-clone]');
      this.loopScrollWidth = firstClone ? firstClone.offsetLeft : 0;
    } else {
      this.loopScrollWidth = 0;
    }

    this.slider.scrollLeft = Math.min(previousScrollLeft, this.getMaxRealScrollLeft());
    this.update();
  }

  getMaxRealScrollLeft() {
    const lastOriginal = this.sliderItemsToShow[this.originalCount - 1];
    if (!lastOriginal) return 0;
    return Math.max(0, lastOriginal.offsetLeft + lastOriginal.clientWidth - this.slider.clientWidth);
  }

  normalizeScrollPosition() {
    if (!this.loopScrollWidth || this._scrollLoopLock) return;

    if (this.slider.scrollLeft >= this.loopScrollWidth - 1) {
      this._scrollLoopLock = true;
      this.slider.scrollLeft = this.slider.scrollLeft - this.loopScrollWidth;
      this._scrollLoopLock = false;
    }
  }

  onScroll() {
    this.normalizeScrollPosition();
    this.update();
  }

  update() {
    if (!this.slider || !this.nextButton) return;

    const maxRealScrollLeft = this.getMaxRealScrollLeft();
    const previousPage = this.currentPage;

    if (maxRealScrollLeft > 0 && this.slider.scrollLeft >= maxRealScrollLeft - 1) {
      this.currentPage = this.totalPages;
    } else {
      this.currentPage = Math.round(this.slider.scrollLeft / this.sliderItemOffset) + 1;
    }

    this.currentPage = Math.min(Math.max(this.currentPage, 1), this.totalPages);

    if (this.currentPageElement && this.pageTotalElement) {
      this.currentPageElement.textContent = this.currentPage;
      this.pageTotalElement.textContent = this.totalPages;
    }

    this.prevButton.removeAttribute('disabled');
    this.nextButton.removeAttribute('disabled');

    if (this.currentPage !== previousPage) {
      this.dispatchEvent(
        new CustomEvent('slideChanged', {
          detail: {
            currentPage: this.currentPage,
            currentElement: this.sliderItemsToShow[this.currentPage - 1],
          },
        })
      );
    }
  }

  onButtonClick(event) {
    event.preventDefault();
    if (!this.sliderItemOffset) return;

    const maxRealScrollLeft = this.getMaxRealScrollLeft();

    if (event.currentTarget.name === 'next') {
      if (this.slider.scrollLeft >= maxRealScrollLeft - 1) {
        this.slideScrollPosition = this.slider.scrollLeft + this.sliderItemOffset;
      } else {
        this.slideScrollPosition = Math.min(this.slider.scrollLeft + this.sliderItemOffset, maxRealScrollLeft);
      }
    } else if (this.slider.scrollLeft <= 1) {
      this.slideScrollPosition = maxRealScrollLeft;
    } else {
      this.slideScrollPosition = Math.max(this.slider.scrollLeft - this.sliderItemOffset, 0);
    }

    this.slider.scrollTo({ left: this.slideScrollPosition, behavior: 'smooth' });
  }
}

if (!customElements.get('brand-slider-component')) {
  customElements.define('brand-slider-component', BrandSliderComponent);
}
