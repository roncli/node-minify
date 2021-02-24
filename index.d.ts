declare module Minify {
    type Options = {
        caching?: {
            get: (key: string) => any | Promise<any>
            set: (key: string, value: any) => void | Promise<void>
            prefix?: string
        },
        redirects?: {
            path: string
            contentType: string
        }
        disableTagCombining?: boolean
        wwwRoot: string
        jsRoot: string
        cssRoot: string
    }
}

declare class Minify {
    /**
     * Sets up options for minification.
     * @param {Minify.Options} options The options to setup minification with.
     * @returns {void}
     */
    static setup(options: Minify.Options): void

    /**
     * The Express handler that returns the minified version of the CSS file passed.
     * @param {Express.Request} req The request.
     * @param {Express.Response} res The response.
     * @param {Function} next The next function.
     * @returns {Promise<void>} A promise that resolves when the handler has been run.
     */
    static cssHandler(req: Express.Request, res: Express.Response, next: Function): Promise<void>

    /**
     * The Express handler that returns the minified version of the JavaScript file passed.
     * @param {Express.Request} req The request.
     * @param {Express.Response} res The response.
     * @param {Function} next The next function.
     * @returns {Promise<void>} A promise that resolves when the handler has been run.
     */
    static jsHandler(req: Express.Request, res: Express.Response, next: Function): Promise<void>

    /**
     * Provides the HTML needed to serve combined and minified files.
     * @param {string[]} files The list of filenames to combine.
     * @param {"js" | "css"} type The file type to combine.
     * @returns {string} The combined filename.
     */
    static combine(files: string[], type: "js" | "css"): string
}

export = Minify
