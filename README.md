# MEKI — Project Starter

This is a **planning-only monorepo scaffold**, not a working Next.js/NestJS app yet. The `package.json`, pnpm workspace, Turborepo, gitignore and context documentation are ready. Application packages and package versions must be generated and checked by Claude Code **after approval**.

## First steps
1. Put client PDFs in `client-resources/documents/` with their original filenames.
2. Extract `MEKI_Brand_Kit.zip` to `client-resources/brand-kit/` (result: `MEKI_Brand_Kit/`).
3. Extract large project-photo ZIP locally to `client-resources/images/client-images/`. Preserve original subfolders and filenames.
4. Put reference JPG and generated landing reference PNG into `client-resources/references/`.
5. Open the full `MEKI-starter` folder in VS Code, and give Claude Code `client-resources/project-context.md` and the prompt below.
6. Review `docs/OPEN_DECISIONS.md` before approving any implementation.

## Initial Claude Code instruction
Read `client-resources/project-context.md`, inspect real files without scanning every photo, and prepare architecture, Prisma schema plan, API contracts, work breakdown and phased delivery plan in `docs/` for approval. Do not install dependencies, run migrations, or code features yet.

## Git (PowerShell / terminal)
```bash
git init
git add .
git status
git commit -m "chore: initialize MEKI planning monorepo"
```
Before pushing, confirm `git status` does **not** contain client files or secrets. Do not run `git push` until remote permissions and private-repository access are confirmed. The local client-resources folder is ignored; do not use `git add -f` for it.

## Commands (after installing project packages)
- `corepack enable` (if available) then `pnpm install`
- `pnpm dev` once app package scaffolds exist

The root `package.json` contains **planning-phase placeholders** and version ranges; final package versions, Node runtime, environment setup and scripts must be validated at implementation time.
