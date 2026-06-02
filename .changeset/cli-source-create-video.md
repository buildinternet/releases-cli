---
"@buildinternet/releases": minor
---

Add `admin source create-video <channel-or-playlist-url> --org <slug>` to materialize a `video` source from a YouTube channel/playlist (`POST /v1/sources/video`), surfacing the resolved provider/channel and backfilled release count. The generic `source create` now rejects `--type video` and pasted `youtube.com`/`youtu.be` URLs with a pointer to the dedicated verb — mirroring the App Store guard — so a YouTube URL can no longer be silently mis-created as an empty-bodied feed source.
