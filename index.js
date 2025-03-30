/**
 * @typedef {import("express").Request} Express.Request
 * @typedef {import("express").Response} Express.Response
 * @typedef {import(".").Options} Minify.Options
 */

const csso = require("csso"),
    fs = require("fs/promises"),
    path = require("path"),
    terser = require("terser");

// MARK: Minify
/**
* Minifies and combines the specified files.
*/
class Minify {
    /** @type {Minify.Options} */
    static #options = {
        wwwRoot: void 0,
        jsRoot: "/js/",
        cssRoot: "/css/"
    };

    static #nameCache = {};

    // MARK: static #validateSetup
    /**
     * Validates that the setup function has been called and that the options are valid.
     * @returns {void}
     * @throws {Error} If the options are not valid.
     */
    static #validateSetup() {
        if (!Minify.#options || !Minify.#options.wwwRoot || !Minify.#options.jsRoot || !Minify.#options.cssRoot) {
            throw new Error("node-minify is not setup properly. Please call the setup function and provide the wwwRoot, jsRoot, and cssRoot options. See README for details.");
        }
    }

    // MARK: static setup
    /**
     * Sets up options for minification.
     * @param {Minify.Options} options The options to setup minification with.
     * @returns {void}
     */
    static setup(options) {
        Minify.#options = options;
    }

    // MARK: static async cssHandler
    /**
     * The Express handler that returns the minified version of the CSS file passed.
     * @param {Express.Request} req The request.
     * @param {Express.Response} res The response.
     * @param {Function} next The next function.
     * @returns {Promise<void>} A promise that resolves when the handler has been run.
     */
    static async cssHandler(req, res, next) {
        Minify.#validateSetup();

        if (!req.query.files || req.query.files === "" || typeof req.query.files !== "string") {
            return next();
        }

        const key = `${Minify.#options.caching && Minify.#options.caching.prefix && `${Minify.#options.caching.prefix}:` || ""}minify:${req.query.files}`;

        let cache;
        if (Minify.#options.caching) {
            cache = await Minify.#options.caching.get(key);

            if (cache) {
                res.status(200).type("css").send(cache);
                return void 0;
            }
        }

        /** @type {string[]} */
        const files = req.query.files.split(",");

        try {
            let str = "";

            try {
                for (const file of files) {
                    if (!file.startsWith("/")) {
                        return next();
                    }

                    const redirect = Minify.#options.redirects && Minify.#options.redirects[file] || void 0;

                    let filePath;

                    if (redirect) {
                        filePath = redirect.path;
                    } else {
                        filePath = path.join(Minify.#options.wwwRoot, file);

                        if (!filePath.startsWith(Minify.#options.wwwRoot)) {
                            return next();
                        }
                    }

                    let data = await fs.readFile(filePath, "utf8");

                    if (redirect && redirect.replace) {
                        for (const find of Object.keys(redirect.replace)) {
                            data = data.split(find).join(redirect.replace[find]);
                        }
                    }

                    str = `${str}${data}`;
                }
            } catch (err) {
                if (err.code === "ENOENT") {
                    return next();
                }

                return next(err);
            }

            const output = csso.minify(str);

            if (Minify.#options.caching) {
                Minify.#options.caching.set(key, output.css);
            }

            res.status(200).type("css").send(output.css);
            return void 0;
        } catch (err) {
            return next(err);
        }
    }

    // MARK: static async jsHandler
    /**
     * The Express handler that returns the minified version of the JavaScript file passed.
     * @param {Express.Request} req The request.
     * @param {Express.Response} res The response.
     * @param {Function} next The next function.
     * @returns {Promise<void>} A promise that resolves when the handler has been run.
     */
    static async jsHandler(req, res, next) {
        Minify.#validateSetup();

        if (!req.query.files || req.query.files === "" || typeof req.query.files !== "string") {
            return next();
        }

        const key = `${Minify.#options.caching && Minify.#options.caching.prefix && `${Minify.#options.caching.prefix}:` || ""}minify:${req.query.files}`;

        let cache;
        if (Minify.#options.caching) {
            cache = await Minify.#options.caching.get(key);

            if (cache) {
                res.status(200).type("js").send(cache);
                return void 0;
            }
        }

        /** @type {string[]} */
        const files = req.query.files.split(",");

        try {
            /** @type {Object<string, string>} */
            const code = {};

            try {
                for (const file of files) {
                    if (!file.startsWith("/")) {
                        return next();
                    }

                    const redirect = Minify.#options.redirects && Minify.#options.redirects[file] || void 0;

                    let filePath;

                    if (redirect) {
                        filePath = redirect.path;
                    } else {
                        filePath = path.join(Minify.#options.wwwRoot, file);

                        if (!filePath.startsWith(Minify.#options.wwwRoot)) {
                            return next();
                        }
                    }

                    code[file] = await fs.readFile(filePath, "utf8");

                    if (redirect && redirect.replace) {
                        for (const find of Object.keys(redirect.replace)) {
                            code[file] = code[file].split(find).join(redirect.replace[find]);
                        }
                    }
                }
            } catch (err) {
                if (err.code === "ENOENT") {
                    return next();
                }

                return next(err);
            }

            const output = await terser.minify(code, {nameCache: Minify.#nameCache});

            if (Minify.#options.caching) {
                Minify.#options.caching.set(key, output.code);
            }

            res.status(200).type("js").send(output.code);
            return void 0;
        } catch (err) {
            return next(err);
        }
    }

    // MARK: static combine
    /**
     * Provides the HTML needed to serve combined and minified files.
     * @param {string[]} files The list of filenames to combine.
     * @param {"js" | "css"} type The file type to combine.
     * @returns {string} The combined filename.
     */
    static combine(files, type) {
        Minify.#validateSetup();

        if (Minify.#options.disableTagCombining) {
            switch (type) {
                case "js":
                    return files.map((f) => `<script src="${f}"></script>`).join("");
                case "css":
                    return files.map((f) => `<link rel="stylesheet" href="${f}" />`).join("");
                default:
                    return "";
            }
        } else {
            switch (type) {
                case "js":
                    return `<script src="${Minify.#options.jsRoot}?files=${files.join(",")}"></script>`;
                case "css":
                    return `<link rel="stylesheet" href="${Minify.#options.cssRoot}?files=${files.join(",")}" />`;
                default:
                    return "";
            }
        }
    }
}

module.exports = Minify;
