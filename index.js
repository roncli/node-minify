/**
 * @typedef {import("express").Request} Express.Request
 * @typedef {import("express").Response} Express.Response
 * @typedef {import(".").Options} Minify.Options
 */

const csso = require("csso"),
    fs = require("fs/promises"),
    HtmlMinifierTerser = require("html-minifier-terser"),
    path = require("path"),
    terser = require("terser");

const placeholderMatch = /__HTMLMIN_PLACEHOLDER_(?<index>\d+)__/g;

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

    // MARK: static async #extractTemplates
    /**
     * Extracts template literals from a string and replaces them with placeholders.
     * @param {string} str The string to extract templates from.
     * @param {string[]} placeholders The array to store the extracted templates.
     * @returns {Promise<string>} The string with templates replaced by placeholders.
     */
    static async #extractTemplates(str, placeholders) {
        let result = "";
        let i = 0;
        while (i < str.length) {
            const start = str.indexOf("${", i);
            if (start === -1) {
                result += str.slice(i);
                break;
            }
            result += str.slice(i, start);
            let fragment = "${";
            let depth = 1;
            let j = start + 2;
            while (j < str.length && depth > 0) {
                const char = str[j];
                if (char === "'" || char === "\"" || char === "`") {
                    const quote = char;
                    fragment += char;
                    j++;
                    while (j < str.length) {
                        fragment += str[j];
                        if (str[j] === "\\" && j + 1 < str.length) {
                            j++;
                            fragment += str[j];
                            j++;
                            continue;
                        }
                        if (str[j] === quote) {
                            j++;
                            break;
                        }
                        j++;
                    }
                    continue;
                }
                if (char === "{") {
                    depth++;
                } else if (char === "}") {
                    depth--;
                }
                fragment += char;
                j++;
            }

            const idx = placeholders.length;
            const inner = fragment.slice(2, -1); // Remove ${ and final }

            const innerPlaceholders = [];
            const contentWithPlaceholders = await Minify.#extractTemplates(inner, innerPlaceholders); // eslint-disable-line no-await-in-loop -- This is required since the minification must happen in order.
            const minifiedWithPlaceholders = await Minify.#minifyHtmlWithPlaceholders(contentWithPlaceholders); // eslint-disable-line no-await-in-loop -- This is required since the minification must happen in order.
            const minifiedInner = Minify.#restoreTemplates(minifiedWithPlaceholders, innerPlaceholders);

            placeholders.push(minifiedInner);
            result += `__HTMLMIN_PLACEHOLDER_${idx}__`;
            i = j;
        }
        return result;
    }

    // MARK: static async #minifyHtmlWithPlaceholders
    /**
     * Minifies HTML content with JS template placeholders.
     * @param {string} contentWithPlaceholders The HTML content with JS template placeholders.
     * @returns {Promise<string>} The minified HTML with placeholders.
     */
    static async #minifyHtmlWithPlaceholders(contentWithPlaceholders) {
        return await HtmlMinifierTerser.minify(
            contentWithPlaceholders,
            {
                collapseBooleanAttributes: true,
                collapseWhitespace: true,
                conservativeCollapse: true,
                decodeEntities: true,
                html5: true,
                minifyCSS: true,
                minifyJS: true,
                removeAttributeQuotes: true,
                removeComments: true,
                removeEmptyAttributes: true,
                removeOptionalTags: true,
                removeRedundantAttributes: true,
                useShortDoctype: true
            }
        );
    }

    // MARK: static #restoreTemplates
    /**
     * Restores template literals in a string from placeholders.
     * @param {string} str The string to restore templates in.
     * @param {string[]} placeholders The array of templates to restore.
     * @returns {string} The string with placeholders replaced by the original templates.
     */
    static #restoreTemplates(str, placeholders) {
        return str.replace(placeholderMatch, (_substr, _args1, _offset, _str, groups) => {
            const val = placeholders[Number(groups.index)];
            return `\${${val}}`;
        });
    }

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
            const fileInfos = [];

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
                fileInfos.push({filePath, redirect});
            }

            let str;

            try {
                str = (await Promise.all(fileInfos.map(async ({filePath, redirect}) => {
                    let data = await fs.readFile(filePath, "utf8");

                    if (redirect && redirect.replace) {
                        for (const find of Object.keys(redirect.replace)) {
                            data = data.split(find).join(redirect.replace[find]);
                        }
                    }

                    return data;
                }))).join("");
            } catch (err) {
                return next(err.code === "ENOENT" ? void 0 : err);
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
            const fileInfos = [];
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
                fileInfos.push({file, filePath, redirect});
            }

            /** @type {{ [file: string]: string }} */
            let code;
            try {
                code = (await Promise.all(fileInfos.map(async ({file, filePath, redirect}) => {
                    let data = await fs.readFile(filePath, "utf8");

                    if (redirect && redirect.replace) {
                        for (const find of Object.keys(redirect.replace)) {
                            data = data.split(find).join(redirect.replace[find]);
                        }
                    }

                    // Use extractTemplates and restoreTemplates on the whole file
                    const placeholders = [];
                    const contentWithPlaceholders = await Minify.#extractTemplates(data, placeholders);
                    const minifiedWithPlaceholders = await Minify.#minifyHtmlWithPlaceholders(contentWithPlaceholders);
                    const minified = Minify.#restoreTemplates(minifiedWithPlaceholders, placeholders);

                    return {
                        file,
                        data: minified
                    };
                }))).reduce((acc, {file, data}) => {
                    acc[file] = data;
                    return acc;
                }, {});
            } catch (err) {
                return next(err.code === "ENOENT" ? void 0 : err);
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

        let tags = "";

        if (Minify.#options.disableTagCombining) {
            switch (type) {
                case "js":
                    tags = files.map((f) => `<script src="${f}"></script>`).join("");
                    break;
                case "css":
                    tags = files.map((f) => `<link rel="stylesheet" href="${f}" />`).join("");
                    break;
            }
        } else {
            switch (type) {
                case "js":
                    tags = `<script src="${Minify.#options.jsRoot}?files=${files.join(",")}"></script>`;
                    break;
                case "css":
                    tags = `<link rel="stylesheet" href="${Minify.#options.cssRoot}?files=${files.join(",")}" />`;
                    break;
            }
        }

        return tags;
    }
}

module.exports = Minify;
