import * as entity from "./entity.js";
import * as geom from "./geom.js";
import * as util from "./util.js";

/**
 * Based on David Fig's pixi-scrollbox https://github.com/davidfig/pixi-scrollbox/, but adapted to Booyah
 **/
export class Scrollbox extends entity.ParallelEntity {
  /**
   * Can be provided with an existing container
   */
  constructor(options = {}) {
    super();

    this.options = util.setupOptions({}, options, {
      content: null,
      boxWidth: 100,
      boxHeight: 100,
      overflowX: "auto",
      overflowY: "auto",
      scrollbarOffsetHorizontal: 0,
      scrollbarOffsetVertical: 0,
      scrollbarSize: 10,
      scrollbarBackground: 14540253,
      scrollbarBackgroundAlpha: 1,
      scrollbarForeground: 8947848,
      scrollbarForegroundAlpha: 1,
      dragScroll: true,
      dragThreshold: 5,
      stopPropagation: true,
      contentMarginX: 0,
      contentMarginY: 0
    });
  }

  _setup() {
    // Last pointerdown event
    this.pointerDown = null;

    this.container = new PIXI.Container();
    this.container.interactive = true;
    this._on(this.container, "pointermove", this._onMove);
    this._on(this.container, "pointerup", this._onUp);
    this._on(this.container, "pointercancel", this._onUp);
    this._on(this.container, "pointerupoutside", this._onUp);
    this.config.container.addChild(this.container);

    if (this.options.dragScroll) {
      const dragBackground = new PIXI.Graphics();
      dragBackground
        .beginFill(0)
        .drawRect(0, 0, this.options.boxWidth, this.options.boxHeight)
        .endFill();
      dragBackground.alpha = 0;

      this._on(this.container, "pointerdown", this._dragDown);
      this.container.addChild(dragBackground);
    }

    this.content = this.options.content || new PIXI.Container();
    this.container.addChild(this.content);

    this.scrollbar = new PIXI.Graphics();
    this.scrollbar.interactive = true;
    this._on(this.scrollbar, "pointerdown", this._scrollbarDown);
    this.container.addChild(this.scrollbar);

    const mask = new PIXI.Graphics();
    mask
      .beginFill(0)
      .drawRect(0, 0, this.options.boxWidth, this.options.boxHeight)
      .endFill();
    this.content.mask = mask;
    this.container.addChild(mask);

    this.refresh();
  }

  _update() {
    // this.scrollbox.updateLoop();
  }

  _teardown() {
    this.config.container.removeChild(this.container);
  }

  /** Call when container contents have changed  */
  refresh() {
    this._drawScrollbars();
  }

  get isScrollbarHorizontal() {
    return this.options.overflowX === "scroll"
      ? true
      : ["hidden", "none"].indexOf(this.options.overflowX) !== -1
      ? false
      : this.content.width + this.options.contentMarginX >
        this.options.boxWidth;
  }

  get isScrollbarVertical() {
    return this.options.overflowY === "scroll"
      ? true
      : ["hidden", "none"].indexOf(this.options.overflowY) !== -1
      ? false
      : this.content.height + this.options.contentMarginY >
        this.options.boxHeight;
  }

