# Source reconciliation

1732 ingested/derived sources; 1 inaccessible source; two hash-verified private transcripts still need complete semantic review. Code ingestion is AST metadata, not behavioral verification of every module.

Original feature coverage: **119/119 supplied and mapped**. Original missions: **72/72 supplied and mapped** from BOTH the Markdown and manifest, checked for exact title/prompt correspondence during private import. All 119 original rows are UNVERIFIED/NOT_RUN with empty evidence/owner/mission/acceptance columns. Derived owners are explicitly assessor-selected planning annotations. Missions 01–10 alias the existing Batch One specifications; 11–72 are not executed in Batch One. Row reconciliation never proves implementation.

## Deferred review

- https://chatgpt.com/share/6acd319b-8244-83ec-ae3f-dfe13f414569
- Original transcript semantic reconciliation (two hash-verified private files)
- Earlier family/history semantic alias review (not missing exports)

The shared ChatGPT page remains inaccessible. No omitted contents invented. Original research repository proposals are RESEARCH_ONLY_NOT_ADOPTED; their license/commit claims require independent current review before use.

## Source integrity and confidentiality

Archive SHA256: `1fd3bda7d1bce2697be94a7539b8c30d04a788fdb9b5ba9042ce161cc06913bf`. All eight declared original file hashes and byte counts match. Originals remain outside Git. `derived-original-requirements.json` holds only normalized planning/provenance records, not transcripts, credentials or original prompts. CI verifies that pinned derivative and every row mapping; it does not pretend to reread private originals. Reimport with `node scripts/xroga/import-private-research.mjs <private-extracted-dir> <original-zip>`. Full source hashes/byte counts are in `source-manifest.json`; original-source timestamp is null rather than invented.
