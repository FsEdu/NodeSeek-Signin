export default {
  // 手动访问 Worker 的 HTTP 入口
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/checkin") {
      const results = await handleSignIn(env);
      return new Response(
        JSON.stringify({
          ok: true,
          message: "NodeSeek 多账号签到完成",
          results
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 默认返回健康检查
    return new Response(
      "✅ NodeSeek 签到 Worker 正常运行中，访问 /checkin 可手动触发签到",
      { status: 200 }
    );
  },

  // 定时 Cron 触发入口
  async scheduled(event, env, ctx) {
    await handleSignIn(env);
  }
};

async function handleSignIn(env) {
  const results = [];

  const wisdomStatements = [
    { text: "人生不是等待暴风雨过去，而是学会在雨中跳舞。", author: "维维安·格林" },
    { text: "我思故我在。", author: "笛卡尔" },
    { text: "不是所有的云都下雨，不是所有的努力都有回报，但所有的努力都值得尊重。", author: "网络" },
    { text: "种一棵树最好的时间是十年前，其次是现在。", author: "非洲谚语" },
    { text: "知之者不如好之者，好之者不如乐之者。", author: "孔子" },
    { text: "真正的聪明，是知道自己无知。", author: "苏格拉底" },
    { text: "Stay hungry, stay foolish.", author: "乔布斯" },
    { text: "你若盛开，蝴蝶自来；你若精彩，天自安排。", author: "网络" },
    { text: "我们都有属于自己的时区，人生不必攀比。", author: "网络" },
    { text: "被讨厌的勇气，是自由的开端。", author: "岸见一郎" },
    { text: "给我一个支点，我可以撬动整个地球。", author: "阿基米德" }
  ];

  const tgToken = env.TG_BOT_TOKEN;
  const tgUser = env.TG_USER_ID;

  // 北京时间戳
  const now = new Date();
  const utc8Time = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const timeStr = utc8Time.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  for (let i = 1; i <= 10; i++) {
    const cookie = env[`NS_COOKIE_${i}`];
    const user = env[`USER_${i}`];

    if (!cookie || !user) continue;

    try {
      // 随机延时 1~10 秒，稍微自然一点
      const delay = 1000 + Math.floor(Math.random() * 9000);
      await sleep(delay);

      const result = await checkInAccount(cookie);

      const wisdom = getRandomWisdom(wisdomStatements);
      let msg = `⏰ 时间：${timeStr}\n\n账号 *${user}*：`;

      if (result.success) {
        const reward = result.reward ?? "-";
        msg += `\n✅ NodeSeek 签到成功！\n\n`
             + `今日奖励：${reward}\n`
             + (result.rawMessage ? `服务端消息：${result.rawMessage}\n\n` : `\n`)
             + `💡 出自 *${wisdom.author}*：${wisdom.text}`;
      } else {
        msg += `\n❌ NodeSeek 签到失败\n\n`
             + `原因：${result.message}\n\n`
             + (result.response ? `返回内容片段：\n${result.response.slice(0, 200)}\n\n` : ``)
             + `💡 出自 *${wisdom.author}*：${wisdom.text}`;
      }

      await sendTG(tgToken, tgUser, msg);
      results.push(msg);
    } catch (err) {
      const msg =
        `⏰ 时间：${timeStr}\n\n` +
        `❌ *${user}* 签到异常：${err.message}`;
      await sendTG(tgToken, tgUser, msg);
      results.push(msg);
    }
  }

  return results;
}

// 使用新接口 https://www.nodeseek.com/api/attendance?random=true
async function checkInAccount(cookie) {
  const headers = {
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Content-Length": "0",
    "Origin": "https://www.nodeseek.com",
    "Referer": "https://www.nodeseek.com/board",
    "Sec-CH-UA": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Cookie": cookie
  };

  try {
    const url = "https://www.nodeseek.com/api/attendance?random=true";
    const res = await fetch(url, {
      method: "POST",
      headers,
    });

    const text = await res.text();
    let json = null;

    try {
      json = JSON.parse(text);
    } catch (_) {
      // 不是 JSON 就当纯文本
    }

    if (!res.ok) {
      return {
        success: false,
        message: `HTTP 状态码 ${res.status}`,
        response: text
      };
    }

    if (json && typeof json === "object") {
      const success = !!json.success;
      const msg = json.message || "";
      const reward = json.data && json.data.reward;

      if (success) {
        return {
          success: true,
          message: msg || "签到成功",
          rawMessage: msg,
          reward
        };
      }

      return {
        success: false,
        message: msg || "签到失败（服务端返回未成功）",
        rawMessage: msg,
        response: text
      };
    }

    return {
      success: false,
      message: "返回内容无法解析为 JSON",
      response: text
    };
  } catch (error) {
    return {
      success: false,
      message: `请求异常：${error.message}`
    };
  }
}

// 发送 Telegram 通知
async function sendTG(botToken, chatId, msg) {
  if (!botToken || !chatId) return;

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: msg,
      parse_mode: "Markdown"
    })
  });
}

// 随机选一句鸡汤
function getRandomWisdom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// 延时工具
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

