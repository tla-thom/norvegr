class BrandSliderComponent extends HTMLElement {
  connectedCallback() {
    if (this._brandSliderReady) return;
    this._brandSliderReady = true;

    this.slider = this.querySelector('[id^="Slider-"]');
    this.sliderItems = this.querySelectorAll('[id^="Slide-"]');
    this.currentPageElement = this.querySelector('.slider-counter--current');
    this.pageTotalElement = this.querySelector('.slider-counter--total');
    this.prevButton = this.querySelector('button[name="previous"]');
    this.nextButton = this.querySelector('button[name="next"]');

    if (!this.slider || !this.nextButton) return;

    this.initPages();
    const resizeObserver = new ResizeObserver(() => this.initPages());
    resizeObserver.observe(this.slider);

    this.slider.addEventListener('scroll', () => this.update());
    this.prevButton.addEventListener('click', (event) => this.onButtonClick(event));
    this.nextButton.addEventListener('click', (event) => this.onButtonClick(event));
  }

  initPages() {
    this.sliderItems = this.querySelectorAll('[id^="Slide-"]');
    this.sliderItemsToShow = Array.from(this.sliderItems).filter((element) => element.clientWidth > 0);
    if (this.sliderItemsToShow.length < 2) return;

    this.sliderItemOffset = this.sliderItemsToShow[1].offsetLeft - this.sliderItemsToShow[0].offsetLeft;
    this.slidesPerPage = Math.floor(this.slider.clientWidth / this.sliderItemOffset) || 1;
    this.totalPages = Math.max(1, this.sliderItemsToShow.length - this.slidesPerPage + 1);
    this.update();
  }

  getMaxScrollLeft() {
    return Math.max(0, this.slider.scrollWidth - this.slider.clientWidth);
  }

  update() {
    if (!this.slider || !this.nextButton) return;

    const maxScrollLeft = this.getMaxScrollLeft();
    const previousPage = this.currentPage;

    if (maxScrollLeft > 0 && this.slider.scrollLeft >= maxScrollLeft - 1) {
      this.currentPage = this.totalPages;
    } else {
      this.currentPage = Math.round(this.slider.scrollLeft / this.sliderItemOffset) + 1;
    }

    this.currentPage = Math.min(Math.max(this.currentPage, 1), this.totalPages);

    if (this.currentPageElement && this.pageTotalElement) {
      this.currentPageElement.textContent = this.currentPage;
      this.pageTotalElement.textContent = this.totalPages;
    }

    if (this.currentPage <= 1) {
      this.prevButton.setAttribute('disabled', 'disabled');
    } else {
      this.prevButton.removeAttribute('disabled');
    }

    if (this.currentPage >= this.totalPages) {
      this.nextButton.setAttribute('disabled', 'disabled');
    } else {
      this.nextButton.removeAttribute('disabled');
    }

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
    const maxScrollLeft = this.getMaxScrollLeft();

    if (event.currentTarget.name === 'next') {
      this.slideScrollPosition = Math.min(this.slider.scrollLeft + this.sliderItemOffset, maxScrollLeft);
    } else {
      this.slideScrollPosition = Math.max(this.slider.scrollLeft - this.sliderItemOffset, 0);
    }

    this.slider.scrollTo({ left: this.slideScrollPosition, behavior: 'smooth' });
  }
}

if (!customElements.get('brand-slider-component')) {
  customElements.define('brand-slider-component', BrandSliderComponent);
}
