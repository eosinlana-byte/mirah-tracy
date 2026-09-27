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
