const csso = require("csso"),
    Express = require("express"),
    fs = require("fs/promises"),
    Minify = require("../index"),
    path = require("path"),
    request = require("supertest"),
    terser = require("terser");

// MARK: Minify
describe("Minify", () => {
    // MARK: Setup
    describe("Setup", () => {
        beforeEach(() => {
            Minify.setup({
                wwwRoot: path.join(__dirname, "www"),
                jsRoot: "/js/",
                cssRoot: "/css/",
                caching: {
                    get: jest.fn(),
                    set: jest.fn(),
                    prefix: "test"
                }
            });
        });

        test("should set up options correctly", () => {
            const options = {
                wwwRoot: "/var/www",
                jsRoot: "/js/",
                cssRoot: "/css/"
            };
            Minify.setup(options);
            expect(Minify.combine(["file1.js"], "js")).toContain(options.jsRoot);
        });
    });

    // MARK: Combine
    describe("Combine", () => {
        // MARK: Default Setup
        describe("Default Setup", () => {
            beforeEach(() => {
                Minify.setup({
                    wwwRoot: path.join(__dirname, "www"),
                    jsRoot: "/js/",
                    cssRoot: "/css/",
                    caching: {
                        get: jest.fn(),
                        set: jest.fn(),
                        prefix: "test"
                    }
                });
            });

            test("should return combined script tags for JS files", () => {
                const result = Minify.combine(["file1.js", "file2.js"], "js");
                expect(result).toBe("<script src=\"/js/?files=file1.js,file2.js\"></script>");
            });

            test("should return combined link tags for CSS files", () => {
                const result = Minify.combine(["file1.css", "file2.css"], "css");
                expect(result).toBe("<link rel=\"stylesheet\" href=\"/css/?files=file1.css,file2.css\" />");
            });
        });

        // MARK: With disableTagCombining
        describe("With disableTagCombining", () => {
            beforeEach(() => {
                Minify.setup({
                    wwwRoot: path.join(__dirname, "www"),
                    jsRoot: "/js/",
                    cssRoot: "/css/",
                    disableTagCombining: true
                });
            });

            test("should return individual tags if disableTagCombining is true for JS files", () => {
                const result = Minify.combine(["file1.js", "file2.js"], "js");
                expect(result).toBe("<script src=\"file1.js\"></script><script src=\"file2.js\"></script>");
            });

            test("should return individual tags if disableTagCombining is true for CSS files", () => {
                const result = Minify.combine(["file1.css", "file2.css"], "css");
                expect(result).toBe("<link rel=\"stylesheet\" href=\"file1.css\" /><link rel=\"stylesheet\" href=\"file2.css\" />");
            });
        });
    });

    // MARK: CSS Handler
    describe("CSS Handler", () => {
        beforeEach(() => {
            Minify.setup({
                wwwRoot: path.join(__dirname, "www"),
                jsRoot: "/js/",
                cssRoot: "/css/",
                caching: {
                    get: jest.fn(),
                    set: jest.fn(),
                    prefix: "test"
                }
            });
        });

        test("should return minified CSS", async () => {
            const app = Express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("body { color: red; }");

            const res = await request(app).get("/css").query({files: "/style.css"});
            expect(res.status).toBe(200);
            expect(res.type).toBe("text/css");
            expect(res.text).toContain("body{color:red}");
        });

        test("should return 404 for missing files", async () => {
            const app = Express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/css").query({files: "/missing.css"});
            expect(res.status).toBe(404);
        });

        test("should return 404 for empty filenames", async () => {
            const app = Express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/css").query({files: ""});
            expect(res.status).toBe(404);
        });

        test("should return 404 for invalid file paths", async () => {
            const app = Express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/css").query({files: "passwd"});
            expect(res.status).toBe(404);
        });

        test("should return 404 for file paths outside of the root", async () => {
            const app = Express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/css").query({files: "/../../etc/passwd"});
            expect(res.status).toBe(404);
        });
    });

    // MARK: JS Handler
    describe("JS Handler", () => {
        beforeEach(() => {
            Minify.setup({
                wwwRoot: path.join(__dirname, "www"),
                jsRoot: "/js/",
                cssRoot: "/css/",
                caching: {
                    get: jest.fn(),
                    set: jest.fn(),
                    prefix: "test"
                }
            });
        });

        test("should return minified JS", async () => {
            const app = Express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("function test() { console.log('test'); }");

            const res = await request(app).get("/js").query({files: "/script.js"});
            expect(res.status).toBe(200);
            expect(["application/javascript", "text/javascript"]).toContain(res.type);
            expect(res.text).toContain("function test(){console.log(\"test\")}");
        });

        test("should return minified HTML, CSS, and JS inside a template string", async () => {
            const app = Express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("console.log(/* html */`<style>\nh1    {    color:    red;    }\n</style>   <script>\n   console.log('Test');  </script>   <div>\n<span>Test</span>\n</div>` + /* html */`<div>\n<span>Test2</span>\n</div>`);");

            const res = await request(app).get("/js").query({files: "/script.js"});
            expect(res.status).toBe(200);
            expect(["application/javascript", "text/javascript"]).toContain(res.type);
            expect(res.text).toContain("console.log('<style>h1{color:red}</style> <script>console.log(\"Test\")<\\/script> <div> <span>Test</span> </div><div> <span>Test2</span> </div>')");
        });

        test("should return 404 for missing files", async () => {
            const app = Express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/js").query({files: "/missing.js"});
            expect(res.status).toBe(404);
        });

        test("should return 404 for empty filenames", async () => {
            const app = Express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/js").query({files: ""});
            expect(res.status).toBe(404);
        });

        test("should return 404 for invalid file paths", async () => {
            const app = Express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/js").query({files: "passwd"});
            expect(res.status).toBe(404);
        });

        test("should return 404 for file paths outside of the root", async () => {
            const app = Express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/js").query({files: "/../../etc/passwd"});
            expect(res.status).toBe(404);
        });
    });

    // MARK: Null Setup
    describe("Null Setup", () => {
        test("should throw an error if setup is not called", () => {
            Minify.setup(null);
            expect(() => Minify.combine(["file1.js"], "js")).toThrow("node-minify is not setup properly. Please call the setup function and provide the wwwRoot, jsRoot, and cssRoot options. See README for details.");
        });
    });

    // MARK: Caching With Prefix
    describe("Caching With Prefix", () => {
        /** @type {{[x: string]: string}} */
        const cache = {};

        const getCacheMock = jest.fn((key) => cache[key]);
        const setCacheMock = jest.fn((key, value) => {
            cache[key] = value;
        });

        beforeEach(() => {
            Minify.setup({
                wwwRoot: path.join(__dirname, "www"),
                jsRoot: "/js/",
                cssRoot: "/css/",
                caching: {
                    get: getCacheMock,
                    set: setCacheMock,
                    prefix: "test"
                }
            });
        });

        test("should use caching for css if enabled", async () => {
            const app = Express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("body { color: red; }");

            let res = await request(app).get("/css").query({files: "/style.css"});
            const minified = res.text;
            expect(res.status).toBe(200);
            expect(res.type).toBe("text/css");
            expect(res.text).toContain("body{color:red}");
            expect(setCacheMock).toHaveBeenCalledWith("test:minify:/style.css", res.text);
            expect(cache["test:minify:/style.css"]).toBe(minified);

            app.get("/css", Minify.cssHandler);

            const cacheKey = "test:minify:/style.css";

            res = await request(app).get("/css").query({files: "/style.css"});
            expect(res.status).toBe(200);
            expect(res.text).toBe(minified);
            expect(getCacheMock).toHaveBeenCalledWith(cacheKey);
        });

        test("should use caching for js if enabled", async () => {
            const app = Express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("function test() { console.log('test'); }");

            let res = await request(app).get("/js").query({files: "/script.js"});
            const minified = res.text;
            expect(res.status).toBe(200);
            expect(["application/javascript", "text/javascript"]).toContain(res.type);
            expect(res.text).toContain("function test(){console.log(\"test\")}");
            expect(setCacheMock).toHaveBeenCalledWith("test:minify:/script.js", res.text);
            expect(cache["test:minify:/script.js"]).toBe(minified);

            app.get("/js", Minify.jsHandler);

            const cacheKey = "test:minify:/script.js";

            res = await request(app).get("/js").query({files: "/script.js"});
            expect(res.status).toBe(200);
            expect(res.text).toBe(minified);
            expect(getCacheMock).toHaveBeenCalledWith(cacheKey);
        });
    });

    // MARK: Caching Without Prefix
    describe("Caching Without Prefix", () => {
        /** @type {{[x: string]: string}} */
        const cache = {};

        const getCacheMock = jest.fn((key) => cache[key]);
        const setCacheMock = jest.fn((key, value) => {
            cache[key] = value;
        });

        beforeEach(() => {
            Minify.setup({
                wwwRoot: path.join(__dirname, "www"),
                jsRoot: "/js/",
                cssRoot: "/css/",
                caching: {
                    get: getCacheMock,
                    set: setCacheMock
                }
            });
        });

        test("should use caching for css if enabled", async () => {
            const app = Express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("body { color: red; }");

            let res = await request(app).get("/css").query({files: "/style.css"});
            const minified = res.text;
            expect(res.status).toBe(200);
            expect(res.type).toBe("text/css");
            expect(res.text).toContain("body{color:red}");
            expect(setCacheMock).toHaveBeenCalledWith("minify:/style.css", res.text);
            expect(cache["minify:/style.css"]).toBe(minified);

            app.get("/css", Minify.cssHandler);

            const cacheKey = "minify:/style.css";

            res = await request(app).get("/css").query({files: "/style.css"});
            expect(res.status).toBe(200);
            expect(res.text).toBe(minified);
            expect(getCacheMock).toHaveBeenCalledWith(cacheKey);
        });

        test("should use caching for js if enabled", async () => {
            const app = Express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("function test() { console.log('test'); }");

            let res = await request(app).get("/js").query({files: "/script.js"});
            const minified = res.text;
            expect(res.status).toBe(200);
            expect(["application/javascript", "text/javascript"]).toContain(res.type);
            expect(res.text).toContain("function test(){console.log(\"test\")}");
            expect(setCacheMock).toHaveBeenCalledWith("minify:/script.js", res.text);
            expect(cache["minify:/script.js"]).toBe(minified);

            app.get("/js", Minify.jsHandler);

            const cacheKey = "minify:/script.js";

            res = await request(app).get("/js").query({files: "/script.js"});
            expect(res.status).toBe(200);
            expect(res.text).toBe(minified);
            expect(getCacheMock).toHaveBeenCalledWith(cacheKey);
        });
    });

    // MARK: No Caching
    describe("No Caching", () => {
        beforeEach(() => {
            Minify.setup({
                wwwRoot: path.join(__dirname, "www"),
                jsRoot: "/js/",
                cssRoot: "/css/"
            });
        });

        test("should not use caching for css if disabled", async () => {
            const app = Express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("body { color: red; }");

            let res = await request(app).get("/css").query({files: "/style.css"});
            const minified = res.text;
            expect(res.status).toBe(200);
            expect(res.type).toBe("text/css");
            expect(res.text).toContain("body{color:red}");

            app.get("/css", Minify.cssHandler);

            res = await request(app).get("/css").query({files: "/style.css"});
            expect(res.status).toBe(200);
            expect(res.text).toBe(minified);
        });

        test("should not use caching for js if disabled", async () => {
            const app = Express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("function test() { console.log('test'); }");

            let res = await request(app).get("/js").query({files: "/script.js"});
            const minified = res.text;
            expect(res.status).toBe(200);
            expect(["application/javascript", "text/javascript"]).toContain(res.type);
            expect(res.text).toContain("function test(){console.log(\"test\")}");

            app.get("/js", Minify.jsHandler);


            res = await request(app).get("/js").query({files: "/script.js"});
            expect(res.status).toBe(200);
            expect(res.text).toBe(minified);
        });
    });

    // MARK: Redirects
    describe("Redirects", () => {
        beforeEach(() => {
            Minify.setup({
                wwwRoot: path.join(__dirname, "www"),
                jsRoot: "/js/",
                cssRoot: "/css/",
                caching: {
                    get: jest.fn(),
                    set: jest.fn(),
                    prefix: "test"
                },
                redirects: {
                    "/redirect.css": {contentType: "text/css", path: "/style.css", replace: {"red": "blue"}},
                    "/redirect.js": {contentType: "application/javascript", path: "/script.js", replace: {"test": "TEST"}}
                }
            });
        });

        test("should handle redirects for CSS files", async () => {
            const app = Express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("body { color: red; }");

            const res = await request(app).get("/css").query({files: "/redirect.css"});
            expect(res.status).toBe(200);
            expect(res.type).toBe("text/css");
            expect(res.text).toContain("body{color:#00f}");
        });

        test("should handle redirects for JS files", async () => {
            const app = Express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("function test() { console.log('test'); }");

            const res = await request(app).get("/js").query({files: "/redirect.js"});
            expect(res.status).toBe(200);
            expect(["application/javascript", "text/javascript"]).toContain(res.type);
            expect(res.text).toContain("function TEST(){console.log(\"TEST\")}");
        });
    });

    // MARK: Error Handling
    describe("Error Handling", () => {
        beforeEach(() => {
            Minify.setup({
                wwwRoot: path.join(__dirname, "www"),
                jsRoot: "/js/",
                cssRoot: "/css/",
                caching: {
                    get: jest.fn(),
                    set: jest.fn(),
                    prefix: "test"
                }
            });
        });

        test("should handle errors when reading files for CSS", async () => {
            const app = Express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue(new Error("File not found"));

            const res = await request(app).get("/css").query({files: "/style.css"});
            expect(res.status).toBe(500);
            expect(res.text).toContain("File not found");
        });

        test("should handle errors when reading files for JS", async () => {
            const app = Express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue(new Error("File not found"));

            const res = await request(app).get("/js").query({files: "/script.js"});
            expect(res.status).toBe(500);
            expect(res.text).toContain("File not found");
        });

        test("should handle errors when minifying CSS through csso", async () => {
            const app = Express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("body { color: red; }");
            jest.spyOn(csso, "minify").mockImplementation(() => {
                throw new Error("Minification error");
            });

            const res = await request(app).get("/css").query({files: "/style.css"});
            expect(res.status).toBe(500);
            expect(res.text).toContain("Minification error");
        });

        test("should handle errors when minifying JS through terser", async () => {
            const app = Express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("function test() { console.log('test'); }");
            jest.spyOn(terser, "minify").mockImplementation(() => {
                throw new Error("Minification error");
            });

            const res = await request(app).get("/js").query({files: "/script.js"});
            expect(res.status).toBe(500);
            expect(res.text).toContain("Minification error");
        });
    });
});
