import fs from "fs";
import path from "path";

let Innertube = null;
let ytPromise = null;

let serverStartTime = Date.now();
let requestCount = 0;
let errorCount = 0;
let recentLogs = [];

function logActivity(message) {
  const timestamp = new Date().toISOString();
  recentLogs.unshift(`[${timestamp}] ${message}`);
  if (recentLogs.length > 20) recentLogs.pop();
}

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

async function generateThumbnails(videoId) {
  if (!videoId) return {};
  try {
    const url = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch thumbnail: ${res.status}`);
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return {
      medium: { url: `data:image/jpeg;base64,${base64}` }
    };
  } catch (err) {
    return { medium: { url: "" } };
  }
}

function normalizeViewCount(viewText) {
  if (typeof viewText !== "string") return "0";
  if (viewText.includes("万")) {
    const num = parseFloat(viewText.replace(/[^\d.]/g, ""));
    return Math.round(num * 10000).toString();
  }
  if (viewText.includes("億")) {
    const num = parseFloat(viewText.replace(/[^\d.]/g, ""));
    return Math.round(num * 100000000).toString();
  }
  return viewText.replace(/[^\d]/g, "") || "0";
}

function formatPublishedAtJapanese(relativeText) {
  if (!relativeText) return "不明";
  const regex = /(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i;
  const match = relativeText.match(regex);
  if (!match) {
    if (typeof relativeText === "string" && /前$/.test(relativeText)) {
      return relativeText;
    }
    return "不明";
  }
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case "second":
      return value < 60 ? "たった今" : `${value}秒前`;
    case "minute":
      return value === 1 ? "1分前" : `${value}分前`;
    case "hour":
      return value === 1 ? "1時間前" : `${value}時間前`;
    case "day":
      return value === 1 ? "1日前" : `${value}日前`;
    case "week":
      return value === 1 ? "1週間前" : `${value}週間前`;
    case "month":
      return value === 1 ? "1ヶ月前" : `${value}ヶ月前`;
    case "year":
      return value === 1 ? "1年前" : `${value}年前`;
    default:
      return "不明";
  }
}

export default async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  if (urlObj.pathname === "/" && !req.query?.action) {
    try {
      const htmlPath = path.join(process.cwd(), "
status.html




");
      if (fs.existsSync(htmlPath)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.end(fs.readFileSync(htmlPath, "utf-8"));
      }
    } catch (e) {}
  }

  if (req.query?.action === "status_api") {
    res.setHeader("Content-Type", "application/json");
    return res.json({
      status: "Online",
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      totalRequests: requestCount,
      errors: errorCount,
      ytInitialized: !!ytPromise,
      logs: recentLogs
    });
  }

  requestCount++;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Content-Type", "application/json");

  try {
    const yt = await getYT();

    const { action } = req.query;

    if (action === "search") {
      logActivity(`Action: search, q: ${req.query.q || ""}`);
      const q = req.query.q;
      const pageToken = req.query.pageToken;

      if (!q && !pageToken) {
        return res.status(400).json({
          error: "Missing q parameter"
        });
      }

      let result;
      if (pageToken) {
        result = await yt.getSearchContinuation(pageToken);
      } else {
        result = await yt.search(q, {
          type: "video,channel",
          limit: 20,
          params: {
            gl: "JP",
            hl: "ja",
          },
        });
      }

      const videos = await Promise.all(
        (result.results || [])
          .filter(item => ["Video", "Channel"].includes(item.type))
          .map(async item => {
            if (item.type === "Video") {
              const videoId = item.video_id || item.id;
              return {
                type: "video",
                id: videoId,
                title: item.title?.text || item.title?.runs?.[0]?.text || "無題",
                duration: item.duration?.text || "不明",
                publishedAt: formatPublishedAtJapanese(item.published?.text || ""),
                channel: item.author?.name || "不明なチャンネル",
                channelId: item.author?.id || "",
                channelIcon: item.author?.thumbnails?.[0]?.url || "",
                thumbnails: await generateThumbnails(videoId),
                viewCount: normalizeViewCount(item.view_count?.text || ""),
              };
            } else if (item.type === "Channel") {
              return {
                type: "channel",
                id: item.channel_id || item.id,
                name: item.author?.name || "不明なチャンネル",
                icon: item.author?.thumbnails?.[0]?.url || "",
                subscriberCount: item.video_count?.text || "不明",
              };
            }
          })
      );

      return res.json({
        results: videos,
        nextPageToken: result.continuation || null,
      });
    }

    if (action === "video") {
      logActivity(`Action: video, id: ${req.query.id || ""}`);
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
      logActivity(`Action: comments, id: ${req.query.id || ""}`);
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
      logActivity(`Action: related, id: ${req.query.id || ""}`);
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
      logActivity(`Action: full, id: ${req.query.id || ""}`);
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
      logActivity(`Action: trending`);
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
    errorCount++;
    logActivity(`Error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
