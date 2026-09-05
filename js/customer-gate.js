/* شناسایی مشتری روی ورود — شماره / خوش‌آمد / نام + تولد شمسی */

const CUSTOMER_STORAGE_KEY = "gaff-customer-v1";

const JALALI_MONTHS = [
  { value: 1, label: "فروردین", days: 31 },
  { value: 2, label: "اردیبهشت", days: 31 },
  { value: 3, label: "خرداد", days: 31 },
  { value: 4, label: "تیر", days: 31 },
  { value: 5, label: "مرداد", days: 31 },
  { value: 6, label: "شهریور", days: 31 },
  { value: 7, label: "مهر", days: 30 },
  { value: 8, label: "آبان", days: 30 },
  { value: 9, label: "آذر", days: 30 },
  { value: 10, label: "دی", days: 30 },
  { value: 11, label: "بهمن", days: 30 },
  { value: 12, label: "اسفند", days: 30 },
];

function loadCustomerSession() {
  try {
    const raw = localStorage.getItem(CUSTOMER_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.phone) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCustomerSession(customer) {
  try {
    localStorage.setItem(
      CUSTOMER_STORAGE_KEY,
      JSON.stringify({
        phone: customer.phone,
        name: customer.name || "",
        birthJalali: customer.birthJalali || "",
        savedAt: Date.now(),
      })
    );
  } catch {
    /* ignore */
  }
}

function getCustomerPhone() {
  const session = loadCustomerSession();
  return session && session.phone ? session.phone : "";
}

function normalizePhoneClient(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("98") && digits.length >= 12) digits = "0" + digits.slice(2);
  if (digits.length === 10 && digits.startsWith("9")) digits = "0" + digits;
  if (!/^09\d{9}$/.test(digits)) return null;
  return digits;
}

function initCustomerGate(options) {
  const opts = options || {};
  const onReady = typeof opts.onReady === "function" ? opts.onReady : function () {};
  const showToast = typeof opts.showToast === "function" ? opts.showToast : function () {};

  const gate = document.getElementById("customerGate");
  const phoneStep = document.getElementById("gatePhoneStep");
  const profileStep = document.getElementById("gateProfileStep");
  const welcomeStep = document.getElementById("gateWelcomeStep");
  const phoneForm = document.getElementById("gatePhoneForm");
  const profileForm = document.getElementById("gateProfileForm");
  const phoneInput = document.getElementById("gatePhone");
  const nameInput = document.getElementById("gateName");
  const yearSelect = document.getElementById("gateBirthYear");
  const monthSelect = document.getElementById("gateBirthMonth");
  const daySelect = document.getElementById("gateBirthDay");
  const phoneError = document.getElementById("gatePhoneError");
  const profileError = document.getElementById("gateProfileError");
  const welcomeText = document.getElementById("gateWelcomeText");
  const welcomeContinue = document.getElementById("gateWelcomeContinue");

  if (!gate || !phoneForm || !profileForm) {
    onReady(loadCustomerSession());
    return;
  }

  const welcomeNameEl = document.getElementById("gateWelcomeName");
  const welcomeLead = document.getElementById("gateWelcomeLead");
  const stepDots = gate.querySelectorAll(".gate-step-dot");

  let pendingPhone = "";

  function fillYears() {
    if (!yearSelect || yearSelect.options.length > 1) return;
    // تقریبی: ۱۳۲۰ تا ۱۳۹۵
    for (let y = 1395; y >= 1320; y -= 1) {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = new Intl.NumberFormat("fa-IR").format(y);
      yearSelect.appendChild(opt);
    }
  }

  function fillMonths() {
    if (!monthSelect || monthSelect.options.length > 1) return;
    JALALI_MONTHS.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = String(m.value);
      opt.textContent = m.label;
      monthSelect.appendChild(opt);
    });
  }

  function fillDays() {
    if (!daySelect) return;
    const month = Number(monthSelect.value) || 1;
    const meta = JALALI_MONTHS.find((m) => m.value === month) || JALALI_MONTHS[0];
    const current = daySelect.value;
    daySelect.innerHTML = '<option value="">روز</option>';
    for (let d = 1; d <= meta.days; d += 1) {
      const opt = document.createElement("option");
      opt.value = String(d);
      opt.textContent = new Intl.NumberFormat("fa-IR").format(d);
      daySelect.appendChild(opt);
    }
    if (current && Number(current) <= meta.days) daySelect.value = current;
  }

  function updateStepDots(step) {
    const order = ["phone", "profile", "welcome"];
    const idx = order.indexOf(step);
    stepDots.forEach((dot) => {
      const key = dot.dataset.step;
      const di = order.indexOf(key);
      dot.classList.toggle("is-active", key === step);
      dot.classList.toggle("is-done", di > -1 && di < idx);
    });
  }

  function showStep(step) {
    phoneStep.hidden = step !== "phone";
    profileStep.hidden = step !== "profile";
    welcomeStep.hidden = step !== "welcome";
    updateStepDots(step);

    const active = step === "phone" ? phoneStep : step === "profile" ? profileStep : welcomeStep;
    if (active) {
      active.style.animation = "none";
      void active.offsetWidth;
      active.style.animation = "";
    }
  }

  function openGate() {
    document.body.classList.add("gate-open");
    if (typeof gate.showModal === "function" && !gate.open) {
      gate.showModal();
    } else {
      gate.setAttribute("open", "");
    }
  }

  function closeGate() {
    document.body.classList.remove("gate-open");
    if (typeof gate.close === "function" && gate.open) {
      gate.close();
    } else {
      gate.removeAttribute("open");
    }
  }

  function finish(customer, welcomeName) {
    saveCustomerSession(customer);
    if (welcomeName) {
      if (welcomeNameEl) {
        welcomeNameEl.textContent = welcomeName + " عزیز";
      } else if (welcomeText) {
        welcomeText.textContent = "سلام، " + welcomeName + " عزیز";
      }
      if (welcomeLead) {
        welcomeLead.textContent = "از دیدنتان خوشحالیم. منوی امروز آماده است.";
      }
      showStep("welcome");
      openGate();
      return;
    }
    closeGate();
    onReady(customer);
  }

  fillYears();
  fillMonths();
  fillDays();
  monthSelect.addEventListener("change", fillDays);

  phoneForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    phoneError.hidden = true;
    const phone = normalizePhoneClient(phoneInput.value);
    if (!phone) {
      phoneError.textContent = "شماره را به‌صورت ۰۹xxxxxxxxx وارد کنید";
      phoneError.hidden = false;
      return;
    }

    const btn = phoneForm.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const res = await fetch("/api/customers/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "خطا در بررسی شماره");

      pendingPhone = phone;
      if (data.exists && data.hasName) {
        finish(
          {
            phone: data.phone,
            name: data.name,
            birthJalali: data.birthJalali || "",
          },
          data.name
        );
      } else {
        pendingPhone = phone;
        if (nameInput) nameInput.value = data.name || "";
        showStep("profile");
      }
    } catch (err) {
      phoneError.textContent = err.message || "خطا در ارتباط";
      phoneError.hidden = false;
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    profileError.hidden = true;
    const phone = pendingPhone || normalizePhoneClient(phoneInput.value);
    if (!phone) {
      profileError.textContent = "شماره نامعتبر است — دوباره تلاش کنید";
      profileError.hidden = false;
      showStep("phone");
      return;
    }

    const birthYear = Number(yearSelect.value);
    const birthMonth = Number(monthSelect.value);
    const birthDay = Number(daySelect.value);
    if (!birthYear || !birthMonth || !birthDay) {
      profileError.textContent = "تاریخ تولد شمسی را کامل انتخاب کنید";
      profileError.hidden = false;
      return;
    }

    const btn = profileForm.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const res = await fetch("/api/customers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          name: nameInput.value.trim(),
          birthYear,
          birthMonth,
          birthDay,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.customer) {
        throw new Error(data.error || "ثبت ناموفق بود");
      }
      const customer = data.customer;
      if (customer.name) {
        finish(customer, customer.name);
      } else {
        finish(customer);
        showToast("ثبت شد — نوش جان");
      }
    } catch (err) {
      profileError.textContent = err.message || "خطا در ثبت";
      profileError.hidden = false;
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  if (welcomeContinue) {
    welcomeContinue.addEventListener("click", () => {
      closeGate();
      onReady(loadCustomerSession());
    });
  }

  // جلوگیری از بستن بدون ثبت
  gate.addEventListener("cancel", (e) => {
    e.preventDefault();
  });

  async function bootGate() {
    const session = loadCustomerSession();
    if (session && session.phone) {
      try {
        const res = await fetch("/api/customers/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: session.phone }),
        });
        const data = await res.json();
        if (res.ok && data.ok && data.exists) {
          const customer = {
            phone: data.phone,
            name: data.name || session.name || "",
            birthJalali: data.birthJalali || session.birthJalali || "",
          };
          saveCustomerSession(customer);
          if (customer.name) {
            finish(customer, customer.name);
            return;
          }
          pendingPhone = customer.phone;
          if (phoneInput) phoneInput.value = customer.phone;
          showStep("profile");
          openGate();
          return;
        }
      } catch {
        /* fall through to phone step */
      }
    }

    showStep("phone");
    openGate();
  }

  bootGate();
}
