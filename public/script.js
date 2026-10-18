document.addEventListener("DOMContentLoaded", function () {
  console.log("🚀 Скрипт успешно запущен и видит страницу!");

  // 1. НАХОДИМ ЭЛЕМЕНТЫ ФОРМЫ
  const phone = document.querySelector("#phone");
  const form = phone ? phone.closest("form") : document.querySelector("form");
  const submitButton = form ? form.querySelector("button[type='submit']") : null;
  
  const nameInput = document.querySelector("#name") || document.querySelector("input[type='text']");
  const commentInput = document.querySelector(".comment-field input") || document.querySelector(".comment-field textarea");

  const successModal = document.querySelector("#success-modal");
  const successClose = document.querySelector("#success-close");
  const successOk = document.querySelector("#success-ok");

  // Регулярное выражение для проверки белорусского номера
  const phoneRegex = /^\+375(25|29|33|44)\d{7}$/;

  const originalButtonText = submitButton ? submitButton.textContent.trim() : "Отправить";

  // 2. Ошибки
  let phoneError = null;
  let networkError = null;

  if (phone) {
    phoneError = document.createElement("div");
    phoneError.id = "phone-error";
    phoneError.style.color = "#d9534f";
    phoneError.style.fontSize = "13px";
    phoneError.style.marginTop = "6px";
    phoneError.style.transition = "opacity 0.3s ease";
    phoneError.style.opacity = "0";
    phone.parentNode.insertBefore(phoneError, phone.nextSibling);
  }

  if (form && submitButton) {
    networkError = document.createElement("div");
    networkError.id = "network-error";
    networkError.style.color = "#d9534f";
    networkError.style.fontSize = "14px";
    networkError.style.marginTop = "10px";
    networkError.style.textAlign = "center";
    networkError.style.fontWeight = "600";
    networkError.style.transition = "opacity 0.3s ease";
    networkError.style.opacity = "0";
    
    // Ошибки под кнопкой "Отправить"
    submitButton.parentNode.insertBefore(networkError, submitButton.nextSibling);
  }

  // ТАЙМЕР НА КНОПКЕ (10 минут)
  function checkSubmitCooldown() {
    const lastSubmitTime = localStorage.getItem("lastOrderSubmitTime");
    if (!lastSubmitTime) return;

    const currentTime = new Date().getTime();
    const tenMinutesInMs = 10 * 60 * 1000;
    const timePassed = currentTime - lastSubmitTime;

    if (timePassed < tenMinutesInMs) {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.style.opacity = "0.7";
        submitButton.style.cursor = "not-allowed";

        const timeLeftMs = tenMinutesInMs - timePassed;
        const minutes = Math.floor(timeLeftMs / (1000 * 60));
        const seconds = Math.floor((timeLeftMs % (1000 * 60)) / 1000);
        const formattedSeconds = seconds < 10 ? "0" + seconds : seconds;

        submitButton.textContent = `Повтор через ${minutes}:${formattedSeconds} ☕️`;
      }
      setTimeout(checkSubmitCooldown, 1000);
    } else {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.style.opacity = "1";
        submitButton.style.cursor = "pointer";
        submitButton.textContent = originalButtonText;
      }
      localStorage.removeItem("lastOrderSubmitTime");
    }
  }

  checkSubmitCooldown();

  // 3. ПРОВЕРКА И ОТПРАВКА
  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault(); 
      console.log("🔘 Кнопка отправки НАЖАТА!");

      // Защита от двойного клика
      if (submitButton) {
        if (submitButton.disabled) return;
        submitButton.disabled = true;
        submitButton.style.opacity = "0.7";
      }

      if (!phone) {
        if (successModal) successModal.hidden = false;
        if (submitButton) submitButton.disabled = false;
        form.reset();
        return;
      }

      const phoneValue = phone.value.replace(/[\s()-]/g, "");

      // А. Если номер НЕВЕРНЫЙ
      if (!phoneRegex.test(phoneValue)) {
        if (phoneError) {
          phoneError.textContent = "Цифры запутались и не прошли кофейный контроль. Нужен правильный формат +375... ☕️";
          phoneError.style.opacity = "1";
        }
        phone.style.borderColor = "#d9534f";
        phone.style.outline = "1px solid #d9534f";
        phone.focus();

        // Разблокировка кнопки
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.style.opacity = "1";
        }
        return;
      }

      // Б. Удаление ошибок, если все верно
      if (phoneError) {
        phoneError.textContent = "";
        phoneError.style.opacity = "0";
      }
      if (networkError) {
        networkError.textContent = "";
        networkError.style.opacity = "0";
      }
      phone.style.borderColor = "";
      phone.style.outline = "";

      // В. СОБИРАЕМ ДАННЫЕ ДЛЯ TELEGRAM
      const clientName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : "Не указано";
      let textMessage = `🔔 *Ваша заявка принята!*\n\n`;
      textMessage += `👤 *Имя:* ${clientName}\n`;
      textMessage += `📞 *Телефон:* ${phone.value}`;

      if (commentInput && commentInput.value.trim() && commentInput.offsetParent !== null) {
        textMessage += `\n💬 *Вопрос:* ${commentInput.value.trim()}\n\n`;
      }

      textMessage += `Спасибо за заявку! Мы свяжемся с вами по указанному номеру в течение часа.`;


      // Запрос НА СЕРВЕР NODE.js
      console.log("Отправляем fetch запрос на локальный сервер...");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      fetch('http://localhost:3000/api/lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: clientName,
          phone: phone.value,
          comment: (commentInput && commentInput.value.trim() && commentInput.offsetParent !== null) ? commentInput.value.trim() : '',
          // 🌟 Передаем готовый красивый текст с фразой "Спасибо" прямо на сервер!
          textMessage: textMessage 
        }),

        signal: controller.signal
      })
      .then(response => {
        clearTimeout(timeoutId);
        console.log("Получен ответ от локального сервера, статус:", response.status);
        
        if (response.ok) {
          localStorage.setItem("lastOrderSubmitTime", new Date().getTime());
          checkSubmitCooldown();

          if (successModal) {
            successModal.hidden = false;
          }
          form.reset(); 
        } else {
          console.error("❌ Сервер вернул ошибку:", response.status);
          if (networkError) {
            networkError.textContent = `Ошибка сервера. Статус: ${response.status}. ☕️`;
            networkError.style.opacity = "1";
          }
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.style.opacity = "1";
          }
        }
      })
      .catch(error => {
        clearTimeout(timeoutId);
        console.error("❌ Ошибка связи с сервером Node.js:", error);
        
        if (networkError) {
          networkError.textContent = "Не удалось связаться с сервером. Убедитесь, что он запущен в терминале! ☕️";
          networkError.style.opacity = "1";
        }
        
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.style.opacity = "1";
          submitButton.textContent = originalButtonText;
        }
      });
    });
  }

  // Показ/скрытие поля комментария
  const comment = document.querySelector('.comment-field');
  const topic = document.querySelector('#topic');

  if (topic && comment) {
    topic.addEventListener("change", function () {
      if (topic.value === 'question') {
        comment.style.display = "block";
      } else {
        comment.style.display = "none";
      }
    });
  }

  // Логика закрытия окна
  function closeSuccessModal() {
    if (successModal) successModal.hidden = true;
  }

  if (successOk) successOk.addEventListener("click", closeSuccessModal);
  if (successClose) successClose.addEventListener("click", closeSuccessModal);
  if (successModal) {
    const overlay = successModal.querySelector(".success-modal__overlay");
    if (overlay) overlay.addEventListener("click", closeSuccessModal);
  }

  document.addEventListener("keydown", function (event) {
    if (successModal && event.key === "Escape" && !successModal.hidden) {
      closeSuccessModal();
    }
  });
});