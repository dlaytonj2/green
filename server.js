const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MIN_LEAD_DAYS = 2;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function parseDateValue(value) {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validateReservation(data) {
  const errors = [];
  const requiredFields = ["owner-name", "email", "hamster-name", "check-in", "check-out"];

  requiredFields.forEach((fieldName) => {
    if (!String(data[fieldName] || "").trim()) {
      errors.push(`${fieldName} is required.`);
    }
  });

  const checkInDate = parseDateValue(data["check-in"]);
  const checkOutDate = parseDateValue(data["check-out"]);
  const leadDate = addDays(new Date(), MIN_LEAD_DAYS);

  if (!checkInDate) {
    errors.push("Check-in must be a valid date.");
  }
  if (!checkOutDate) {
    errors.push("Check-out must be a valid date.");
  }

  if (checkInDate && checkInDate < leadDate) {
    errors.push(`Check-in must be at least ${MIN_LEAD_DAYS} days from today (${formatDateInputValue(leadDate)} or later).`);
  }
  if (checkInDate && checkOutDate && checkOutDate <= checkInDate) {
    errors.push("Check-out must be after check-in.");
  }

  const email = String(data.email || "");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Email must be valid.");
  }

  return errors;
}

function collectBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function handleReservationSubmit(request, response) {
  try {
    const rawBody = await collectBody(request);
    const contentType = request.headers["content-type"] || "";
    let payload = {};

    if (contentType.includes("application/json")) {
      payload = JSON.parse(rawBody || "{}");
    } else {
      const params = new URLSearchParams(rawBody);
      payload = Object.fromEntries(params.entries());
    }

    const errors = validateReservation(payload);
    if (errors.length > 0) {
      sendJson(response, 400, { error: errors[0], errors });
      return;
    }

    const record = {
      createdAt: new Date().toISOString(),
      reservation: payload,
    };
    fs.appendFile(path.join(ROOT, "reservations.ndjson"), `${JSON.stringify(record)}\n`, () => {});

    sendJson(response, 201, {
      message: "Reservation request submitted successfully. We will confirm availability within one business day.",
    });
  } catch (error) {
    sendJson(response, 500, { error: "Server error while processing reservation request." });
  }
}

function getSafeFilePath(urlPathname) {
  const decodedPath = decodeURIComponent(urlPathname);
  const cleanPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const fullPath = path.normalize(path.join(ROOT, cleanPath));
  if (!fullPath.startsWith(ROOT)) return null;
  return fullPath;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "POST" && url.pathname === "/api/reservations") {
    await handleReservationSubmit(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  const targetPath = getSafeFilePath(url.pathname);
  if (!targetPath) {
    sendJson(response, 400, { error: "Invalid path." });
    return;
  }

  fs.readFile(targetPath, (error, data) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendJson(response, 404, { error: "Not found." });
        return;
      }
      sendJson(response, 500, { error: "Could not read file." });
      return;
    }

    const extension = path.extname(targetPath).toLowerCase();
    response.writeHead(200, { "Content-Type": MIME_TYPES[extension] || "application/octet-stream" });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
