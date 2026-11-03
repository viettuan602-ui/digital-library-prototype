import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const API_ROOT = (window.DIGITAL_LIBRARY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const $ = (id) => document.getElementById(id);
const bookTitle = $("bookTitle");
const bookMeta = $("bookMeta");
const readerStatus = $("readerStatus");
const readerError = $("readerError");
const errorText = $("errorText");
const errorLoginLink = $("errorLoginLink");
const chapterContent = $("chapterContent");
const readerEnd = $("readerEnd");
const loadMoreButton = $("loadMoreButton");
const readerProgressText = $("readerProgressText");
const volumeSelect = $("volumeSelect");
const chapterSelect = $("chapterSelect");
const previousChapter = $("previousChapter");
const nextChapter = $("nextChapter");
const readerHeading = $("readerHeading");
const params = new URLSearchParams(window.location.search);
const bookId = params.get("id");
const detailUrl = bookId ? `chi-tiet-truyen.html?id=${encodeURIComponent(bookId)}` : "kham-pha-truyen.html";
const PAGE_BATCH_SIZE = 8;
const volumeNames = [
    "Hòn đá Phù thủy", "Phòng chứa Bí mật", "Tù nhân Azkaban", "Chiếc cốc lửa",
    "Hội Phượng hoàng", "Hoàng tử lai", "Bảo bối Tử thần"
];
let pdfDocument = null;
let volumes = [];
let currentVolumeIndex = 0;
let currentChapterIndex = 0;
let currentChapter = null;
let nextPageNumber = 1;
let lastPageNumber = 0;
let readingInProgress = false;
let extractedTextPages = 0;
let readingEpoch = 0;

$("detailsLink").href = detailUrl;
$("backToDetails").href = detailUrl;
$("endDetailsLink").href = detailUrl;

function showError(message, needsLogin = false) {
    readerStatus.hidden = true;
    chapterContent.hidden = true;
    readerEnd.hidden = true;
    readerError.hidden = false;
    errorText.textContent = message;
    errorLoginLink.hidden = !needsLogin;
}

function textToParagraphs(text) {
    return text.replace(/\r/g, "\n").split(/\n\s*\n+/)
        .map((block) => block.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean);
}

function normalizeHeading(text) {
    return text.toLocaleLowerCase("vi").normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isPdfHeaderLine(line) {
    const cleaned = line.replace(/\s+/g, " ").trim();
    if (/^(?:HARRY\s+POTTER|J\.?\s*K\.?\s*ROWLING)$/i.test(cleaned)) return true;
    if (/www\.dtv-ebook\.com/i.test(cleaned)) return true;
    if (/^chương\s+\d+\s*$/i.test(cleaned)) return true;
    return Boolean(currentChapter?.title && normalizeHeading(cleaned) === normalizeHeading(currentChapter.title));
}

function pdfTextToPlainText(items) {
    const lines = [];
    let currentText = "";
    let currentY = null;
    let currentHeight = 0;

    const flushLine = () => {
        const text = currentText.replace(/\s+/g, " ").trim();
        if (text) lines.push({ text, y: currentY, x: currentX, height: currentHeight });
        currentText = "";
        currentY = null;
        currentX = null;
        currentHeight = 0;
    };

    let currentX = null;
    for (const item of items) {
        const text = (item.str || "").replace(/[\r\n]+/g, " ");
        if (!text.trim()) continue;
        const y = Number.isFinite(item.transform?.[5]) ? item.transform[5] : null;
        const height = Number(item.height) || 0;
        if (currentText && y !== null && currentY !== null && Math.abs(y - currentY) > 2) flushLine();
        if (!currentText) {
            currentY = y;
            currentX = Number.isFinite(item.transform?.[4]) ? item.transform[4] : null;
            currentHeight = height;
        }
        currentText += `${currentText && !/\s$/.test(currentText) ? " " : ""}${text}`;
        currentHeight = Math.max(currentHeight, height);
        if (item.hasEOL) flushLine();
    }
    flushLine();

    const contentLines = lines.filter(({ text }) => !isPdfHeaderLine(text));
    const normalGaps = [];
    for (let index = 1; index < contentLines.length; index += 1) {
        const previousY = contentLines[index - 1].y;
        const currentYValue = contentLines[index].y;
        if (previousY === null || currentYValue === null) continue;
        const gap = Math.abs(currentYValue - previousY);
        if (gap > 2 && gap < 60) normalGaps.push(gap);
    }
    normalGaps.sort((a, b) => a - b);
    const lineSpacing = normalGaps.length ? normalGaps[Math.floor(normalGaps.length / 2)] : 0;
    const paragraphGap = Math.max(24, lineSpacing * 1.55);

    const text = contentLines.map((line, index) => {
        if (index === 0) return line.text;
        const previousY = contentLines[index - 1].y;
        const gap = previousY !== null && line.y !== null ? Math.abs(line.y - previousY) : 0;
        return `${gap > paragraphGap ? "\n\n" : "\n"}${line.text}`;
    }).join("").trim();
    const leftEdge = Math.min(...contentLines.map((line) => line.x).filter(Number.isFinite));
    const startsIndented = Number.isFinite(contentLines[0]?.x) && Number.isFinite(leftEdge)
        && contentLines[0].x > leftEdge + 6;
    return { text, startsIndented };
}

function shouldJoinAcrossPages(previous, next, startsIndented) {
    if (!previous || !next || /^[-−–—“"‘]/u.test(next.trim())) return false;
    const previousText = previous.textContent.trimEnd();
    const nextText = next.trimStart();
    if (!previousText || !nextText) return false;
    return !startsIndented || !/[.!?…][”’\"')\]]?$/u.test(previousText) || /^[\p{Ll}]/u.test(nextText);
}

function joinPageContinuation(previous, next) {
    const left = previous.textContent.trimEnd();
    const right = next.trimStart();
    if (/-$/.test(left) && /^[\p{Ll}]/u.test(right)) previous.textContent = `${left.slice(0, -1)}${right}`;
    else previous.textContent = `${left} ${right}`;
}

function appendPage(pageNumber, { text, startsIndented }) {
    const paragraphs = textToParagraphs(text);
    if (!paragraphs.length) return;

    const previous = chapterContent.lastElementChild;
    if (previous && shouldJoinAcrossPages(previous, paragraphs[0], startsIndented)) {
        joinPageContinuation(previous, paragraphs.shift());
    }
    paragraphs.forEach((paragraphText) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = paragraphText;
        chapterContent.append(paragraph);
    });
    chapterContent.hidden = false;
    extractedTextPages += 1;
}

function flattenOutline(items, result = []) {
    for (const entry of items || []) {
        if (Array.isArray(entry)) flattenOutline(entry, result);
        else {
            result.push(entry);
            if (entry.items?.length) flattenOutline(entry.items, result);
        }
    }
    return result;
}

async function getOutlinePage(entry) {
    try {
        const destination = typeof entry.dest === "string"
            ? await pdfDocument.getDestination(entry.dest)
            : entry.dest;
        if (!destination?.[0]) return null;
        return (await pdfDocument.getPageIndex(destination[0])) + 1;
    } catch {
        return null;
    }
}

async function readChaptersFromOutline() {
    const outline = await pdfDocument.getOutline();
    const markers = [];
    for (const entry of flattenOutline(outline)) {
        const page = await getOutlinePage(entry);
        if (!page) continue;
        const title = (entry.title || "").trim();
        const volumeMatch = title.match(/^quyển\s+(\d+)/i);
        const chapterMatch = title.match(/chương\s+(\d+)\s*:?\s*(.*)/i);
        if (volumeMatch) markers.push({ type: "volume", number: Number(volumeMatch[1]), page, title });
        else if (chapterMatch) markers.push({
            type: "chapter", number: Number(chapterMatch[1]), page,
            title: chapterMatch[2].replace(/^[-:–\s]+/, "").trim()
        });
    }
    markers.sort((a, b) => a.page - b.page);

    const parsedVolumes = [];
    let activeVolume = null;
    for (const marker of markers) {
        if (marker.type === "volume") {
            activeVolume = { number: marker.number, startPage: marker.page, chapters: [] };
            parsedVolumes.push(activeVolume);
        } else if (activeVolume) activeVolume.chapters.push(marker);
    }
    parsedVolumes.forEach((volume, volumeIndex) => {
        const nextVolumePage = parsedVolumes[volumeIndex + 1]?.startPage || pdfDocument.numPages + 1;
        volume.chapters.forEach((chapter, chapterIndex) => {
            chapter.endPage = volume.chapters[chapterIndex + 1]?.page - 1 || nextVolumePage - 1;
        });
        volume.title = volumeNames[volume.number - 1] || `Quyển ${volume.number}`;
    });
    return parsedVolumes.filter((volume) => volume.chapters.length);
}

function populateVolumeOptions() {
    volumeSelect.replaceChildren(...volumes.map((volume, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `Quyển ${volume.number} · ${volume.title}`;
        return option;
    }));
    volumeSelect.disabled = volumes.length < 2;
    volumeSelect.value = String(currentVolumeIndex);
    populateChapterOptions();
}

function populateChapterOptions() {
    const volume = volumes[currentVolumeIndex];
    chapterSelect.replaceChildren(...volume.chapters.map((chapter, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `Chương ${chapter.number}${chapter.title ? ` · ${chapter.title}` : ""}`;
        return option;
    }));
    chapterSelect.disabled = volume.chapters.length < 2;
    chapterSelect.value = String(currentChapterIndex);
}

function updateChapterButtons() {
    previousChapter.disabled = currentVolumeIndex === 0 && currentChapterIndex === 0;
    const lastVolume = currentVolumeIndex === volumes.length - 1;
    const lastChapter = currentChapterIndex === volumes[currentVolumeIndex].chapters.length - 1;
    nextChapter.disabled = lastVolume && lastChapter;
}

async function loadNextPages() {
    if (!pdfDocument || readingInProgress) return;
    const epoch = readingEpoch;
    readingInProgress = true;
    loadMoreButton.disabled = true;
    loadMoreButton.textContent = "Đang tải…";
    readerStatus.hidden = false;
    readerEnd.hidden = true;
    const lastPage = Math.min(nextPageNumber + PAGE_BATCH_SIZE - 1, lastPageNumber);
    readerStatus.querySelector("p").textContent = `Đang tải trang ${nextPageNumber}–${lastPage}…`;
    try {
        for (; nextPageNumber <= lastPage; nextPageNumber += 1) {
            const page = await pdfDocument.getPage(nextPageNumber);
            const content = await page.getTextContent();
            if (epoch !== readingEpoch) return;
            appendPage(nextPageNumber, pdfTextToPlainText(content.items));
        }
        readerStatus.hidden = true;
        readerEnd.hidden = false;
        if (nextPageNumber > lastPageNumber) {
            readerProgressText.textContent = currentChapter
                ? `Đã đọc xong chương ${currentChapter.number}.`
                : `Đã đọc hết ${lastPageNumber} trang PDF.`;
            loadMoreButton.hidden = true;
        } else {
            readerProgressText.textContent = currentChapter
                ? `Đã tải ${Math.min(nextPageNumber - currentChapter.page, currentChapter.endPage - currentChapter.page + 1)}/${currentChapter.endPage - currentChapter.page + 1} trang chương.`
                : `Đã tải ${nextPageNumber - 1}/${lastPageNumber} trang PDF.`;
            loadMoreButton.hidden = false;
            loadMoreButton.disabled = false;
            loadMoreButton.textContent = `Đọc tiếp · ${Math.min(PAGE_BATCH_SIZE, lastPageNumber - nextPageNumber + 1)} trang`;
        }
        if (nextPageNumber > lastPageNumber && !extractedTextPages) {
            showError("PDF này chưa có văn bản có thể trích xuất. Tệp scan cần được OCR trước khi đọc ở giao diện này.");
        }
        updateProgress();
    } catch (error) {
        if (epoch !== readingEpoch) return;
        console.error("Read PDF text pages error:", error);
        if (chapterContent.childElementCount) {
            readerStatus.hidden = false;
            readerStatus.querySelector("p").textContent = "Không thể tải thêm nội dung. Hãy thử lại.";
            readerEnd.hidden = false;
            loadMoreButton.disabled = false;
            loadMoreButton.textContent = "Thử tải lại";
        } else showError(error.message || "Không thể trích xuất văn bản PDF từ kho lưu trữ.");
    } finally {
        if (epoch === readingEpoch) readingInProgress = false;
    }
}

async function selectChapter(volumeIndex, chapterIndex, shouldScroll = true) {
    if (!volumes.length) return;
    readingEpoch += 1;
    readingInProgress = false;
    currentVolumeIndex = volumeIndex;
    currentChapterIndex = chapterIndex;
    currentChapter = volumes[volumeIndex].chapters[chapterIndex];
    populateChapterOptions();
    volumeSelect.value = String(volumeIndex);
    updateChapterButtons();
    readerHeading.textContent = `Chương ${currentChapter.number}${currentChapter.title ? ` · ${currentChapter.title}` : ""}`;
    chapterContent.replaceChildren();
    chapterContent.hidden = true;
    readerEnd.hidden = true;
    readerError.hidden = true;
    readerStatus.hidden = false;
    readerStatus.querySelector("p").textContent = "Đang chuẩn bị chương…";
    extractedTextPages = 0;
    nextPageNumber = currentChapter.page;
    lastPageNumber = currentChapter.endPage;
    loadMoreButton.hidden = false;
    if (shouldScroll) window.scrollTo({ top: 0, behavior: "smooth" });
    await loadNextPages();
}

async function openBook() {
    if (!bookId) return showError("Thiếu mã truyện. Hãy mở nội dung từ trang chi tiết.");
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
        const sessionResponse = await fetch(`${API_ROOT}/api/v1/books/${encodeURIComponent(bookId)}/reading-session`, { method: "POST", headers });
        const session = await sessionResponse.json().catch(() => ({}));
        if (!sessionResponse.ok) return showError(session.detail || "Không thể tạo phiên đọc.", sessionResponse.status === 401);
        let documentUrl = session.document_url;
        if (!documentUrl && session.session_url) {
            const legacyRoute = new URL(session.session_url, `${API_ROOT}/`);
            documentUrl = new URL(`${legacyRoute.pathname}${legacyRoute.search}`, `${API_ROOT}/`).href;
        }
        if (!documentUrl) throw new Error("Máy chủ chưa cấp liên kết đọc an toàn.");
        documentUrl = new URL(documentUrl, `${API_ROOT}/`).href;
        readerStatus.querySelector("p").textContent = "Đang mở PDF theo từng phần…";
        const loadingTask = pdfjsLib.getDocument({ url: documentUrl, rangeChunkSize: 65536, disableStream: true, disableAutoFetch: true });
        loadingTask.onProgress = ({ loaded, total }) => {
            if (total) readerStatus.querySelector("p").textContent = `Đang mở tài liệu (${Math.round(loaded / total * 100)}%)…`;
        };
        pdfDocument = await loadingTask.promise;
        volumes = await readChaptersFromOutline();
        if (volumes.length) {
            currentVolumeIndex = 0;
            currentChapterIndex = 0;
            populateVolumeOptions();
            await selectChapter(0, 0, false);
        } else {
            volumeSelect.closest(".reader-navigation").hidden = true;
            readerHeading.textContent = "Toàn văn";
            nextPageNumber = 1;
            lastPageNumber = pdfDocument.numPages;
            await loadNextPages();
        }
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
    const [icon, label] = { paper: ["☼", "Sáng"], sepia: ["◐", "Sepia"], night: ["☾", "Tối"] }[selected];
    $("themeButton").innerHTML = `${icon} <span>${label}</span>`;
}
function updateProgress() {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const percentage = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
    $("progressBar").style.width = `${Math.min(100, Math.max(0, percentage))}%`;
}
function moveChapter(direction) {
    let volumeIndex = currentVolumeIndex;
    let chapterIndex = currentChapterIndex + direction;
    if (chapterIndex < 0 && volumeIndex > 0) {
        volumeIndex -= 1;
        chapterIndex = volumes[volumeIndex].chapters.length - 1;
    } else if (chapterIndex >= volumes[volumeIndex].chapters.length && volumeIndex < volumes.length - 1) {
        volumeIndex += 1;
        chapterIndex = 0;
    }
    if (chapterIndex >= 0 && chapterIndex < volumes[volumeIndex].chapters.length) selectChapter(volumeIndex, chapterIndex);
}

$("fontDown").addEventListener("click", () => { fontSize -= 1; updateFontSize(); });
$("fontUp").addEventListener("click", () => { fontSize += 1; updateFontSize(); });
$("themeButton").addEventListener("click", () => updateTheme(themes[(themes.indexOf(document.body.dataset.theme) + 1) % themes.length]));
$("retryButton").addEventListener("click", openBook);
loadMoreButton.addEventListener("click", loadNextPages);
volumeSelect.addEventListener("change", () => selectChapter(Number(volumeSelect.value), 0));
chapterSelect.addEventListener("change", () => selectChapter(currentVolumeIndex, Number(chapterSelect.value)));
previousChapter.addEventListener("click", () => moveChapter(-1));
nextChapter.addEventListener("click", () => moveChapter(1));
window.addEventListener("scroll", updateProgress, { passive: true });
window.addEventListener("resize", updateProgress);

updateTheme(localStorage.getItem("reader_theme") || "paper");
updateFontSize();
openBook();
