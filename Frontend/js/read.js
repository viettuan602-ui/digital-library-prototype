import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const API_ROOT = (window.DIGITAL_LIBRARY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const bookTitle = document.getElementById("bookTitle");
const bookMeta = document.getElementById("bookMeta");
const readerStatus = document.getElementById("readerStatus");
const readerError = document.getElementById("readerError");
const errorText = document.getElementById("errorText");
const errorLoginLink = document.getElementById("errorLoginLink");
const chapterContent = document.getElementById("chapterContent");
const readerEnd = document.getElementById("readerEnd");
const loadMoreButton = document.getElementById("loadMoreButton");
const readerProgressText = document.getElementById("readerProgressText");
const params = new URLSearchParams(window.location.search);
const bookId = params.get("id");
const detailUrl = bookId
    ? `chi-tiet-truyen.html?id=${encodeURIComponent(bookId)}`
    : "kham-pha-truyen.html";
const PAGE_BATCH_SIZE = 30;
let pdfDocument = null;
let nextPageNumber = 1;
let readingInProgress = false;
let extractedTextPages = 0;

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

function appendPage(pageNumber, text) {
    const section = document.createElement("section");
    section.className = "source-page";
    section.dataset.page = String(pageNumber);
    textToParagraphs(text).forEach((paragraphText) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = paragraphText;
        section.append(paragraph);
    });
    if (section.childElementCount) {
        chapterContent.append(section);
        chapterContent.hidden = false;
        extractedTextPages += 1;
    }
}

function pdfTextToPlainText(items) {
    return items.map((item) => `${item.str || ""}${item.hasEOL ? "\n" : " "}`).join("").trim();
}

async function loadNextPages() {
    if (!pdfDocument || readingInProgress) return;
    readingInProgress = true;
    loadMoreButton.disabled = true;
    loadMoreButton.textContent = "Đang tải…";
    readerStatus.hidden = false;
    readerStatus.querySelector("p").textContent = `Đang tải các trang ${nextPageNumber}–${Math.min(nextPageNumber + PAGE_BATCH_SIZE - 1, pdfDocument.numPages)}…`;

    const lastPage = Math.min(nextPageNumber + PAGE_BATCH_SIZE - 1, pdfDocument.numPages);
    try {
        for (; nextPageNumber <= lastPage; nextPageNumber += 1) {
            const page = await pdfDocument.getPage(nextPageNumber);
            const content = await page.getTextContent();
            appendPage(nextPageNumber, pdfTextToPlainText(content.items));
        }
        readerStatus.hidden = true;
        readerEnd.hidden = false;
        if (nextPageNumber > pdfDocument.numPages) {
            readerProgressText.textContent = `Đã đọc hết ${pdfDocument.numPages} trang PDF.`;
            loadMoreButton.hidden = true;
        } else {
            readerProgressText.textContent = `Đã đọc ${nextPageNumber - 1}/${pdfDocument.numPages} trang PDF.`;
            loadMoreButton.hidden = false;
            loadMoreButton.disabled = false;
            loadMoreButton.textContent = `Tải ${Math.min(PAGE_BATCH_SIZE, pdfDocument.numPages - nextPageNumber + 1)} trang tiếp theo`;
        }
        if (nextPageNumber > pdfDocument.numPages && !extractedTextPages) {
            showError("PDF này chưa có văn bản có thể trích xuất. Tệp scan cần được OCR trước khi đọc ở giao diện này.");
        }
        updateProgress();
    } catch (error) {
        console.error("Read PDF text pages error:", error);
        if (chapterContent.childElementCount) {
            readerStatus.hidden = false;
            readerStatus.querySelector("p").textContent = "Không thể tải thêm nội dung. Hãy thử lại.";
            loadMoreButton.disabled = false;
            loadMoreButton.textContent = "Thử tải lại";
        } else {
            showError(error.message || "Không thể trích xuất văn bản PDF từ kho lưu trữ.");
        }
    } finally {
        readingInProgress = false;
    }
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
    readerStatus.querySelector("p").textContent = "Đang tải thông tin truyện…";

    try {
        const bookResponse = await fetch(`${API_ROOT}/api/v1/books/${encodeURIComponent(bookId)}`);
        const book = await bookResponse.json().catch(() => ({}));
        if (!bookResponse.ok) throw new Error(book.detail || "Không tìm thấy truyện hoặc truyện chưa được xuất bản.");

        bookTitle.textContent = book.title || "Đang đọc";
        bookMeta.textContent = [book.author, book.category].filter(Boolean).join(" · ");
        document.title = `${book.title || "Đang đọc"} | Neptruyen`;

        const headers = {};
        const token = localStorage.getItem("access_token");
        if (token) headers.Authorization = `Bearer ${token}`;
        const sessionResponse = await fetch(
            `${API_ROOT}/api/v1/books/${encodeURIComponent(bookId)}/reading-session`,
            { method: "POST", headers }
        );
        const session = await sessionResponse.json().catch(() => ({}));
        if (!sessionResponse.ok) {
            showError(session.detail || "Không thể tạo phiên đọc.", sessionResponse.status === 401);
            return;
        }

        let documentUrl = session.document_url;
        if (!documentUrl && session.session_url) {
            const legacyRoute = new URL(session.session_url, `${API_ROOT}/`);
            documentUrl = new URL(`${legacyRoute.pathname}${legacyRoute.search}`, `${API_ROOT}/`).href;
        }
        if (!documentUrl) throw new Error("Máy chủ chưa cấp liên kết đọc an toàn.");
        documentUrl = new URL(documentUrl, `${API_ROOT}/`).href;

        readerStatus.querySelector("p").textContent = "Đang mở PDF theo từng phần…";
        const loadingTask = pdfjsLib.getDocument({
            url: documentUrl,
            rangeChunkSize: 65536,
            disableStream: true,
            disableAutoFetch: true
        });
        loadingTask.onProgress = ({ loaded, total }) => {
            if (total) {
                readerStatus.querySelector("p").textContent = `Đang đọc thông tin PDF (${Math.round(loaded / total * 100)}%)…`;
            }
        };
        pdfDocument = await loadingTask.promise;
        readerStatus.querySelector("p").textContent = `PDF có ${pdfDocument.numPages} trang. Đang trích xuất trang đầu…`;
        await loadNextPages();
    } catch (error) {
        showError(error.message || "Không thể kết nối đến máy chủ Neptruyen hoặc kho PDF.");
        console.error("Open novel reader error:", error);
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
loadMoreButton.addEventListener("click", loadNextPages);
window.addEventListener("scroll", updateProgress, { passive: true });
window.addEventListener("resize", updateProgress);

updateTheme(localStorage.getItem("reader_theme") || "paper");
updateFontSize();
openBook();
