if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}


const express = require('express');
const https = require('https');
const app = express();

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


app.post("/api/lead", (req, res) => {
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
            message: "Заявка успешно отправлена!"
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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});