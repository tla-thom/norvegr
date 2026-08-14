class BrandSliderComponent extends HTMLElement {
  static AUTOPLAY_PAUSE = 2000;
  static SCROLL_DURATION = 2400;

  connectedCallback() {
    if (this._brandSliderReady) return;
    this._brandSliderReady = true;

    this.slider = this.querySelector('[id^="Slider-"]');
    this.currentPageElement = this.querySelector('.slider-counter--current');
    this.pageTotalElement = this.querySelector('.slider-counter--total');
    this.prevButton = this.querySelector('button[name="previous"]');
    this.nextButton = this.querySelector('button[name="next"]');
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (!this.slider) return;

    this.initPages();
    const resizeObserver = new ResizeObserver(() => this.initPages());
    resizeObserver.observe(this.slider);

    this.slider.addEventListener('scroll', () => this.onScroll(), { passive: true });

    if (this.prevButton) {
      this.prevButton.addEventListener('click', (event) => this.onButtonClick(event));
    }

    if (this.nextButton) {
      this.nextButton.addEventListener('click', (event) => this.onButtonClick(event));
    }

    this.addEventListener('mouseenter', () => this.pauseAutoplay());
    this.addEventListener('mouseleave', () => this.startAutoplay());
    this.addEventListener('focusin', () => this.pauseAutoplay());
    this.addEventListener('focusout', (event) => {
      if (!this.contains(event.relatedTarget)) this.startAutoplay();
    });

    this.reducedMotion.addEventListener('change', () => {
      if (this.reducedMotion.matches) {
        this.pauseAutoplay();
      } else {
        this.startAutoplay();
      }
    });

    this.startAutoplay();
  }

  disconnectedCallback() {
    this.pauseAutoplay();
    cancelAnimationFrame(this._scrollAnimationFrame);
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

  shouldAutoplay() {
    return this.originalCount > this.slidesPerPage;
  }

  initPages() {
    const previousScrollLeft = this.slider.scrollLeft;
    this.removeClones();
    this.sliderItemsToShow = this.getOriginalSlides().filter((element) => element.clientWidth > 0);
    if (this.sliderItemsToShow.length < 2) {
      this.pauseAutoplay();
      return;
    }

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

    if (this.shouldAutoplay()) {
      this.startAutoplay();
    } else {
      this.pauseAutoplay();
    }
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
    if (this._isScrolling) return;
    this.normalizeScrollPosition();
    this.update();
  }

  update() {
    if (!this.slider) return;

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

    if (this.prevButton) this.prevButton.removeAttribute('disabled');
    if (this.nextButton) this.nextButton.removeAttribute('disabled');

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

  startAutoplay() {
    if (this.reducedMotion.matches || !this.shouldAutoplay()) return;

    this.pauseAutoplay();
    this._autoplayActive = true;
    this.queueAutoplayPause();
  }

  pauseAutoplay() {
    this._autoplayActive = false;

    if (this.autoplayTimer) {
      window.clearTimeout(this.autoplayTimer);
      this.autoplayTimer = null;
    }
  }

  queueAutoplayPause() {
    if (!this._autoplayActive) return;

    this.autoplayTimer = window.setTimeout(() => {
      this.autoplayAdvance();
    }, BrandSliderComponent.AUTOPLAY_PAUSE);
  }

  getNextScrollTarget() {
    const maxRealScrollLeft = this.getMaxRealScrollLeft();

    if (this.slider.scrollLeft >= maxRealScrollLeft - 1) {
      return this.slider.scrollLeft + this.sliderItemOffset;
    }

    return Math.min(this.slider.scrollLeft + this.sliderItemOffset, maxRealScrollLeft);
  }

  autoplayAdvance() {
    if (!this._autoplayActive || this._isScrolling || !this.sliderItemOffset) {
      this.queueAutoplayPause();
      return;
    }

    this.scrollToPosition(this.getNextScrollTarget(), BrandSliderComponent.SCROLL_DURATION, () => {
      this.queueAutoplayPause();
    });
  }

  scrollToPosition(target, duration, onComplete) {
    cancelAnimationFrame(this._scrollAnimationFrame);

    if (this.reducedMotion.matches) {
      this.slider.scrollLeft = target;
      this.normalizeScrollPosition();
      this.update();
      if (onComplete) onComplete();
      return;
    }

    const start = this.slider.scrollLeft;
    const distance = target - start;

    if (distance === 0) {
      this.normalizeScrollPosition();
      this.update();
      if (onComplete) onComplete();
      return;
    }

    this._isScrolling = true;
    const startTime = performance.now();

    const step = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      this.slider.scrollLeft = start + distance * progress;

      if (progress < 1) {
        this._scrollAnimationFrame = requestAnimationFrame(step);
        return;
      }

      this._isScrolling = false;
      this.normalizeScrollPosition();
      this.update();
      if (onComplete) onComplete();
    };

    this._scrollAnimationFrame = requestAnimationFrame(step);
  }

  onButtonClick(event) {
    event.preventDefault();
    if (!this.sliderItemOffset) return;

    const maxRealScrollLeft = this.getMaxRealScrollLeft();
    let target;

    if (event.currentTarget.name === 'next') {
      target = this.getNextScrollTarget();
    } else if (this.slider.scrollLeft <= 1) {
      target = maxRealScrollLeft;
    } else {
      target = Math.max(this.slider.scrollLeft - this.sliderItemOffset, 0);
    }

    this.scrollToPosition(target, BrandSliderComponent.SCROLL_DURATION);
  }
}

if (!customElements.get('brand-slider-component')) {
  customElements.define('brand-slider-component', BrandSliderComponent);
}
