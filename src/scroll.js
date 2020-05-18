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
    /**
     * Can be provided with an existing container
     */
    constructor(options = {}) {
        super();
        this.options = options;
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
            wheelScroll: true
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
        if (this.options.wheelScroll) {
            this.onWheelHandler = this._onWheel.bind(this);
            this.config.app.view.addEventListener("wheel", this.onWheelHandler);
        }
        this.refresh();
    }
    _teardown() {
        this.config.container.removeChild(this.container);
        if (this.options.wheelScroll) {
            this.config.app.view.removeEventListener("wheel", this.onWheelHandler);
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
        const width = this.content.width +
            this.options.contentMarginX +
            (this.isScrollbarVertical ? this.options.scrollbarSize : 0);
        const height = this.content.height +
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
                .beginFill(this.options.scrollbarBackground, this.options.scrollbarBackgroundAlpha)
                .drawRect(this.options.boxWidth -
                this.options.scrollbarSize +
                this.options.scrollbarOffsetVertical, 0, this.options.scrollbarSize, this.options.boxHeight)
                .endFill();
        }
        if (this.isScrollbarHorizontal) {
            this.scrollbar
                .beginFill(this.options.scrollbarBackground, this.options.scrollbarBackgroundAlpha)
                .drawRect(0, this.options.boxHeight -
                this.options.scrollbarSize +
                this.options.scrollbarOffsetHorizontal, this.options.boxWidth, this.options.scrollbarSize)
                .endFill();
        }
        if (this.isScrollbarVertical) {
            this.scrollbar
                .beginFill(this.options.scrollbarForeground, this.options.scrollbarForegroundAlpha)
                .drawRect(this.options.boxWidth -
                this.options.scrollbarSize +
                this.options.scrollbarOffsetVertical, this.scrollbarTop, this.options.scrollbarSize, this.scrollbarHeight)
                .endFill();
        }
        if (this.isScrollbarHorizontal) {
            this.scrollbar
                .beginFill(this.options.scrollbarForeground, this.options.scrollbarForegroundAlpha)
                .drawRect(this.scrollbarLeft, this.options.boxHeight -
                this.options.scrollbarSize +
                this.options.scrollbarOffsetHorizontal, this.scrollbarWidth, this.options.scrollbarSize)
                .endFill();
        }
    }
    _onMove(e) {
        if (!this.pointerDown)
            return;
        if (this.pointerDown.type === "scrollbar")
            this._scrollbarMove(e);
        else if (this.pointerDown.type === "drag")
            this._dragMove(e);
        else
            throw new Error("no such type");
    }
    _onUp(e) {
        if (!this.pointerDown)
            return;
        if (this.pointerDown.type === "scrollbar")
            this._scrollbarUp();
        else if (this.pointerDown.type === "drag")
            this._dragUp();
        else
            throw new Error("no such type");
    }
    /**
     * handle pointer down on scrollbar
     * @param {PIXI.interaction.InteractionEvent} e
     * @private
     */
    _scrollbarDown(e) {
        if (this.pointerDown)
            return;
        this.content.interactiveChildren = false;
        const local = this.container.toLocal(e.data.global);
        if (this.isScrollbarHorizontal) {
            if (local.y > this.options.boxHeight - this.options.scrollbarSize) {
                if (local.x >= this.scrollbarLeft &&
                    local.x <= this.scrollbarLeft + this.scrollbarWidth) {
                    this.pointerDown = {
                        type: "scrollbar",
                        direction: "horizontal",
                        last: local
                    };
                }
                else {
                    if (local.x > this.scrollbarLeft) {
                        this.scrollBy(new PIXI.Point(-this.options.boxWidth, 0));
                    }
                    else {
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
                if (local.y >= this.scrollbarTop &&
                    local.y <= this.scrollbarTop + this.scrollbarHeight) {
                    this.pointerDown = {
                        type: "scrollbar",
                        direction: "vertical",
                        last: local
                    };
                }
                else {
                    if (local.y > this.scrollbarTop) {
                        this.scrollBy(new PIXI.Point(0, -this.options.boxHeight));
                    }
                    else {
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
            const fraction = ((local.x - this.pointerDown.last.x) / this.options.boxWidth) *
                (this.content.width + this.options.contentMarginX);
            this.scrollBy(new PIXI.Point(-fraction, 0));
            this.pointerDown.last = local;
        }
        else if (this.pointerDown.direction === "vertical") {
            const local = this.container.toLocal(e.data.global);
            const fraction = ((local.y - this.pointerDown.last.y) / this.options.boxHeight) *
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
        if (this.pointerDown)
            return;
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
        if (geom.distance(local, this.pointerDown.last) <= this.options.dragThreshold)
            return;
        this.content.interactiveChildren = false;
        const scrollAmount = geom.subtract(local, this.pointerDown.last);
        if (!this.isScrollbarHorizontal)
            scrollAmount.x = 0;
        if (!this.isScrollbarVertical)
            scrollAmount.y = 0;
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
    _onWheel(e) {
        if (!this.container.worldVisible)
            return;
        // Get coordinates of point and test if we touch this container
        const globalPoint = new PIXI.Point();
        this.config.app.renderer.plugins.interaction.mapPositionToPoint(globalPoint, e.clientX, e.clientY);
        if (!this.config.app.renderer.plugins.interaction.hitTest(globalPoint, this.container))
            return;
        // Finally, scroll!
        const scrollAmount = -e.deltaY;
        if (this.isScrollbarHorizontal) {
            this.scrollBy(new PIXI.Point(scrollAmount, 0));
        }
        else if (this.isScrollbarVertical) {
            this.scrollBy(new PIXI.Point(0, scrollAmount));
        }
        e.preventDefault();
    }
    scrollBy(amount, reason = "user") {
        this.scrollTo(geom.add(this.content.position, amount), reason);
    }
    scrollTo(position, reason = "user") {
        position.x = geom.clamp(position.x, this.options.boxWidth -
            (this.content.width + this.options.contentMarginX), 0);
        position.y = geom.clamp(position.y, this.options.boxHeight -
            (this.content.height + this.options.contentMarginY), 0);
        this.content.position = position;
        this._drawScrollbars();
        this.emit("moved", { reason });
    }
    get currentScroll() {
        return this.content.position;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Nyb2xsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vdHlwZXNjcmlwdC9zY3JvbGwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUFLLE1BQU0sTUFBTSxVQUFVLENBQUM7QUFDbkMsT0FBTyxLQUFLLElBQUksTUFBTSxRQUFRLENBQUM7QUFDL0IsT0FBTyxLQUFLLElBQUksTUFBTSxRQUFRLENBQUM7QUFFL0I7Ozs7OztJQU1JO0FBQ0osTUFBTSxPQUFPLFNBQVUsU0FBUSxNQUFNLENBQUMsY0FBYztJQWFsRDs7T0FFRztJQUNILFlBQW1CLFVBbUJmLEVBQUU7UUFDSixLQUFLLEVBQUUsQ0FBQztRQXBCUyxZQUFPLEdBQVAsT0FBTyxDQW1CcEI7UUFHSixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRTtZQUM1QyxPQUFPLEVBQUUsSUFBSTtZQUNiLFFBQVEsRUFBRSxHQUFHO1lBQ2IsU0FBUyxFQUFFLEdBQUc7WUFDZCxTQUFTLEVBQUUsTUFBTTtZQUNqQixTQUFTLEVBQUUsTUFBTTtZQUNqQix5QkFBeUIsRUFBRSxDQUFDO1lBQzVCLHVCQUF1QixFQUFFLENBQUM7WUFDMUIsYUFBYSxFQUFFLEVBQUU7WUFDakIsbUJBQW1CLEVBQUUsUUFBUTtZQUM3Qix3QkFBd0IsRUFBRSxDQUFDO1lBQzNCLG1CQUFtQixFQUFFLE9BQU87WUFDNUIsd0JBQXdCLEVBQUUsQ0FBQztZQUMzQixVQUFVLEVBQUUsSUFBSTtZQUNoQixhQUFhLEVBQUUsQ0FBQztZQUNoQixlQUFlLEVBQUUsSUFBSTtZQUNyQixjQUFjLEVBQUUsQ0FBQztZQUNqQixjQUFjLEVBQUUsQ0FBQztZQUNqQixXQUFXLEVBQUUsSUFBSTtTQUNsQixDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsTUFBTTtRQUNKLHlCQUF5QjtRQUN6QixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztRQUV4QixJQUFJ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