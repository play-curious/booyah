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
      scrollbarSize: 30, // width in pixels
      scrollbarBackground: 0, // background color
      scrollbarBackgroundAlpha: 0.25,
      scrollbarForeground: 0x68f1ff, // foreground color
      scrollbarForegroundAlpha: 1,
      stopPropagation: true
    });
  }

  _setup() {
    this.container = new PIXI.Container();
    this.container.interactive = true;
    this._on(this.container, "pointermove", this._scrollbarMove);
    this._on(this.container, "pointerup", this._scrollbarUp);
    this._on(this.container, "pointercancel", this._scrollbarUp);
    this._on(this.container, "pointerupoutside", this._scrollbarUp);
    this.config.container.addChild(this.container);

    // Last pointerdown event
    this.pointerDown = null;

    this.content = this.options.content || new PIXI.Container();
    this.container.addChild(this.content);

    this.scrollbar = new PIXI.Graphics();
    this.scrollbar.interactive = true;
    this._on(this.scrollbar, "pointerdown", this._scrollbarDown, this);
    this.container.addChild(this.scrollbar);

    const mask = new PIXI.Graphics();
    mask
      .beginFill(0)
      .drawRect(0, 0, this.options.boxWidth, this.options.boxHeight)
      .endFill();
    this.content.mask = mask;
    this.container.addChild(mask);

    // TODO: set interactive children = false while scrolling
    this.isScrolling = false;

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
    // TODO: update scrollbar

    this._drawScrollbars();
  }

  get isScrollbarHorizontal() {
    return this.options.overflowX === "scroll"
      ? true
      : ["hidden", "none"].indexOf(this.options.overflowX) !== -1
      ? false
      : this.content.width > this.options.boxWidth;
  }

  get isScrollbarVertical() {
    return this.options.overflowY === "scroll"
      ? true
      : ["hidden", "none"].indexOf(this.options.overflowY) !== -1
      ? false
      : this.content.height > this.options.boxHeight;
  }

  // From the same function in pixi-scrollbox
  _drawScrollbars() {
    this.scrollbar.clear();
    let options = {};
    options.left = 0;
    options.right =
      this.content.width +
      (this._isScrollbarVertical ? this.options.scrollbarSize : 0);
    options.top = 0;
    options.bottom =
      this.content.height +
      (this.isScrollbarHorizontal ? this.options.scrollbarSize : 0);
    const width =
      this.content.width +
      (this.isScrollbarVertical ? this.options.scrollbarSize : 0);
    const height =
      this.content.height +
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

  /**
   * handle pointer down on scrollbar
   * @param {PIXI.interaction.InteractionEvent} e
   * @private
   */
  _scrollbarDown(e) {
    this.content.interactiveChildren = false;

    const local = this.container.toLocal(e.data.global);
    if (this.isScrollbarHorizontal) {
      if (local.y > this.options.boxHeight - this.options.scrollbarSize) {
        if (
          local.x >= this.scrollbarLeft &&
          local.x <= this.scrollbarLeft + this.scrollbarWidth
        ) {
          this.pointerDown = { type: "horizontal", last: local };
        } else {
          if (local.x > this.scrollbarLeft) {
            this.content.x += this.content.worldScreenWidth;
            this.refresh();
          } else {
            this.content.x -= this.content.worldScreenWidth;
            this.refresh();
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
          local.y <= this.scrollbarTop + this.scrollbarWidth
        ) {
          this.pointerDown = { type: "vertical", last: local };
        } else {
          if (local.y > this.scrollbarTop) {
            this.content.y += this.content.worldScreenHeight;
            this.refresh();
          } else {
            this.content.y -= this.content.worldScreenHeight;
            this.refresh();
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
    if (this.pointerDown) {
      if (this.pointerDown.type === "horizontal") {
        const local = this.container.toLocal(e.data.global);
        // this.content.x -= local.x - this.pointerDown.last.x;
        // this.refresh();
        this.scrollTo(
          new PIXI.Point(
            this.content.x - (local.x - this.pointerDown.last.x),
            this.content.y
          )
        );
        this.pointerDown.last = local;
      } else if (this.pointerDown.type === "vertical") {
        const local = this.container.toLocal(e.data.global);
        // this.content.y -= local.y - this.pointerDown.last.y;
        // this.refresh();
        this.scrollTo(
          new PIXI.Point(
            this.content.x,
            this.content.y - (local.y - this.pointerDown.last.y)
          )
        );
        this.pointerDown.last = local;
      }
      if (this.options.stopPropagation) {
        e.stopPropagation();
      }
    }
  }

  scrollTo(position) {
    position.x = geom.clamp(
      position.x,
      this.options.boxWidth - this.content.width,
      0
    );
    position.y = geom.clamp(
      position.y,
      this.options.boxHeight - this.content.height,
      0
    );
    this.content.position = position;

    this.refresh();
  }

  /**
   * handle pointer down on scrollbar
   * @private
   */
  _scrollbarUp() {
    this.pointerDown = null;

    this.content.interactiveChildren = true;
  }
}
