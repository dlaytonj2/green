const menuBtn = document.querySelector("[data-menu-btn]");
const nav = document.querySelector("[data-nav]");
const MIN_LEAD_DAYS = 2;

if (menuBtn && nav) {
  menuBtn.addEventListener("click", () => {
    nav.classList.toggle("open");
  });
}

document.querySelectorAll(".faq-question").forEach((button) => {
  button.addEventListener("click", () => {
    const item = button.closest(".faq-item");
    if (!item) return;
    item.classList.toggle("open");
  });
});

const reservationForm = document.querySelector("#reservation-form");

function parseDateValue(value) {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function getLeadTimeStartDate() {
  const today = new Date();
  return addDays(today, MIN_LEAD_DAYS);
}

function getReservationValidationErrors(checkInValue, checkOutValue) {
  const errors = {};
  const checkInDate = parseDateValue(checkInValue);
  const checkOutDate = parseDateValue(checkOutValue);
  const leadTimeDate = getLeadTimeStartDate();

  if (!checkInDate || !checkOutDate) {
    return errors;
  }

  if (checkOutDate <= checkInDate) {
    errors.checkOut = "Check-out must be at least one day after check-in.";
  }

  if (checkInDate < leadTimeDate) {
    const earliest = formatDateInputValue(leadTimeDate);
    errors.checkIn = `Check-in must be at least ${MIN_LEAD_DAYS} days from today (${earliest} or later).`;
  }

  return errors;
}

function setStatusMessage(element, message, type) {
  if (!element) return;
  element.textContent = message;
  element.classList.remove("is-success", "is-error");
  if (type === "success") {
    element.classList.add("is-success");
  } else if (type === "error") {
    element.classList.add("is-error");
  }
}

if (reservationForm) {
  const checkInInput = reservationForm.querySelector("#check-in");
  const checkOutInput = reservationForm.querySelector("#check-out");
  const statusElement = reservationForm.querySelector("[data-form-status]");
  const submitButton = reservationForm.querySelector('button[type="submit"]');

  const applyDateConstraints = () => {
    if (!checkInInput || !checkOutInput) return;

    const leadTimeDate = getLeadTimeStartDate();
    checkInInput.min = formatDateInputValue(leadTimeDate);

    const selectedCheckIn = parseDateValue(checkInInput.value);
    const checkOutMinDate = selectedCheckIn ? addDays(selectedCheckIn, 1) : addDays(leadTimeDate, 1);
    checkOutInput.min = formatDateInputValue(checkOutMinDate);

    const selectedCheckOut = parseDateValue(checkOutInput.value);
    if (selectedCheckOut && selectedCheckOut <= checkOutMinDate) {
      checkOutInput.value = formatDateInputValue(checkOutMinDate);
    }
  };

  const clearBusinessValidity = () => {
    if (checkInInput) checkInInput.setCustomValidity("");
    if (checkOutInput) checkOutInput.setCustomValidity("");
  };

  checkInInput?.addEventListener("change", () => {
    clearBusinessValidity();
    applyDateConstraints();
  });
  checkOutInput?.addEventListener("change", clearBusinessValidity);

  applyDateConstraints();

  reservationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!checkInInput || !checkOutInput) return;

    clearBusinessValidity();
    setStatusMessage(statusElement, "", "");

    const ruleErrors = getReservationValidationErrors(checkInInput.value, checkOutInput.value);
    if (ruleErrors.checkIn) {
      checkInInput.setCustomValidity(ruleErrors.checkIn);
    }
    if (ruleErrors.checkOut) {
      checkOutInput.setCustomValidity(ruleErrors.checkOut);
    }

    if (!reservationForm.reportValidity() || Object.keys(ruleErrors).length > 0) {
      const firstMessage = ruleErrors.checkIn || ruleErrors.checkOut || "Please review the highlighted fields.";
      setStatusMessage(statusElement, firstMessage, "error");
      return;
    }

    const formData = new FormData(reservationForm);
    const body = new URLSearchParams();
    formData.forEach((value, key) => {
      body.append(key, String(value));
    });

    if (submitButton) submitButton.disabled = true;

    try {
      const response = await fetch(reservationForm.action, {
        method: reservationForm.method || "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        body: body.toString(),
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (jsonError) {
        payload = null;
      }

      if (!response.ok) {
        const errorMessage = payload?.error || "Could not submit reservation. Please try again.";
        setStatusMessage(statusElement, errorMessage, "error");
        return;
      }

      reservationForm.reset();
      applyDateConstraints();
      const successMessage = payload?.message || "Reservation request submitted. We will confirm availability soon.";
      setStatusMessage(statusElement, successMessage, "success");
    } catch (error) {
      setStatusMessage(statusElement, "Network error while submitting. Please try again.", "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}
