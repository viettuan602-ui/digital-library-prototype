const booksList = document.getElementById("booksList");
const booksMessage = document.getElementById("booksMessage");
const userRole = document.getElementById("userRole");
const loadBooksButton = document.getElementById("loadBooksButton");
const logoutButton = document.getElementById("logoutButton");
const bookSearch = document.getElementById("bookSearch");
const categoryFilter = document.getElementById("categoryFilter");
const catalogTotal = document.getElementById("catalogTotal");

let loadedBooks = [];
const coverPalettes = [
    ["#bd744d", "#633842"], ["#69785f", "#34443f"], ["#607284", "#344251"],
    ["#a87078", "#66414e"], ["#9b875e", "#534b3a"], ["#677d7a", "#364a4c"]
];

function loadUserInfo() {
    if (!userRole) return;
    const role = localStorage.getItem("user_role");
    userRole.textContent = role ? `Vai trò: ${role}` : "Khách đọc";
}

function paletteFor(book) {
    const source = `${book.title || ""}${categoryNames(book).join("")}`;
    const score = Array.from(source).reduce((sum, character) => sum + character.charCodeAt(0), 0);
    return coverPalettes[score % coverPalettes.length];
}

function categoryNames(book) {
    if (Array.isArray(book.categories) && book.categories.length) return book.categories;
    return book.category ? String(book.category).split(",").map(value => value.trim()).filter(Boolean) : [];
}

function showEmptyState(message) {
    if (!booksList) return;
    const empty = document.createElement("div");
    empty.className = "catalog-empty";
    empty.textContent = message;
    booksList.replaceChildren(empty);
}

function createBookCard(book) {
    const card = document.createElement("article");
    card.className = "library-card";

    const openButton = document.createElement("button");
    openButton.className = "library-card-open";
    openButton.type = "button";
    openButton.setAttribute("aria-label", `Xem thông tin sách ${book.title}`);

    const cover = document.createElement("div");
    cover.className = "library-cover";
    const [coverA, coverB] = paletteFor(book);
    cover.style.setProperty("--cover-a", coverA);
    cover.style.setProperty("--cover-b", coverB);

    const spine = document.createElement("span");
    spine.className = "cover-spine";
    spine.setAttribute("aria-hidden", "true");
    const category = document.createElement("span");
    category.className = "cover-category";
    category.textContent = categoryNames(book).join(" · ") || "Sách";
    const initials = document.createElement("span");
    initials.className = "cover-initial";
    initials.textContent = (book.title || "Sách").split(/\s+/).slice(0, 3).join(" ");
    cover.append(spine, category, initials);

    const body = document.createElement("div");
    body.className = "library-card-body";
    const title = document.createElement("h2");
    title.className = "library-card-title";
    title.textContent = book.title || "Chưa có tên";
    const author = document.createElement("p");
    author.className = "library-card-author";
    author.textContent = `Tác giả · ${book.author || "Chưa cập nhật"}`;
    const meta = document.createElement("div");
    meta.className = "library-card-meta";
    const status = document.createElement("span");
    status.className = "book-status";
    status.textContent = book.status === "PUBLISHED" ? "● Đang đọc" : book.status || "Có sẵn";
    const access = document.createElement("span");
    access.className = "book-access";
    access.textContent = book.access_level === "PUBLIC" ? "Miễn phí" : "Thành viên";
    const arrow = document.createElement("span");
    arrow.className = "library-card-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    meta.append(status, access, arrow);
    body.append(title, author, meta);
    openButton.append(cover, body);
    openButton.addEventListener("click", () => {
        window.location.href = `chi-tiet-truyen.html?id=${encodeURIComponent(book.id)}`;
    });
    card.append(openButton);
    return card;
}

function renderBooks() {
    if (!booksList) return;
    const searchTerm = bookSearch ? bookSearch.value.trim().toLocaleLowerCase("vi") : "";
    const categoryTerm = categoryFilter ? categoryFilter.value : "";
    const filtered = loadedBooks.filter((book) => {
        const searchTarget = `${book.title || ""} ${book.author || ""}`.toLocaleLowerCase("vi");
        const categories = categoryNames(book);
        return (!searchTerm || searchTarget.includes(searchTerm)) && (!categoryTerm || categories.includes(categoryTerm));
    });

    booksList.replaceChildren();
    if (!filtered.length) {
        showEmptyState(loadedBooks.length ? "Không tìm thấy sách phù hợp. Hãy thử từ khóa khác." : "Thư viện chưa có sách nào. Hãy quay lại sau nhé.");
    } else {
        filtered.forEach((book) => booksList.append(createBookCard(book)));
    }

    if (booksMessage) {
        booksMessage.textContent = searchTerm || categoryTerm
            ? `Đang hiển thị ${filtered.length} / ${loadedBooks.length} cuốn sách.`
            : `${filtered.length} cuốn sách trong thư viện`;
    }
}

function populateCategories(books) {
    if (!categoryFilter) return;
    const selected = categoryFilter.value;
    const categories = [...new Set(books.flatMap(categoryNames))].sort((a, b) => a.localeCompare(b, "vi"));
    categoryFilter.replaceChildren(new Option("Tất cả thể loại", ""));
    categories.forEach((category) => categoryFilter.add(new Option(category, category)));
    categoryFilter.value = categories.includes(selected) ? selected : "";
}

