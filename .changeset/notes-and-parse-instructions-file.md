---
"@buildinternet/releases": minor
---

Add `--notes-file` and `--parse-instructions-file` flags for AI-generated multi-paragraph content (#103 workstream 3). The inline `--notes` and `--parse-instructions` forms are quote-hostile and silently truncate at unescaped newlines, which is exactly the shape of content these flags get fed.

- `releases admin playbook <org> --notes-file <path>` (use `-` for stdin) replaces inline notes.
- `releases admin source update <id> --parse-instructions-file <path>` (use `-` for stdin) replaces inline parse instructions. The deprecated `edit` alias gets the same flag.
- An empty file clears, matching the existing inline empty-string semantics.
- Passing both forms together errors: `--notes and --notes-file are mutually exclusive` / `--parse-instructions and --parse-instructions-file are mutually exclusive`.

The inline forms still work in this release but emit a stderr deprecation warning per invocation pointing at the file form. They will be removed in a future minor release.

Skill manifests (`skills/managing-sources`, `skills/seeding-playbooks`) and bundled agent docs are updated to use the file form. While in there, the agent docs' stale `releases admin content playbook` path is corrected to the canonical `releases admin playbook`.
