import * as entity from "./entity";
/**
 * Based on David Fig's pixi-scrollbox https://github.com/davidfig/pixi-scrollbox/, but adapted to Booyah
 *
 * Events:
 *  moved ({ reason })
 *  refreshed
 **/
export declare class Scrollbox extends entity.ParallelEntity {
    options: any;
    pointerDown: any;
    container: PIXI.Container;
    content: PIXI.Container;
    scrollbar: PIXI.Graphics;
    onWheelHandler: () => void;
    _isScrollbarVertical: boolean;
    scrollbarTop: number;
    scrollbarHeight: number;
    scrollbarLeft: number;
    scrollbarWidth: number;
    /**
     * Can be provided with an existing container
     */
    constructor(options?: any);
    _setup(): void;
    _teardown(): void;
    /** Call when container contents have changed  */
    refresh(): void;
    get isScrollbarHorizontal(): boolean;
    get isScrollbarVertical(): boolean;
    _drawScrollbars(): void;
    _onMove(e: PIXI.interaction.InteractionEvent): void;
    _onUp(e: PIXI.interaction.InteractionEvent): void;
    /**
     * handle pointer down on scrollbar
     * @param {PIXI.interaction.InteractionEvent} e
     * @private
     */
    _scrollbarDown(e: PIXI.interaction.InteractionEvent): void;
    /**
     * handle pointer move on scrollbar
     * @param {PIXI.interaction.InteractionEvent} e
     * @private
     */
    _scrollbarMove(e: PIXI.interaction.InteractionEvent): void;
    /**
     * handle pointer up on scrollbar
     * @private
     */
    _scrollbarUp(): void;
    /**
     * handle pointer down on content
     * @param {PIXI.interaction.InteractionEvent} e
     * @private
     */
    _dragDown(e: any): void;
    /**
     * handle pointer move on content
     * @param {PIXI.interaction.InteractionEvent} e
     * @private
     */
    _dragMove(e: PIXI.interaction.InteractionEvent): void;
    /**
     * handle pointer up on content
     * @private
     */
    _dragUp(): void;
    /**
     * handle wheel events
     * @param {WheelEvent} event
     */
    _onWheel(e: WheelEvent): void;
    scrollBy(amount: PIXI.Point, reason?: string): void;
    scrollTo(position: PIXI.Point, reason?: string): void;
    get currentScroll(): PIXI.IPoint;
}
