# node-minify
A simple library that provides combination and minification services for JavaScript and CSS files when using Express.

## Installing
Since this is largely used for personal projects, this is not an npm package.  Nevertheless, you may still install this by adding the following to your package.json:

```json
{
    "dependencies": {
        "@roncli/node-minify": "roncli/node-minify#v1.1.10"
    }
}
```

## Usage
To add node-minify to your Express application, run the setup function and then add the CSS and JavaScript handlers to Express.

```javascript
const express = require("express");
const Minify = require("@roncli/node-minify");

const app = express();

Minify.setup({
    wwwRoot: path.join(__dirname, "public"),
    cssRoot: "/css/",
    jsRoot: "/js/"
});

app.get("/css", Minify.cssHandler);
app.get("/js", Minify.jsHandler);
```

With this code, let's say that you had the following 4 files:
* http://localhost/css/common.css
* http://localhost/css/theme.css
* http://localhost/js/common.js
* http://localhost/js/jquery.min.js

You could then use the following URLs:
* http://localhost/css/?/css/common.css,/css/theme.css
* http://localhost/js/?/js/common.js,/js/jquery.min.js

The result is a combined file made up of each of the files that you listed after the question mark.  The file is minified, meaning it is compacted as small as possible without affecting functionality.

This library does not prevent you from calling the original, unmodified versions of the files.  All 6 URLs above will work.

### Options
The setup function provides a number of options and customizations.

```javascript
const cache = {};

Minify.setup({
    wwwRoot: path.join(__dirname, "public"),
    cssRoot: "/css/",
    jsRoot: "/js/",
    disableTagCombining: false,
    redirects: {
        "/js/jquery.min.js": {
            path: path.join(__dirname, "node_modules/jquery/dist/jquery.min.js"),
            contentType: "js",
            replace: {
                "find": "replace"
            }
        },
        "/js/bootstrap.min.css": {
            path: path.join(__dirname, "node_modules/bootstrap/dist/css/bootstrap.min.css"),
            contentType: "css"
        }
    },
    caching: {
        get: (key) => cache[key],
        set: (key, value) => {cache[key] = value;},
        prefix: "my-project"
    }
});
```

| Options | Data Type | Default | Description |
|---|---|---|---|
| wwwRoot | _string_ | **undefined** | _Required._ The absolute path of the public root of the website. |
| cssRoot | _string_ | **"/css/"** | The Express route that returns your combined and minified CSS files, plus a trailing slash. |
| jsRoot | _string_ | **"/js/"** | The Express route that returns your combined and minified JavaScript files, plus a trailing slash. |
| disableTagCombining | _boolean_ | false | Disables the combining of `<link>` and `<script>` tags in `Minify.combine()`.  Useful if you need to render a web page with the original, uncombined, unminified CSS and JavaScript files. |
| redirects | _object_ | **undefined** | _Optional._  An object that allows you to specify alternate locations for files that aren't found within the wwwRoot, for example in `node_modules`.  Each key in the object is the URI the file can be found at. |
| redirects\[uri].path | _string_ | **undefined** | _Required._ The absolute path to the file that should be served for this URI. |
| redirects\[uri].contentType | `"css"` or `"js"` | **undefined** | _Required._ Whether this file is a CSS or JavaScript file. |
| caching | _object_ | **undefined** | _Optional._ An object that defines caching for combined and minified files. |
| caching.get | _Function&lt;string>(string)_ | **undefined** | _Required._ A function that takes a string key as an input and returns a string value as an output.  May be an async function.  If specified, the library will use any return value from this function as the combined and minified content rather than compiling it on the fly.  Should be used to retrieve a value for the specified key that was stored in the `caching.set` function. |
| caching.set | _Function&lt;void>(string, string)_ | **undefined** | _Required._ A function that takes a string key and a string value as an input.  May be an async function.  If specified, upon completing the combination and minification process, the library will also send the combined and minified output to this function.  Should be used to store the value with the specified key for later retrieval. |
| caching.prefix | _string_ | **undefined** | _Optional._ The prefix to use for the caching key. |

### Combining Tags
As a convenience function, this library provides a way to get the `<link>` and `<script>` tags needed to support combination and minification of multiple files.  This is done through the `Minify.combine()` function.

```javascript
res.status(200).send(`
    <html>
        <head>
            ${Minify.combine(["/css/common.css", "/css/theme.css"], "css")}
            ${Minify.combine(["/js/common.js", "/js/jquery.min.js"], "js")}
        </head>
        <body>Welcome to the web site!</body>
    </html>
`);
```

The output of this function varies depending on how you set `disableTagCombining` in the options.  By default, tag combining is enabled, and you will get a single `<link>` or `<script>` tag with a single URL that will serve the combined list of files.  If tag combining is disabled, then you will get one `<link>` or `<script`> tag for each file listed.  Setting `disableTagCombining` to `true` is a good way to debug your application when you need uncombined and unminifed versions of the files, or you suspect one of the files you are attempting to combine and minify is not loading correctly.

## Version history

### v1.1.10 - 10/1/2022
* Package updates.

### v1.1.9 - 7/18/2022
* Package updates.

### v1.1.8 - 5/30/2022
* Package updates.

### v1.1.7 - 5/4/2022
* Package updates.

### v1.1.6 - 3/11/2022
* Package updates.

### v1.1.5 - 3/8/2022
* Package updates.

### v1.1.4 - 2/8/2022
* Package updates.

### v1.1.3 - 12/6/2021
* Package updates.

### v1.1.2 - 11/23/2021
* Package updates.

### v1.1.1 - 10/1/2021
* Package updates.

### v1.1.0 - 8/23/2021
* Add the ability to do a replace on part of a file.

### v1.0.1 - 2/25/2021
* Fix typings.

### v1.0.0 - 2/24/2021
* Initial version.
