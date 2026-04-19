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

const placeholderTypedMatch = /__HTMLMIN_PLACEHOLDER_(?<type>html|string)_(?<index>\d+)__/g;

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

    // MARK: static async #extractAndMinifyTemplates
    /**
     * Extracts and minifies templates from a string and replaces them with placeholders.
     * @param {string} str The string to extract templates from.
     * @param {string[]} placeholders The array to store the extracted templates.
     * @returns {Promise<string>} The string with templates replaced by placeholders.
     */
    static async #extractAndMinifyTemplates(str, placeholders) {
        let result = "";
        let i = 0;
        while (i < str.length) {
            // Find the next HTML template and string template.
            const htmlTemplateStart = str.indexOf("/* html */`", i);
            const stringTemplateStart = str.indexOf("${", i);

            let start;

            /** @type {"html" | "string"} */
            let type;
            if (htmlTemplateStart === -1 && stringTemplateStart === -1) {
                // No more templates found.
                result += str.slice(i);
                break;
            } else if (htmlTemplateStart !== -1 && (stringTemplateStart === -1 || htmlTemplateStart < stringTemplateStart)) {
                // Next is an HTML template.
                start = htmlTemplateStart;
                type = "html";
            } else {
                // Next is a string template.
                start = stringTemplateStart;
                type = "string";
            }
            result += str.slice(i, start);

            if (type === "html") {
                // Extract the HTML template, handling nested templates and other syntactical edge cases correctly.

                // Use a state machine to ensure the backtick is not escaped and is the start of a template.
                let j = start + 11;
                let fragment = "";
                let exprDepth = 0;
                while (j < str.length) {
                    const char = str[j];

                    // Handle start of string template.
                    if (char === "$" && str[j + 1] === "{") {
                        exprDepth++;
                        fragment += "${";
                        j += 2;
                        continue;
                    }
                    // Handle end of string template.
                    if (char === "}") {
                        if (exprDepth > 0) {
                            exprDepth--;
                        }
                        fragment += char;
                        j++;
                        continue;
                    }

                    // Handle end of HTML template, only breaking if we're not inside a string template.
                    if (char === "`" && exprDepth === 0 && (j === 0 || str[j - 1] !== "\\")) {
                        j++;
                        break;
                    }

                    // Handle nested templates.
                    if ((char === "'" || char === "\"" || char === "`") && exprDepth > 0) {
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
                    fragment += char;
                    j++;
                }

                // Recursively extract templates, minify the content, then restore the templates in the minified content.
                const contentWithPlaceholders = await Minify.#extractAndMinifyTemplates(fragment, placeholders); // eslint-disable-line no-await-in-loop -- This is necessary to ensure that nested templates are properly handled in order.
                const minified = await Minify.#minifyHtmlWithPlaceholders(contentWithPlaceholders); // eslint-disable-line no-await-in-loop -- This is necessary to ensure that nested templates are properly handled in order.
                const restored = Minify.#restoreTemplates(minified, placeholders);

                // Store the result as a placeholder.
                const index = placeholders.length;
                placeholders.push(restored);
                result += `__HTMLMIN_PLACEHOLDER_html_${index}__`;
                i = j;
            } else {
                // Extract the string template, handling nested templates and other syntactical edge cases correctly.

                // Use a state machine to ensure the closing brace is not escaped and is the end of the template.
                let fragment = "${";
                let depth = 1;
                let j = start + 2;
                while (j < str.length && depth > 0) {
                    const char = str[j];

                    // Handle start of a template.
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

                    // Handle nested templates.
                    if (char === "{") {
                        depth++;
                    } else if (char === "}") {
                        depth--;
                    }

                    fragment += char;
                    j++;
                }

                // Recursively extract templates, minify the content, then restore the templates in the minified content.
                const inner = fragment.slice(2, -1);
                const contentWithPlaceholders = await Minify.#extractAndMinifyTemplates(inner, placeholders); // eslint-disable-line no-await-in-loop -- This is necessary to ensure that nested templates are properly handled in order.
                const minified = await Minify.#minifyJsWithPlaceholders(contentWithPlaceholders); // eslint-disable-line no-await-in-loop -- This is necessary to ensure that nested templates are properly handled in order.
                const restored = Minify.#restoreTemplates(minified, placeholders);

                // Store the result as a placeholder.
                const index = placeholders.length;
                placeholders.push(restored);
                result += `__HTMLMIN_PLACEHOLDER_string_${index}__`;
                i = j;
            }
        }
        return result;
    }

    // MARK: static async #minifyCssFromHtmlMinifierTerser
    /**
     * Minifies CSS content from html-minifier-terser.
     * @param {string} text The CSS content to minify.
     * @param {"inline" | "media" | undefined} type The type of content being minified.
     * @returns {string} The minified CSS content.
     */
    static #minifyCssFromHtmlMinifierTerser(text, type) {
        switch (type) {
            case "inline":
                // This came from a style attribute.  Wrap it in a simple selector.
                text = `*{${text}}`;
                break;
            case "media":
                // This came from a media attribute.  Wrap it in a simple media query.
                text = `@media ${text}{a{top:0}}`;
                break;
        }

        // Perform minification.
        text = csso.minify(text).css;

        switch (type) {
            case "inline":
                // Unwrap the style attribute content from the selector.
                return text.slice(2, -1);
            case "media": {
                // Unwrap the media attribute content from the media query.
                return text.slice(7, -10).trim();
            }
            default:
                // Normal CSS, just return the text.
                return text;
        }
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
                caseSensitive: true,
                collapseBooleanAttributes: true,
                collapseWhitespace: true,
                conservativeCollapse: true,
                decodeEntities: true,
                html5: true,
                minifyCSS: Minify.#minifyCssFromHtmlMinifierTerser,
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

    // MARK: static async #minifyJsWithPlaceholders
    /**
     * Minifies JavaScript content with HTML template placeholders.
     * @param {string} contentWithPlaceholders The JavaScript content with HTML template placeholders.
     * @param {boolean} [final=false] Whether this is the final minification pass where more aggressive optimizations can be applied.
     * @returns {Promise<string>} The minified JavaScript with placeholders.
     */
    static async #minifyJsWithPlaceholders(contentWithPlaceholders, final) {
        if (!final) {
            contentWithPlaceholders = contentWithPlaceholders.replaceAll(".#", "__DOT__HASH__");
        }
        const minified = await terser.minify(contentWithPlaceholders, {
            nameCache: Minify.#nameCache,
            compress: {
                booleans: Boolean(final),
                evaluate: Boolean(final),
                side_effects: Boolean(final)
            },
            ...final ? {} : {mangle: false}
        });
        let {code} = minified;
        if (!final) {
            code = code.replaceAll("__DOT__HASH__", ".#");
        }

        // If the input doesn't end in a semicolon, but the output does, strip it.
        if (code && code.endsWith(";") && !contentWithPlaceholders.slice(1, -1).trim().endsWith(";")) {
            code = code.slice(0, -1);
        }

        return code;
    }

    // MARK: static #restoreTemplates
    /**
     * Restores template in a string from placeholders.
     * @param {string} str The string to restore templates in.
     * @param {string[]} placeholders The array of templates to restore.
     * @returns {string} The string with placeholders replaced by the original templates.
     */
    static #restoreTemplates(str, placeholders) {
        return str.replace(placeholderTypedMatch, (_substr, _type, _index, _offset, _str, groups) => {
            // Extract the index and type from the placeholder.
            const index = Number(groups.index);

            /** @type {{type: "html" | "string"}} */
            const {type} = groups;

            // Get the original template from the placeholders array.
            const placeholder = placeholders[index];

            // Depending on the type, restore the template with the appropriate syntax.
            if (type === "html") {
                return `\`${placeholder}\``;
            }
            return `\${${placeholder}}`;
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

            const placeholders = [];

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

                    // Extract the templates into placeholders and minify them.
                    const contentWithPlaceholders = await Minify.#extractAndMinifyTemplates(data, placeholders);

                    return {
                        file,
                        data: contentWithPlaceholders
                    };
                }))).reduce((acc, {file, data}) => {
                    acc[file] = data;
                    return acc;
                }, {});
            } catch (err) {
                return next(err.code === "ENOENT" ? void 0 : err);
            }

            // Restore the placeholders and aggressively minify the combined code.
            const restored = Minify.#restoreTemplates(Object.values(code).join("\n"), placeholders);
            const output = await Minify.#minifyJsWithPlaceholders(restored, true);

            if (Minify.#options.caching) {
                Minify.#options.caching.set(key, output);
            }

            res.status(200).type("js").send(output);
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
