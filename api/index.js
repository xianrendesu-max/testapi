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
  // どの環境でも確実にクエリパラメータをパースする構造に変更
  const host = req.headers.host || "localhost";
  const urlObj = new URL(req.url, `http://${host}`);
  
  const getQueryParam = (key) => {
    if (req.query && req.query[key]) return req.query[key];
    return urlObj.searchParams.get(key);
  };
  
  const action = getQueryParam("action");

  // リクエスト数を正確にカウントするため、すべての正常なエンドポイントの前に配置
  requestCount++;

  // 1. ダッシュボードAPIの判定
  if (action === "status_api") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Content-Type", "application/json");
    
    const sendJson = (data) => {
      if (typeof res.json === "function") return res.json(data);
      return res.end(JSON.stringify(data));
    };
    
    return sendJson({
      status: "Online",
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      totalRequests: requestCount,
      errors: errorCount,
      ytInitialized: !!ytPromise,
      logs: recentLogs
    });
  }

  // 2. パラメータなしのルートアクセス時は HTML ダッシュボードを返す
  if ((urlObj.pathname === "/" || urlObj.pathname === "") && !action) {
    const fs = require("fs");
    const path = require("path");
    try {
      const htmlPath = path.join(process.cwd(), "status.html");
      if (fs.existsSync(htmlPath)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.end(fs.readFileSync(htmlPath, "utf-8"));
      }
    } catch (e) {}
  }

  // 3. メインのAPI用ヘッダー定義
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Content-Type", "application/json");

  const sendResponse = (status, data) => {
    res.statusCode = status;
    if (typeof res.json === "function") {
      return res.json(data);
    }
    return res.end(JSON.stringify(data));
  };

  try {
    const yt = await getYT();

    if (action === "search") {
      const q = getQueryParam("q");
      const pageToken = getQueryParam("pageToken");
      logActivity(`Action: search, q: ${q || ""}`);

      if (!q && !pageToken) {
        return sendResponse(400, { error: "Missing q parameter" });
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

      return sendResponse(200, result);
    }

    if (action === "video") {
      const id = getQueryParam("id");
      logActivity(`Action: video, id: ${id || ""}`);

      const info = await yt.getInfo(id);
      return sendResponse(200, info);
    }

    if (action === "comments") {
      const id = getQueryParam("id");
      logActivity(`Action: comments, id: ${id || ""}`);

      const commentSection = await yt.getComments(id);
      return sendResponse(200, commentSection);
    }

    if (action === "related") {
      const id = getQueryParam("id");
      logActivity(`Action: related, id: ${id || ""}`);

      const info = await yt.getInfo(id);
      return sendResponse(200, info.watch_next_feed || {});
    }

    if (action === "full") {
      const id = getQueryParam("id");
      logActivity(`Action: full, id: ${id || ""}`);

      const info = await yt.getInfo(id);
      
      let comments = null;
      try {
        comments = await yt.getComments(id);
      } catch {}

      return sendResponse(200, {
        info: info,
        comments: comments
      });
    }

    if (action === "trending") {
      logActivity(`Action: trending`);
      const feed = await yt.getTrending();
      return sendResponse(200, feed);
    }

    return sendResponse(400, {
      success: false,
      error: "Unknown action"
    });

  } catch (err) {
    errorCount++;
    logActivity(`Error: ${err.message}`);
    return sendResponse(500, {
      success: false,
      error: err.message
    });
  }
};
