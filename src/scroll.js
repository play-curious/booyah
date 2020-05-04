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
     * @param {WheelEvent} event
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Nyb2xsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vdHlwZXNjcmlwdC9zY3JvbGwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUFLLE1BQU0sTUFBTSxVQUFVLENBQUM7QUFDbkMsT0FBTyxLQUFLLElBQUksTUFBTSxRQUFRLENBQUM7QUFDL0IsT0FBTyxLQUFLLElBQUksTUFBTSxRQUFRLENBQUM7QUFFL0I7Ozs7OztJQU1JO0FBQ0osTUFBTSxPQUFPLFNBQVUsU0FBUSxNQUFNLENBQUMsY0FBYztJQWFsRDs7T0FFRztJQUNILFlBQW1CLFVBQWMsRUFBRTtRQUNqQyxLQUFLLEVBQUUsQ0FBQztRQURTLFlBQU8sR0FBUCxPQUFPLENBQVM7UUFHakMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsRUFBRSxPQUFPLEVBQUU7WUFDNUMsT0FBTyxFQUFFLElBQUk7WUFDYixRQUFRLEVBQUUsR0FBRztZQUNiLFNBQVMsRUFBRSxHQUFHO1lBQ2QsU0FBUyxFQUFFLE1BQU07WUFDakIsU0FBUyxFQUFFLE1BQU07WUFDakIseUJBQXlCLEVBQUUsQ0FBQztZQUM1Qix1QkFBdUIsRUFBRSxDQUFDO1lBQzFCLGFBQWEsRUFBRSxFQUFFO1lBQ2pCLG1CQUFtQixFQUFFLFFBQVE7WUFDN0Isd0JBQXdCLEVBQUUsQ0FBQztZQUMzQixtQkFBbUIsRUFBRSxPQUFPO1lBQzVCLHdCQUF3QixFQUFFLENBQUM7WUFDM0IsVUFBVSxFQUFFLElBQUk7WUFDaEIsYUFBYSxFQUFFLENBQUM7WUFDaEIsZUFBZSxFQUFFLElBQUk7WUFDckIsY0FBYyxFQUFFLENBQUM7WUFDakIsY0FBYyxFQUFFLENBQUM7WUFDakIsV0FBVyxFQUFFLElBQUk7U0FDbEIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELE1BQU07UUFDSix5QkFBeUI7UUFDekIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7UUFFeEIsSUFBSSxD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