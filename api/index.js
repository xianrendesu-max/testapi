let Innertube = null;
let ytPromise = null;

async function getYT() {
  if (!Innertube) {
    const module = await import("youtubei.js");
    Innertube = module.Innertube;
  }
  if (!ytPromise) {
    ytPromise = Innertube.create();
  }
  return ytPromise;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Content-Type", "application/json");

  try {
    const yt = await getYT();

    const { action } = req.query;

    if (action === "search") {
      const q = req.query.q;

      if (!q) {
        return res.status(400).json({
          error: "Missing q parameter"
        });
      }

      const results = await yt.search(q);

      return res.json(
        results.videos.map(v => ({
          type: "video",
          title: v.title?.text || "",
          videoId: v.id || "",
          author: v.author?.name || "",
          authorId: v.author?.id || "",
          videoThumbnails: v.thumbnails || [],
          description: v.description || "",
          viewCount: parseInt(v.view_count?.text?.replace(/[^0-9]/g, "")) || 0,
          publishedText: v.published?.text || "",
          lengthSeconds: v.duration?.seconds || 0
        }))
      );
    }

    if (action === "video") {
      const id = req.query.id;

      const info = await yt.getInfo(id);
      const v = info.basic_info;

      return res.json({
        title: v.title || "",
        videoId: v.id || "",
        videoThumbnails: v.thumbnail || [],
        description: v.short_description || "",
        lengthSeconds: v.duration?.seconds || 0,
        viewCount: v.view_count || 0,
        likeCount: v.like_count || 0,
        author: v.author?.name || "",
        authorId: v.author?.id || "",
        publishedText: v.publish_date || ""
      });
    }

    if (action === "comments") {
      const id = req.query.id;

      const commentSection = await yt.getComments(id);
      const commentThreads = commentSection.contents || [];

      return res.json({
        commentCount: commentThreads.length,
        comments: commentThreads.map(thread => {
          const c = thread.comment;
          return {
            author: c?.author?.name || "",
            authorId: c?.author?.id || "",
            content: c?.content?.toString() || "",
            publishedText: c?.published_time || "",
            likeCount: c?.like_count || 0,
            commentId: c?.comment_id || ""
          };
        })
      });
    }

    if (action === "related") {
      const id = req.query.id;

      const info = await yt.getInfo(id);

      const related =
        info.watch_next_feed?.secondary_results?.map(v => ({
          type: "video",
          title: v.title?.text || "",
          videoId: v.id || "",
          author: v.author?.name || "",
          authorId: v.author?.id || "",
          lengthSeconds: v.duration?.seconds || 0,
          viewCountText: v.view_count?.text || ""
        })) || [];

      return res.json({
        recommendedVideos: related
      });
    }

    if (action === "full") {
      const id = req.query.id;

      const info = await yt.getInfo(id);

      let comments = [];

      try {
        const commentSection = await yt.getComments(id);
        const commentThreads = commentSection.contents || [];

        comments = commentThreads.slice(0, 20).map(thread => {
          const c = thread.comment;
          return {
            author: c?.author?.name || "",
            content: c?.content?.toString() || "",
            likeCount: c?.like_count || 0
          };
        });
      } catch {}

      const feedVideos = info.watch_next_feed?.secondary_results || [];
      const related =
        feedVideos.slice(0, 20).map(v => ({
          videoId: v.id || "",
          title: v.title?.text || ""
        })) || [];

      return res.json({
        title: info.basic_info?.title || "",
        videoId: info.basic_info?.id || "",
        description: info.basic_info?.short_description || "",
        comments: comments,
        recommendedVideos: related
      });
    }

    if (action === "trending") {
      const feed = await yt.getTrending();

      return res.json(
        feed.videos.map(v => ({
          title: v.title?.text || "",
          videoId: v.id || "",
          author: v.author?.name || "",
          viewCount: parseInt(v.view_count?.text?.replace(/[^0-9]/g, "")) || 0
        }))
      );
    }

    res.status(400).json({
      success: false,
      error: "Unknown action"
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
