// Minimal CommonJS-compatible types for terser.
declare module "terser" {
    export function minify(
        files: string | {[file: string]: string},
        options?: any
    ): Promise<{code: string}>
}
