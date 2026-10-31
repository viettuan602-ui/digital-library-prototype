const bookTitle = document.getElementById("bookTitle");
const bookAuthor = document.getElementById("bookAuthor");
const bookCategory = document.getElementById("bookCategory");
const bookAccess = document.getElementById("bookAccess");
const readerHeading = document.getElementById("readerHeading");
const readerStatus = document.getElementById("readerStatus");
const readerError = document.getElementById("readerError");
const errorText = document.getElementById("errorText");
const errorLoginLink = document.getElementById("errorLoginLink");
const pdfFrame = document.getElementById("pdfFrame");
const pdfFrameWrap = document.getElementById("pdfFrameWrap");
const params = new URLSearchParams(window.location.search);
const bookId = params.get("id");
let zoom = 100;
let sessionUrl = "";

const detailUrl = bookId
    ? `chi-tiet-truyen.html?id=${encodeURIComponent(bookId)}`
    : "kham-pha-truyen.html";
document.getElementById("detailsLink").href = detailUrl;
document.getElementById("backToDetails").href = detailUrl;

function showError(message, needsLogin = false) {
    readerStatus.hidden = true;
    pdfFrameWrap.hidden = true;
    readerError.hidden = false;
    errorText.textContent = message;
    errorLoginLink.hidden = !needsLogin;
}

function updateZoom() {
    document.getElementById("zoomValue").textContent = `${zoom}%`;
    if (sessionUrl) {
        pdfFrame.src = `${sessionUrl}#zoom=${zoom}`;
    }
}

async function openBook() {
    if (!bookId) {
        showError("Thiếu mã sách. Hãy mở sách từ thư viện Neptruyen.");
        return;
    }

    readerError.hidden = true;
    pdfFrameWrap.hidden = true;
    readerStatus.hidden = false;
    readerStatus.textContent = "Đang tải thông tin sách…";

    try {
        const bookResponse = await fetch(`${API_BASE_URL}/api/v1/books/${encodeURIComponent(bookId)}`);
        const book = await bookResponse.json().catch(() => ({}));
        if (!bookResponse.ok) {
            throw new Error(book.detail || "Không tìm thấy sách hoặc sách chưa được xuất bản.");
        }

        bookTitle.textContent = book.title;
        bookAuthor.textContent = `Tác giả · ${book.author}`;
        bookCategory.textContent = book.category;
        bookAccess.textContent = book.access_level === "MEMBER" ? "Thành viên" : "Miễn phí";
        readerHeading.textContent = book.title;
        document.title = `${book.title} | Neptruyen`;

        readerStatus.textContent = "Đang tạo phiên đọc an toàn…";
        const headers = {};
        const token = localStorage.getItem("access_token");
        if (token) headers.Authorization = `Bearer ${token}`;

        const sessionResponse = await fetch(
            `${API_BASE_URL}/api/v1/books/${encodeURIComponent(bookId)}/reading-session`,
            { method: "POST", headers }
        );
        const session = await sessionResponse.json().catch(() => ({}));
        if (!sessionResponse.ok) {
            const needsLogin = sessionResponse.status === 401;
            showError(session.detail || "Không thể tạo phiên đọc sách.", needsLogin);
            return;
        }

        const streamUrl = new URL(session.session_url);
        sessionUrl = `${API_BASE_URL}${streamUrl.pathname}${streamUrl.search}`;
        pdfFrame.src = `${sessionUrl}#zoom=${zoom}`;
        pdfFrameWrap.hidden = false;
        readerStatus.hidden = true;
    } catch (error) {
        showError(error.message || "Không thể kết nối đến máy chủ Neptruyen.");
        console.error("Open book error:", error);
    }
}

document.getElementById("zoomIn").addEventListener("click", () => {
    zoom = Math.min(180, zoom + 10);
    updateZoom();
});
document.getElementById("zoomOut").addEventListener("click", () => {
    zoom = Math.max(60, zoom - 10);
    updateZoom();
});
document.getElementById("fitWidth").addEventListener("click", () => {
    zoom = 100;
    document.getElementById("zoomValue").textContent = "Vừa trang";
    if (sessionUrl) pdfFrame.src = `${sessionUrl}#zoom=page-width`;
});
document.getElementById("themeButton").addEventListener("click", () => {
    const isNight = document.body.classList.toggle("reader-theme-night");
    document.body.classList.toggle("reader-theme-paper", !isNight);
    document.getElementById("themeButton").textContent = isNight ? "☾" : "☼";
});
document.getElementById("fullscreenButton").addEventListener("click", async () => {
    const target = document.querySelector(".reader-main");
    try {
        if (!document.fullscreenElement) await target.requestFullscreen();
        else await document.exitFullscreen();
    } catch (error) {
        console.error("Fullscreen error:", error);
    }
});
document.getElementById("retryButton").addEventListener("click", openBook);

openBook();