async function loadBooks() {
    if (!booksList || !booksMessage) return;
    booksMessage.textContent = "Đang tải thư viện…";
    booksList.replaceChildren();
    if (loadBooksButton) loadBooksButton.disabled = true;
    try {
        const response = await fetch(`${API_BASE_URL}/api/v1/books?page_size=50`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Không thể tải danh sách sách.");
        loadedBooks = Array.isArray(data.items) ? data.items : [];
        populateCategories(loadedBooks);
        if (catalogTotal) catalogTotal.textContent = `${data.meta?.total ?? loadedBooks.length} cuốn sách trong thư viện`;
        renderBooks();
    } catch (error) {
        loadedBooks = [];
        if (catalogTotal) catalogTotal.textContent = "Thư viện chưa kết nối";
        booksMessage.textContent = error.message;
        showEmptyState("Chưa thể tải thư viện lúc này. Vui lòng thử lại sau.");
        console.error("Load books error:", error);
    } finally {
        if (loadBooksButton) loadBooksButton.disabled = false;
    }
}

if (logoutButton) {
    logoutButton.addEventListener("click", () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("user_role");
        window.location.href = "dang-nhap.html";
    });
}
if (loadBooksButton) loadBooksButton.addEventListener("click", loadBooks);
if (bookSearch) bookSearch.addEventListener("input", renderBooks);
if (categoryFilter) categoryFilter.addEventListener("change", renderBooks);

async function loadBookDetail() {
    const bookDetail = document.getElementById("bookDetail");
    const bookMessage = document.getElementById("bookMessage");
    if (!bookDetail || !bookMessage) return;

    const bookId = new URLSearchParams(window.location.search).get("id");
    if (!bookId) {
        bookMessage.textContent = "Không tìm thấy mã sách.";
        return;
    }

    bookMessage.textContent = "Đang tải thông tin sách…";
    try {
        const response = await fetch(`${API_BASE_URL}/api/v1/books/${encodeURIComponent(bookId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Không thể tải thông tin sách.");
        bookMessage.textContent = "";

        const card = document.createElement("section");
        card.className = "detail-card";
        const cover = document.createElement("div");
        cover.className = "detail-cover";
        const [coverA, coverB] = paletteFor(data);
        cover.style.background = `linear-gradient(145deg, ${coverA}, ${coverB})`;
        const coverMark = document.createElement("span");
        coverMark.className = "detail-cover-mark";
        coverMark.setAttribute("aria-hidden", "true");
        coverMark.textContent = "✳";
        const coverTitle = document.createElement("span");
        coverTitle.className = "detail-cover-title";
        coverTitle.textContent = data.title || "Sách Neptruyen";
        cover.append(coverMark, coverTitle);

        const copy = document.createElement("div");
        copy.className = "detail-copy";
        const eyebrow = document.createElement("p");
        eyebrow.className = "eyebrow";
        eyebrow.innerHTML = '<span class="eyebrow-dot"></span> MỘT CUỐN SÁCH TRONG THƯ VIỆN';
        const title = document.createElement("h1");
        title.textContent = data.title || "Chưa có tên";
        const author = document.createElement("p");
        author.className = "detail-author";
        author.textContent = `Tác giả · ${data.author || "Chưa cập nhật"}`;
        const tags = document.createElement("div");
        tags.className = "detail-tags";
        [...(categoryNames(data).length ? categoryNames(data) : ["Chưa phân loại"]), data.access_level === "PUBLIC" ? "Đọc công khai" : "Dành cho thành viên"].forEach((label) => {
            const tag = document.createElement("span");
            tag.className = "detail-tag";
            tag.textContent = label;
            tags.append(tag);
        });
        const stats = document.createElement("div");
        stats.className = "detail-stats";
        [["TRẠNG THÁI", data.status || "Chưa cập nhật"], ["MÃ SÁCH", data.id]].forEach(([label, value]) => {
            const stat = document.createElement("div");
            stat.className = "detail-stat";
            const small = document.createElement("small");
            small.textContent = label;
            const strong = document.createElement("strong");
            strong.textContent = value;
            stat.append(small, strong);
            stats.append(stat);
        });
        const readButton = document.createElement("button");
        readButton.id = "readBookButton";
        readButton.className = "read-book-button";
        readButton.type = "button";
        if (data.status !== "PUBLISHED") {
            readButton.disabled = true;
            readButton.textContent = "Sách chưa sẵn sàng để đọc";
        } else {
            readButton.textContent = "Đọc ngay  →";
            readButton.addEventListener("click", () => openReader(data.id));
        }
        const statusMessage = document.createElement("p");
        statusMessage.className = "detail-status";
        statusMessage.textContent = data.status === "PUBLISHED" ? "Sẵn sàng mở và tiếp tục đọc." : "Nội dung đang được chuẩn bị trong thư viện.";
        copy.append(eyebrow, title, author, tags, stats, readButton, statusMessage);
        card.append(cover, copy);
        bookDetail.replaceChildren(card);
    } catch (error) {
        bookMessage.textContent = error.message;
        console.error("Load book detail error:", error);
    }
}

function openReader(bookId) {
    window.location.href = `doc-truyen.html?id=${encodeURIComponent(bookId)}`;
}

loadUserInfo();
if (booksList) loadBooks();
loadBookDetail();
