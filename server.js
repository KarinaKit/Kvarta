require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const express = require('express');
const https = require('https');
const app = express();

app.use(express.json());

// 🌟 НАПРЯМУЮ РАЗРЕШАЕМ CORS ДЛЯ ЛЮБЫХ ДОМЕНОВ ЧЕРЕЗ ЗАГОЛОВКИ
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  
  // Если браузер делает предварительную проверку (OPTIONS), сразу отвечаем ему 200
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Роут для приема заявок с сайта
app.post("/api/lead", (req, res) => {
  console.log("=== СЕРВЕР ПОЛУЧИЛ ЗАЯВКУ ===");
  console.log("Имя клиента:", req.body.name);
  console.log("Телефон клиента:", req.body.phone);
  console.log("Комментарий:", req.body.comment || "Нет");

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("❌ ОШИБКА: Токен или ID чата не найдены в файле .env!");
    return res.status(500).send("Ошибка конфигурации сервера");
  }

  const message = req.body.textMessage;

  const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const data = JSON.stringify({
    chat_id: CHAT_ID,
    text: message
  });

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  const telegramRequest = https.request(telegramUrl, options, (telegramRes) => {
    telegramRes.on('data', () => {
      console.log("Сообщение успешно отправлено в Telegram!");
    });
  });

  telegramRequest.on('error', (error) => {
    console.error("Ошибка отправки в Telegram:", error);
  });

  telegramRequest.write(data);
  telegramRequest.end();

  res.send("Заявка успешно обработана сервером!");
});

// Запуск сервера на порту 3000
app.listen(3000, () => {
  console.log("🚀 Сервер успешно запущен на http://localhost:3000");
});