  // From the same function in pixi-scrollbox
  _drawScrollbars() {
    this.scrollbar.clear();
    let options = {};
    options.left = 0;
    options.right =
      this.content.width +
      this.options.contentMarginX +
      (this._isScrollbarVertical ? this.options.scrollbarSize : 0);
    options.top = 0;
    options.bottom =
      this.content.height +
      this.options.contentMarginY +
      (this.isScrollbarHorizontal ? this.options.scrollbarSize : 0);
    const width =
      this.content.width +
      this.options.contentMarginX +
      (this.isScrollbarVertical ? this.options.scrollbarSize : 0);
    const height =
      this.content.height +
      this.options.contentMarginY +
      (this.isScrollbarHorizontal ? this.options.scrollbarSize : 0);
    this.scrollbarTop = (-this.content.y / height) * this.options.boxHeight;
    this.scrollbarTop = this.scrollbarTop < 0 ? 0 : this.scrollbarTop;
    this.scrollbarHeight =
      (this.options.boxHeight / height) * this.options.boxHeight;
    this.scrollbarHeight =
      this.scrollbarTop + this.scrollbarHeight > this.options.boxHeight
        ? this.options.boxHeight - this.scrollbarTop
        : this.scrollbarHeight;
    this.scrollbarLeft = (-this.content.x / width) * this.options.boxWidth;
    this.scrollbarLeft = this.scrollbarLeft < 0 ? 0 : this.scrollbarLeft;
    this.scrollbarWidth =
      (this.options.boxWidth / width) * this.options.boxWidth;
    this.scrollbarWidth =
      this.scrollbarWidth + this.scrollbarLeft > this.options.boxWidth
        ? this.options.boxWidth - this.scrollbarLeft
        : this.scrollbarWidth;
    if (this.isScrollbarVertical) {
      this.scrollbar
        .beginFill(
          this.options.scrollbarBackground,
          this.options.scrollbarBackgroundAlpha
        )
        .drawRect(
          this.options.boxWidth -
            this.options.scrollbarSize +
            this.options.scrollbarOffsetVertical,
          0,
          this.options.scrollbarSize,
          this.options.boxHeight
        )
        .endFill();
    }
    if (this.isScrollbarHorizontal) {
      this.scrollbar
        .beginFill(
          this.options.scrollbarBackground,
          this.options.scrollbarBackgroundAlpha
        )
        .drawRect(
          0,
          this.options.boxHeight -
            this.options.scrollbarSize +
            this.options.scrollbarOffsetHorizontal,
          this.options.boxWidth,
          this.options.scrollbarSize
        )
        .endFill();
    }
    if (this.isScrollbarVertical) {
      this.scrollbar
        .beginFill(
          this.options.scrollbarForeground,
          this.options.scrollbarForegroundAlpha
        )
        .drawRect(
          this.options.boxWidth -
            this.options.scrollbarSize +
            this.options.scrollbarOffsetVertical,
          this.scrollbarTop,
          this.options.scrollbarSize,
          this.scrollbarHeight
        )
        .endFill();
    }
    if (this.isScrollbarHorizontal) {
      this.scrollbar
        .beginFill(
          this.options.scrollbarForeground,
          this.options.scrollbarForegroundAlpha
        )
        .drawRect(
          this.scrollbarLeft,
          this.options.boxHeight -
            this.options.scrollbarSize +
            this.options.scrollbarOffsetHorizontal,
          this.scrollbarWidth,
          this.options.scrollbarSize
        )
        .endFill();
    }
  }

  _onMove(e) {
    if (!this.pointerDown) return;

    if (this.pointerDown.type === "scrollbar") this._scrollbarMove(e);
    else if (this.pointerDown.type === "drag") this._dragMove(e);
    else throw new Error("no such type");
  }

  _onUp(e) {
    if (!this.pointerDown) return;

    if (this.pointerDown.type === "scrollbar") this._scrollbarUp(e);
    else if (this.pointerDown.type === "drag") this._dragUp(e);
    else throw new Error("no such type");
  }

