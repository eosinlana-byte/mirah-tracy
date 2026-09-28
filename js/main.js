document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelectorAll(".links a").forEach((l) => l.classList.toggle("is-active", l.getAttribute("href") === id));
  });
});

const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxCap = document.getElementById("lightboxCap");
function openLight(src, cap) {
  if (!lightbox || !src) return;
  lightboxImg.src = src;
  lightboxImg.alt = cap || "";
  lightboxCap.textContent = cap || "";
  lightbox.hidden = false;
}
function closeLight() {
  if (!lightbox) return;
  lightbox.hidden = true;
  lightboxImg.src = "";
}
if (lightbox) {
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox || e.target.classList.contains("lightbox__close")) closeLight();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLight(); });
}

const folio = document.getElementById("folio");
function bindFolio() {
  if (!folio) return;
  folio.querySelectorAll("figure").forEach((fig) => {
    fig.addEventListener("click", () => {
      const img = fig.querySelector("img");
      const cap = fig.querySelector("figcaption");
      if (img) openLight(img.src, cap ? cap.textContent : img.alt);
    });
  });
}
if (folio) {
  fetch("/api/portfolio")
    .then((r) => r.json())
    .then((data) => {
      const items = data.items || [];
      folio.innerHTML = items.map((i) =>
        "<figure><img src=\"" + i.image + "\" alt=\"" + (i.title || "") + "\" /><figcaption>" + (i.title || "") + "</figcaption></figure>"
      ).join("");
      bindFolio();
    })
    .catch(() => bindFolio());
}

const quotes = document.getElementById("quotes");
if (quotes) {
  fetch("/api/testimonials")
    .then((r) => r.json())
    .then((data) => {
      const items = data.items || [];
      quotes.innerHTML = items.map((i) => {
        const img = i.image ? "<img src=\"" + i.image + "\" alt=\"\" />" : "";
        const q = i.quote ? "<p>" + i.quote + "</p>" : "<p></p>";
        const n = i.name ? "<footer>" + i.name + "</footer>" : "<footer></footer>";
        return "<blockquote>" + img + q + n + "</blockquote>";
      }).join("");
    })
    .catch(() => {});
}

const form = document.getElementById("form");
const msg = document.getElementById("formMsg");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "Sending...";
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const r = await fetch("/api/enquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const out = await r.json();
      if (!r.ok || !out.ok) {
        msg.textContent = out.error || "Could not send.";
        return;
      }
      form.reset();
      msg.textContent = "Received. You will get a reply by email.";
    } catch {
      msg.textContent = "Could not send. Try email instead.";
    }
  });
}
