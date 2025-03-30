const csso = require("csso");
const express = require("express");
const fs = require("fs/promises");
const Minify = require("../index");
const path = require("path");
const request = require("supertest");
const terser = require("terser");

describe("Minify", () => {
    describe("setup", () => {
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

        it("should set up options correctly", () => {
            const options = {
                wwwRoot: "/var/www",
                jsRoot: "/js/",
                cssRoot: "/css/"
            };
            Minify.setup(options);
            expect(Minify.combine(["file1.js"], "js")).toContain(options.jsRoot);
        });
    });

    describe("combine", () => {
        describe("default setup", () => {
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

            it("should return combined script tags for JS files", () => {
                const result = Minify.combine(["file1.js", "file2.js"], "js");
                expect(result).toBe("<script src=\"/js/?files=file1.js,file2.js\"></script>");
            });

            it("should return combined link tags for CSS files", () => {
                const result = Minify.combine(["file1.css", "file2.css"], "css");
                expect(result).toBe("<link rel=\"stylesheet\" href=\"/css/?files=file1.css,file2.css\" />");
            });
        });

        describe("with disableTagCombining", () => {
            beforeEach(() => {
                Minify.setup({
                    wwwRoot: path.join(__dirname, "www"),
                    jsRoot: "/js/",
                    cssRoot: "/css/",
                    disableTagCombining: true
                });
            });

            it("should return individual tags if disableTagCombining is true for JS files", () => {
                const result = Minify.combine(["file1.js", "file2.js"], "js");
                expect(result).toBe("<script src=\"file1.js\"></script><script src=\"file2.js\"></script>");
            });

            it("should return individual tags if disableTagCombining is true for CSS files", () => {
                const result = Minify.combine(["file1.css", "file2.css"], "css");
                expect(result).toBe("<link rel=\"stylesheet\" href=\"file1.css\" /><link rel=\"stylesheet\" href=\"file2.css\" />");
            });
        });
    });

    describe("cssHandler", () => {
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

        it("should return minified CSS", async () => {
            const app = express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("body { color: red; }");

            const res = await request(app).get("/css").query({files: "/style.css"});
            expect(res.status).toBe(200);
            expect(res.type).toBe("text/css");
            expect(res.text).toContain("body{color:red}");
        });

        it("should return 404 for missing files", async () => {
            const app = express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/css").query({files: "/missing.css"});
            expect(res.status).toBe(404);
        });

        it("should return 404 for empty filenames", async () => {
            const app = express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/css").query({files: ""});
            expect(res.status).toBe(404);
        });

        it("should return 404 for invalid file paths", async () => {
            const app = express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/css").query({files: "passwd"});
            expect(res.status).toBe(404);
        });

        it("should return 404 for file paths outside of the root", async () => {
            const app = express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/css").query({files: "/../../etc/passwd"});
            expect(res.status).toBe(404);
        });
    });

    describe("jsHandler", () => {
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

        it("should return minified JS", async () => {
            const app = express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("function test() { console.log('test'); }");

            const res = await request(app).get("/js").query({files: "/script.js"});
            expect(res.status).toBe(200);
            expect(res.type).toBe("application/javascript");
            expect(res.text).toContain("function test(){console.log(\"test\")}");
        });

        it("should return 404 for missing files", async () => {
            const app = express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/js").query({files: "/missing.js"});
            expect(res.status).toBe(404);
        });

        it("should return 404 for empty filenames", async () => {
            const app = express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/js").query({files: ""});
            expect(res.status).toBe(404);
        });

        it("should return 404 for invalid file paths", async () => {
            const app = express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/js").query({files: "passwd"});
            expect(res.status).toBe(404);
        });

        it("should return 404 for file paths outside of the root", async () => {
            const app = express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue({code: "ENOENT"});

            const res = await request(app).get("/js").query({files: "/../../etc/passwd"});
            expect(res.status).toBe(404);
        });
    });

    describe("null setup", () => {
        it("should throw an error if setup is not called", () => {
            Minify.setup(null);
            expect(() => Minify.combine(["file1.js"], "js")).toThrow("node-minify is not setup properly. Please call the setup function and provide the wwwRoot, jsRoot, and cssRoot options. See README for details.");
        });
    });

    describe("caching", () => {
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

        it("should use caching for css if enabled", async () => {
            const app = express();
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

        it("should use caching for js if enabled", async () => {
            const app = express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("function test() { console.log('test'); }");

            let res = await request(app).get("/js").query({files: "/script.js"});
            const minified = res.text;
            expect(res.status).toBe(200);
            expect(res.type).toBe("application/javascript");
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

    describe("redirects", () => {
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

        it("should handle redirects for CSS files", async () => {
            const app = express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("body { color: red; }");

            const res = await request(app).get("/css").query({files: "/redirect.css"});
            expect(res.status).toBe(200);
            expect(res.type).toBe("text/css");
            expect(res.text).toContain("body{color:#00f}");
        });

        it("should handle redirects for JS files", async () => {
            const app = express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("function test() { console.log('test'); }");

            const res = await request(app).get("/js").query({files: "/redirect.js"});
            expect(res.status).toBe(200);
            expect(res.type).toBe("application/javascript");
            expect(res.text).toContain("function TEST(){console.log(\"TEST\")}");
        });
    });

    describe("error handling", () => {
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

        it("should handle errors when reading files for CSS", async () => {
            const app = express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue(new Error("File not found"));

            const res = await request(app).get("/css").query({files: "/style.css"});
            expect(res.status).toBe(500);
            expect(res.text).toContain("File not found");
        });

        it("should handle errors when reading files for JS", async () => {
            const app = express();
            app.get("/js", Minify.jsHandler);

            jest.spyOn(fs, "readFile").mockRejectedValue(new Error("File not found"));

            const res = await request(app).get("/js").query({files: "/script.js"});
            expect(res.status).toBe(500);
            expect(res.text).toContain("File not found");
        });

        it("should handle errors when minifying CSS through csso", async () => {
            const app = express();
            app.get("/css", Minify.cssHandler);

            jest.spyOn(fs, "readFile").mockResolvedValue("body { color: red; }");
            jest.spyOn(csso, "minify").mockImplementation(() => {
                throw new Error("Minification error");
            });

            const res = await request(app).get("/css").query({files: "/style.css"});
            expect(res.status).toBe(500);
            expect(res.text).toContain("Minification error");
        });

        it("should handle errors when minifying JS through terser", async () => {
            const app = express();
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
