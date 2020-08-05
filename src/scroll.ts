import * as PIXI from "pixi.js";

import * as entity from "./entity";
import * as geom from "./geom";
import * as util from "./util";

/**
 * Based on David Fig's pixi-scrollbox https://github.com/davidfig/pixi-scrollbox/, but adapted to Booyah
 *
 * Events:
 *  moved ({ reason })
 *  refreshed
 **/
export class Scrollbox extends entity.ParallelEntity {
  public pointerDown: any;
  public container: PIXI.Container;
  public content: PIXI.Container;
  public scrollbar: PIXI.Graphics;
  public onWheelHandler: () => void;
  public _isScrollbarVertical: boolean;
  public scrollbarTop: number;
  public scrollbarHeight: number;
  public scrollbarLeft: number;
  public scrollbarWidth: number;

  /**
   * Can be provided with an existing container
   */
  constructor(
    public options: {
      content?: any;
      boxWidth?: number;
      boxHeight?: number;
      overflowX?: number | string;
      overflowY?: number | string;
      scrollbarOffsetHorizontal?: number;
      scrollbarOffsetVertical?: number;
      scrollbarSize?: number;
      scrollbarBackground?: number;
      scrollbarBackgroundAlpha?: number;
      scrollbarForeground?: number;
      scrollbarForegroundAlpha?: number;
      dragScroll?: boolean;
      dragThreshold?: number;
      stopPropagation?: boolean;
      contentMarginX?: number;
      contentMarginY?: number;
      wheelScroll?: boolean;
    } = {}
  ) {
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
      contentMarginY: 0,
      wheelScroll: true,
    });
  }

  _setup() {
    // Last pointerdown event
    this.pointerDown = null;

    this.container = new PIXI.Container();
    this.container.interactive = true;
    this._on(this.container, "pointermove", this._onMove as any);
    this._on(this.container, "pointerup", this._onUp as any);
    this._on(this.container, "pointercancel", this._onUp as any);
    this._on(this.container, "pointerupoutside", this._onUp as any);
    this._entityConfig.container.addChild(this.container);

    if (this.options.dragScroll) {
      const dragBackground = new PIXI.Graphics();
      dragBackground
        .beginFill(0)
        .drawRect(0, 0, this.options.boxWidth, this.options.boxHeight)
        .endFill();
      dragBackground.alpha = 0;

      this._on(this.container, "pointerdown", this._dragDown as any);
      this.container.addChild(dragBackground);
    }

    this.content = this.options.content || new PIXI.Container();
    this.container.addChild(this.content);

    this.scrollbar = new PIXI.Graphics();
    this.scrollbar.interactive = true;
    this._on(this.scrollbar, "pointerdown", this._scrollbarDown as any);
    this.container.addChild(this.scrollbar);

    const mask = new PIXI.Graphics();
    mask
      .beginFill(0)
      .drawRect(0, 0, this.options.boxWidth, this.options.boxHeight)
      .endFill();
    this.content.mask = mask;
    this.container.addChild(mask);

    if (this.options.wheelScroll) {
      this.onWheelHandler = this._onWheel.bind(this);
      this._entityConfig.app.view.addEventListener(
        "wheel",
        this.onWheelHandler
      );
    }

    this.refresh();
  }

  _teardown() {
    this._entityConfig.container.removeChild(this.container);

    if (this.options.wheelScroll) {
      this._entityConfig.app.view.removeEventListener(
        "wheel",
        this.onWheelHandler
      );
    }
  }

  /** Call when container contents have changed  */
  refresh() {
    this._drawScrollbars();

    this.emit("refreshed");
  }

  get isScrollbarHorizontal() {
    return this.options.overflowX === "scroll"
      ? true
      : ["hidden", "none"].indexOf(String(this.options.overflowX)) !== -1
      ? false
      : this.content.width + this.options.contentMarginX >
        this.options.boxWidth;
  }

  get isScrollbarVertical() {
    return this.options.overflowY === "scroll"
      ? true
      : ["hidden", "none"].indexOf(String(this.options.overflowY)) !== -1
      ? false
      : this.content.height + this.options.contentMarginY >
        this.options.boxHeight;
  }

  // From the same function in pixi-scrollbox
  _drawScrollbars() {
    this.scrollbar.clear();
    let options: any = {};
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

  _onMove(e: PIXI.InteractionEvent) {
    if (!this.pointerDown) return;

    if (this.pointerDown.type === "scrollbar") this._scrollbarMove(e);
    else if (this.pointerDown.type === "drag") this._dragMove(e);
    else throw new Error("no such type");
  }

  _onUp(e: PIXI.InteractionEvent) {
    if (!this.pointerDown) return;

    if (this.pointerDown.type === "scrollbar") this._scrollbarUp();
    else if (this.pointerDown.type === "drag") this._dragUp();
    else throw new Error("no such type");
  }

  /**
   * handle pointer down on scrollbar
   * @param {PIXI.InteractionEvent} e
   * @private
   */
  _scrollbarDown(e: PIXI.InteractionEvent) {
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
            last: local,
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
            last: local,
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
   * @param {PIXI.InteractionEvent} e
   * @private
   */
  _scrollbarMove(e: PIXI.InteractionEvent) {
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
   * @param {PIXI.InteractionEvent} e
   * @private
   */
  _dragDown(e: PIXI.InteractionEvent) {
    if (this.pointerDown) return;

    const local = this.container.toLocal(e.data.global);
    this.pointerDown = { type: "drag", last: local };

    // if (this.options.stopPropagation) {
    //   e.stopPropagation();
    // }
  }

  /**
   * handle pointer move on content
   * @param {PIXI.InteractionEvent} e
   * @private
   */

  _dragMove(e: PIXI.InteractionEvent) {
    const local = this.container.toLocal(e.data.global) as PIXI.Point;
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

  /**
   * handle wheel events
   * @param {WheelEvent} e
   */
  _onWheel(e: WheelEvent) {
    if (!this.container.worldVisible) return;

    // Get coordinates of point and test if we touch this container
    const globalPoint = new PIXI.Point();
    this._entityConfig.app.renderer.plugins.interaction.mapPositionToPoint(
      globalPoint,
      e.clientX,
      e.clientY
    );
    if (
      !this._entityConfig.app.renderer.plugins.interaction.hitTest(
        globalPoint,
        this.container
      )
    )
      return;

    // Finally, scroll!
    const scrollAmount = -e.deltaY;
    if (this.isScrollbarHorizontal) {
      this.scrollBy(new PIXI.Point(scrollAmount, 0));
    } else if (this.isScrollbarVertical) {
      this.scrollBy(new PIXI.Point(0, scrollAmount));
    }

    e.preventDefault();
  }

  scrollBy(amount: PIXI.Point, reason = "user") {
    this.scrollTo(
      geom.add(this.content.position as PIXI.Point, amount),
      reason
    );
  }

  scrollTo(position: PIXI.Point, reason = "user") {
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

    this._drawScrollbars();

    this.emit("moved", { reason });
  }

  get currentScroll() {
    return this.content.position;
  }
}