  /**
   * handle pointer down on scrollbar
   * @param {PIXI.interaction.InteractionEvent} e
   * @private
   */
  _scrollbarDown(e) {
    if (this.pointerDown) return;

    this.content.interactiveChildren = false;

    const local = this.container.toLocal(e.data.global);
    if (this.isScrollbarHorizontal) {
      if (local.y > this.options.boxHeight - this.options.scrollbarSize) {
        if (
          local.x >= this.scrollbarLeft &&
          local.x <= this.scrollbarLeft + this.scrollbarWidth
        ) {
          this.pointerDown = {
            type: "scrollbar",
            direction: "horizontal",
            last: local
          };
        } else {
          if (local.x > this.scrollbarLeft) {
            this.scrollBy(new PIXI.Point(-this.options.boxWidth, 0));
          } else {
            this.scrollBy(new PIXI.Point(this.options.boxWidth, 0));
          }
        }
        if (this.options.stopPropagation) {
          e.stopPropagation();
        }
        return;
      }
    }
    if (this.isScrollbarVertical) {
      if (local.x > this.options.boxWidth - this.options.scrollbarSize) {
        if (
          local.y >= this.scrollbarTop &&
          local.y <= this.scrollbarTop + this.scrollbarHeight
        ) {
          this.pointerDown = {
            type: "scrollbar",
            direction: "vertical",
            last: local
          };
        } else {
          if (local.y > this.scrollbarTop) {
            this.scrollBy(new PIXI.Point(0, -this.options.boxHeight));
          } else {
            this.scrollBy(new PIXI.Point(0, this.options.boxHeight));
          }
        }
        if (this.options.stopPropagation) {
          e.stopPropagation();
        }
        return;
      }
    }
  }

  /**
   * handle pointer move on scrollbar
   * @param {PIXI.interaction.InteractionEvent} e
   * @private
   */
  _scrollbarMove(e) {
    if (this.pointerDown.direction === "horizontal") {
      const local = this.container.toLocal(e.data.global);
      const fraction =
        ((local.x - this.pointerDown.last.x) / this.options.boxWidth) *
        (this.content.width + this.options.contentMarginX);
      this.scrollBy(new PIXI.Point(-fraction, 0));
      this.pointerDown.last = local;
    } else if (this.pointerDown.direction === "vertical") {
      const local = this.container.toLocal(e.data.global);
      const fraction =
        ((local.y - this.pointerDown.last.y) / this.options.boxHeight) *
        (this.content.height + this.options.contentMarginY);
      this.scrollBy(new PIXI.Point(0, -fraction));
      this.pointerDown.last = local;
    }

    if (this.options.stopPropagation) {
      e.stopPropagation();
    }
  }

  /**
   * handle pointer up on scrollbar
   * @private
   */
  _scrollbarUp() {
    this.pointerDown = null;

    this.content.interactiveChildren = true;
  }

  /**
   * handle pointer down on content
   * @param {PIXI.interaction.InteractionEvent} e
   * @private
   */
  _dragDown(e) {
    if (this.pointerDown) return;

    const local = this.container.toLocal(e.data.global);
    this.pointerDown = { type: "drag", last: local };

    // if (this.options.stopPropagation) {
    //   e.stopPropagation();
    // }
  }

  /**
   * handle pointer move on content
   * @param {PIXI.interaction.InteractionEvent} e
   * @private
   */

  _dragMove(e) {
    const local = this.container.toLocal(e.data.global);
    if (
      geom.distance(local, this.pointerDown.last) <= this.options.dragThreshold
    )
      return;

    this.content.interactiveChildren = false;

    const scrollAmount = geom.subtract(local, this.pointerDown.last);
    if (!this.isScrollbarHorizontal) scrollAmount.x = 0;
    if (!this.isScrollbarVertical) scrollAmount.y = 0;

    this.scrollBy(scrollAmount);

    this.pointerDown.last = local;

    // if (this.options.stopPropagation) {
    //   e.stopPropagation();
    // }
  }

  /**
   * handle pointer up on content
   * @private
   */
  _dragUp() {
    this.pointerDown = null;

    this.content.interactiveChildren = true;
  }

  scrollBy(amount) {
    this.scrollTo(geom.add(this.content.position, amount));
  }

  scrollTo(position) {
    position.x = geom.clamp(
      position.x,
      this.options.boxWidth -
        (this.content.width + this.options.contentMarginX),
      0
    );
    position.y = geom.clamp(
      position.y,
      this.options.boxHeight -
        (this.content.height + this.options.contentMarginY),
      0
    );
    this.content.position = position;

    this.refresh();
  }
}
