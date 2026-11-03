const bookTitle = document.getElementById("bookTitle");
const bookMeta = document.getElementById("bookMeta");
const readerStatus = document.getElementById("readerStatus");
const readerError = document.getElementById("readerError");
const errorText = document.getElementById("errorText");
const errorLoginLink = document.getElementById("errorLoginLink");
const chapterContent = document.getElementById("chapterContent");
const readerEnd = document.getElementById("readerEnd");
const params = new URLSearchParams(window.location.search);
const bookId = params.get("id");
const detailUrl = bookId
    ? `chi-tiet-truyen.html?id=${encodeURIComponent(bookId)}`
    : "kham-pha-truyen.html";

document.getElementById("detailsLink").href = detailUrl;
document.getElementById("backToDetails").href = detailUrl;
document.getElementById("endDetailsLink").href = detailUrl;

function showError(message, needsLogin = false) {
    readerStatus.hidden = true;
    chapterContent.hidden = true;
    readerEnd.hidden = true;
    readerError.hidden = false;
    errorText.textContent = message;
    errorLoginLink.hidden = !needsLogin;
}

function textToParagraphs(text) {
    return text
        .replace(/\r/g, "\n")
        .split(/\n\s*\n+/)
        .map((block) => block.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean);
}

function renderPages(pages) {
    const fragment = document.createDocumentFragment();
    pages.forEach((page) => {
        const section = document.createElement("section");
        section.className = "source-page";
        textToParagraphs(page.text || "").forEach((text) => {
            const paragraph = document.createElement("p");
            paragraph.textContent = text;
            section.append(paragraph);
        });
        if (section.childElementCount) fragment.append(section);
    });
    chapterContent.replaceChildren(fragment);
    chapterContent.hidden = chapterContent.childElementCount === 0;
    readerEnd.hidden = chapterContent.hidden;
    if (chapterContent.hidden) {
        showError("PDF này không có văn bản có thể trích xuất. Tệp scan cần được OCR trước khi đọc ở giao diện này.");
        return false;
    }
    return true;
}

async function openBook() {
    if (!bookId) {
        showError("Thiếu mã truyện. Hãy mở nội dung từ trang chi tiết.");
        return;
    }

    readerError.hidden = true;
    readerEnd.hidden = true;
    chapterContent.hidden = true;
    readerStatus.hidden = false;
    readerStatus.querySelector("p").textContent = "Đang tải nội dung đọc…";

    try {
        const bookResponse = await fetch(`${API_BASE_URL}/api/v1/books/${encodeURIComponent(bookId)}`);
        const book = await bookResponse.json().catch(() => ({}));
        if (!bookResponse.ok) throw new Error(book.detail || "Không tìm thấy truyện hoặc truyện chưa được xuất bản.");

        bookTitle.textContent = book.title || "Đang đọc";
        bookMeta.textContent = [book.author, book.category].filter(Boolean).join(" · ");
        document.title = `${book.title || "Đang đọc"} | Neptruyen`;

        const headers = {};
        const token = localStorage.getItem("access_token");
        if (token) headers.Authorization = `Bearer ${token}`;
        const sessionResponse = await fetch(
            `${API_BASE_URL}/api/v1/books/${encodeURIComponent(bookId)}/reading-session`,
            { method: "POST", headers }
        );
        const session = await sessionResponse.json().catch(() => ({}));
        if (!sessionResponse.ok) {
            showError(session.detail || "Không thể tạo phiên đọc.", sessionResponse.status === 401);
            return;
        }

        const contentPath = session.content_url;
        if (!contentPath) throw new Error("Máy chủ chưa hỗ trợ giao diện đọc văn bản. Hãy cập nhật API rồi thử lại.");
        const contentRoute = new URL(contentPath, `${API_BASE_URL}/`);
        const contentUrl = new URL(`${contentRoute.pathname}${contentRoute.search}`, `${API_BASE_URL}/`).href;
        const contentResponse = await fetch(contentUrl);
        const content = await contentResponse.json().catch(() => ({}));
        if (!contentResponse.ok) {
            showError(content.detail || "Không thể tải nội dung truyện.", contentResponse.status === 401);
            return;
        }

        if (!renderPages(content.pages || [])) return;
        readerStatus.hidden = true;
        updateProgress();
    } catch (error) {
        showError(error.message || "Không thể kết nối đến máy chủ Neptruyen.");
        console.error("Open reading content error:", error);
    }
}

let fontSize = Number(localStorage.getItem("reader_font_size")) || 20;
function updateFontSize() {
    fontSize = Math.max(16, Math.min(30, fontSize));
    chapterContent.style.setProperty("--reading-size", `${fontSize}px`);
    localStorage.setItem("reader_font_size", String(fontSize));
}

const themes = ["paper", "sepia", "night"];
function updateTheme(theme) {
    const selected = themes.includes(theme) ? theme : "paper";
    document.body.dataset.theme = selected;
    localStorage.setItem("reader_theme", selected);
    const labels = { paper: ["☼", "Sáng"], sepia: ["◐", "Sepia"], night: ["☾", "Tối"] };
    const [icon, label] = labels[selected];
    document.getElementById("themeButton").innerHTML = `${icon} <span>${label}</span>`;
}

function updateProgress() {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const percentage = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
    document.getElementById("progressBar").style.width = `${Math.min(100, Math.max(0, percentage))}%`;
}

document.getElementById("fontDown").addEventListener("click", () => { fontSize -= 1; updateFontSize(); });
document.getElementById("fontUp").addEventListener("click", () => { fontSize += 1; updateFontSize(); });
document.getElementById("themeButton").addEventListener("click", () => {
    const current = themes.indexOf(document.body.dataset.theme);
    updateTheme(themes[(current + 1) % themes.length]);
});
document.getElementById("retryButton").addEventListener("click", openBook);
window.addEventListener("scroll", updateProgress, { passive: true });
window.addEventListener("resize", updateProgress);

updateTheme(localStorage.getItem("reader_theme") || "paper");
updateFontSize();
openBook();
