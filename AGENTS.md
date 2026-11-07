<!-- ai-docs:start -->
## Generated docs

Plans, explainers, HTML reports, incident write-ups, investigation and troubleshooting notes, research and UI prototypes live on the `ai-docs` branch, the team's knowledge base, served at https://ctrlshiftbryan.github.io/triplex. Write and publish them with the `ai-docs` skill (`.claude/skills/ai-docs/SKILL.md`, publish with `pnpm ai-docs:publish`) without asking. That destination wins over any other skill's output location and over claude.ai Artifacts (make an Artifact only when asked for one).

New `.html` and `.md` files on code branches belong only in `docs/`, `.claude/`, `.github/`, AGENTS.md/CLAUDE.md files, README/CHANGELOG/LICENSE/CONTRIBUTING files, public/ asset folders, test fixtures, `packages/@triplex/editor/`, `apps/vscode/`, `packages/create-triplex-project/templates/` and `runbooks/`. Code review flags any other new `.html` or `.md` file unless the PR description says why it belongs in the repo.
<!-- ai-docs:end -->
