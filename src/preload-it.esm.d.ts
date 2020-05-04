declare function preloadOne<T>(url: string, done: (item: T) => void): void;
declare function updateProgressBar(item: any): void;
declare function getItemByUrl(rawUrl: string): any;
declare function fetch<T>(list: T[]): Promise<unknown>;
declare function Preload(): {
    status: any[];
    loaded: boolean;
    onprogress: (e?: any) => void;
    oncomplete: (e?: any) => void;
    onfetched: (e?: any) => void;
    fetch: typeof fetch;
    updateProgressBar: typeof updateProgressBar;
    preloadOne: typeof preloadOne;
    getItemByUrl: typeof getItemByUrl;
};
export default Preload;
