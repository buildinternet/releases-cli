---
"@buildinternet/releases": patch
---

Strip null/undefined fields from the `POST /v1/sources` request body in `createSource()`. The API's Zod schema treats `z.string().optional()` as "string or absent" — an explicit `"productId": null` in the JSON body trips the validator and 400s. Sending `--org <slug>` without `--product` previously triggered this. The fix filters null/undefined values before serialization so optional fields drop out cleanly.
