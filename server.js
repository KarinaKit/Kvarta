if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const https = require('https');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error('Не настроено подключение к Supabase');
  }

  return createClient(url, key);
}


app.use((req, res, next) => {
  const allowedOrigins = [
    'http://127.0.0.1:5500',
    'http://localhost:5500'
  ];

  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());
app.get("/", (req, res) => {
  res.redirect("/index.html");
});


app.post("/api/lead", async (req, res) => {
  console.log("=== СЕРВЕР ПОЛУЧИЛ ЗАЯВКУ ===");

  const { name, phone, comment, textMessage } = req.body;

  console.log("Имя клиента:", name);
  console.log("Телефон клиента:", phone);
  console.log("Комментарий:", comment || "Не указан");

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("Ошибка: не найдены настройки Telegram");

    return res.status(500).json({
      success: false,
      message: "Ошибка конфигурации сервера"
    });
  }

  // Проверяем, что сообщение действительно сформировано
  if (!textMessage || typeof textMessage !== "string") {
    return res.status(400).json({
      success: false,
      message: "Не удалось сформировать сообщение заявки"
    });
  }

    const token = crypto.randomBytes(24).toString("hex");

  const supabase = getSupabase();

  const { error: saveError } = await supabase
    .from("telegram_pending_leads")
    .insert({
      token,
      name: name || "Не указано",
      phone,
      comment: comment || null,
      expires_at: new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString()
    });

  if (saveError) {
    console.error("Ошибка сохранения заявки в Supabase:", saveError.message);

    return res.status(500).json({
      success: false,
      message: "Не удалось сохранить заявку. Попробуйте позже."
    });
  }

  const telegramLink =
    `https://t.me/RoastMap_bot?start=${token}`;
  

  const telegramUrl =
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  const data = JSON.stringify({
    chat_id: CHAT_ID,
    text: textMessage
  });

  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data)
    }
  };

  const telegramRequest = https.request(
    telegramUrl,
    options,
    (telegramRes) => {
      let responseData = "";

      telegramRes.setEncoding("utf8");

      telegramRes.on("data", (chunk) => {
        responseData += chunk;
      });

      telegramRes.on("end", () => {
        let telegramResult;

        try {
          telegramResult = JSON.parse(responseData);
        } catch (error) {
          console.error("Не удалось прочитать ответ Telegram");

          return res.status(502).json({
            success: false,
            message: "Не удалось проверить отправку заявки"
          });
        }

        // Проверяем и HTTP-статус, и подтверждение Telegram
        if (
          telegramRes.statusCode >= 200 &&
          telegramRes.statusCode < 300 &&
          telegramResult.ok === true
        ) {
          console.log("Заявка успешно отправлена в Telegram!");

          return res.status(200).json({
          success: true,
          message: "Заявка успешно отправлена!",
          telegramLink: telegramLink
          });
        }

        console.error(
          "Telegram отклонил сообщение:",
          telegramResult.description || responseData
        );

        return res.status(502).json({
          success: false,
          message: "Не удалось отправить заявку. Попробуйте позже."
        });
      });
    }
  );

  telegramRequest.setTimeout(15000, () => {
    telegramRequest.destroy(
      new Error("Превышено время ожидания ответа Telegram")
    );
  });

  telegramRequest.on("error", (error) => {
    console.error("Ошибка отправки в Telegram:", error.message);

    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        message: "Ошибка отправки заявки. Попробуйте позже."
      });
    }
  });

  telegramRequest.write(data);
  telegramRequest.end();
});

app.post("/api/telegram-webhook", async (req, res) => {
  if (
    req.headers["x-telegram-bot-api-secret-token"] !==
    process.env.TELEGRAM_WEBHOOK_SECRET
  ) {
    return res.sendStatus(401);
  }

  const message = req.body.message;
  const text = message?.text || "";
  const match = text.match(/^\/start\s+([a-f0-9]{48})$/);

  if (!message || !match) {
    return res.sendStatus(200);
  }

  try {
    const supabase = getSupabase();
    const token = match[1];

    const { data: lead, error } = await supabase
      .from("telegram_pending_leads")
      .select("name, phone, comment, token")
      .eq("token", token)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) throw error;

    let reply;

    if (!lead) {
      reply =
        "Ссылка недействительна или срок её действия истёк. Пожалуйста, отправьте заявку на сайте ещё раз.";
    } else {
    reply =
      `Ваша заявка принята!\n\n` +
      `Имя: ${lead.name}\n` +
      `Телефон: ${lead.phone}\n` +
      (lead.comment ? `Комментарий: ${lead.comment}\n\n` : "\n") +
      `Спасибо за заявку! Мы свяжемся с вами в течение часа ☕️.`;


      const { error: updateError } = await supabase
        .from("telegram_pending_leads")
        .update({ used_at: new Date().toISOString() })
        .eq("token", token)
        .is("used_at", null);

      if (updateError) throw updateError;
    }

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: reply
        })
      }
    );

    if (!telegramResponse.ok) {
      console.error("Не удалось отправить сообщение клиенту");
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Ошибка Telegram webhook:", error.message);
    return res.sendStatus(200);
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});