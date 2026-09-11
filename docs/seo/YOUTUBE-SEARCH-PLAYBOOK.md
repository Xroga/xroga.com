# YouTube and video search playbook

Video work starts only when an actual useful video exists. Do not create VideoObject schema, a video sitemap, or a watch page for an absent asset.

## Production pattern

1. Demonstrate one bounded product task with readable input, project context, visible file changes, checks, and a truthful final state.
2. Show failures and recovery where they are instructive; do not edit away material blockers.
3. Publish a descriptive title, concise thumbnail, chaptered transcript, links to the relevant product page and evidence, and a disclosure when the example is synthetic.
4. Embed the video on a dedicated indexable watch page only when viewing that single video is the page’s main purpose.
5. Add VideoObject data and video-sitemap fields only when thumbnail, upload date, duration, player/content URL, and visible page content are all accurate.

Google’s current video guidance requires an indexed watch page with the video embedded and treats indexing as non-guaranteed: https://developers.google.com/search/docs/appearance/video
