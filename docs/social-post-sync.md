# Private SNS captures

Nori captures SNS posts on the user's device and syncs the captured content directly to
Supabase. Every user can save posts locally; syncing them requires the Nori Sync plan.
Database and storage policies enforce ownership and paid cloud writes even for a client
calling the API directly. Local saves remain readable offline.

New bookmarks of a supported post are captured automatically, one at a time, on the device
that adds them; the "Save social posts offline" setting (on by default) turns this off, and
the bookmark menu's save action re-captures at any time. Existing bookmarks are not backfilled,
and a URL that already has a capture is not captured again automatically.

A capture belongs to the account the device's data belongs to: the signed-in account, the
previous one while an account choice is pending, or the active profile's account in the
extension and desktop app. Saved while signed out (or in the anonymous profile), it belongs
to no one (`owner: ''`). Auto-save waits for the session to load, and skips a URL whose
bookmark already references a synced capture. Captures that belong to no one are shown to whoever uses the device, and the
first paid sync of a bookmark with that URL claims them. Choosing to replace the device's
data with an account's drops them; merging the device adopts them. Local captures are
removed along with the last bookmark of their URL.

Each capture has a new UUID v4. Its post JSON is stored in `nori.saved_posts` with `user_id`,
`version`, and `captured_at`. Media bytes are stored in the private `nori-sns-media` bucket
at `<userId>/<captureId>-<assetIndex>`. The index follows the local `postAssets` enumerator,
including avatars, previews, link thumbnails and nested/related posts. Native file-backed images are read locally and identified by their byte signatures.
Unsupported image formats are rejected before a save succeeds; JPEG aliases are normalized.
Only raster image bytes are uploaded, including video/audio preview images; no playable media is fetched.

Version 1 stores Nori's `SocialPost` format in the row's `data` JSONB. Original media URLs
remain metadata; sync only uploads already cached bytes and downloads signed private
objects. Device cache paths and former NG asset IDs are stripped from cloud JSON. Future
unknown versions fail without replacing the local copy. This format evolves independently
of NG's public retrieval API.

Sync uploads every image before inserting the immutable row, then publishes
`bookmark.json.socialPost = { postId: captureId, savedAt, url }`. Failed uploads leave the
local capture pending; failed reference publication reuses a verified recent upload. Old unpublished uploads
receive fresh IDs before republishing so concurrent orphan cleanup cannot remove the reused
row. A missing cloud row is re-uploaded from the exact local capture and cached media;
temporary read failures preserve local state and are retried. Another
device downloads the entire capture before replacing its offline copy. There is no provider
refetch during sync and no shared current row that another user can refresh.

Only an active paid account may insert rows or media. Owners can read and delete existing
cloud content after their plan expires. Updates are denied: saving again creates a new
capture. Normal app sync pauses when the plan expires, consistent with screenshot sync.
Account deletion removes the user's media folder and cascades their private database rows.
After each full bookmark pull, unreferenced rows and media older than seven days are
removed, including leftovers of interrupted uploads. Tombstone references remain protected
for Undo. Recent captures are retained so another device has time to publish its reference.
An explicit device-to-account merge adopts complete local captures and uploads fresh copies;
references into the previous account never grant access.

Apply Inks migration `20261115000003_nori_saved_posts.sql` before deploying these clients
or the updated account-deletion endpoint. Existing downloaded NG captures can upload into
private storage. A former NG reference without a local capture cannot restore content through
this new sync path; capture that URL again locally. NG remains an independent experiment.
