const ADMIN_BOOK_KEY = "admin_last_created_book";

function getSavedBook() {
    try {
        return JSON.parse(sessionStorage.getItem(ADMIN_BOOK_KEY) || "null");
    } catch (error) {
        console.warn("Không thể đọc mã truyện đã lưu:", error);
        return null;
    }
}

function saveBook(book) {
    sessionStorage.setItem(ADMIN_BOOK_KEY, JSON.stringify({
        id: String(book.id),
        title: book.title || "Sách vừa tạo"
    }));
}

function setMessage(element, message, type = "info") {
    if (!element) return;
    element.textContent = message;
    element.dataset.type = type;
}

async function readApiResponse(response) {
    const raw = await response.text();
    if (!raw) return {};

    try {
        return JSON.parse(raw);
    } catch (error) {
        return { detail: raw };
    }
}

function getErrorMessage(data, fallback) {
    const detail = data && data.detail;
    if (Array.isArray(detail)) {
        return detail.map(item => item.msg || String(item)).join("; ");
    }
    return detail || fallback;
}

function handleUnauthorized(response) {
    if (response.status !== 401) return false;
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_role");
    alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!");
    window.location.replace("dang-nhap.html");
    return true;
}

// Bảo vệ tất cả các màn quản trị bằng cùng một kiểm tra quyền.
(function checkAdminAccess() {
    const token = localStorage.getItem("access_token");
    const role = localStorage.getItem("user_role");

    if (!token) {
        window.location.replace("dang-nhap.html");
        return;
    }
    if (role !== "ADMIN" && role !== "MANAGER") {
        window.location.replace("kham-pha-truyen.html");
        return;
    }

    const userInfo = document.getElementById("adminUserInfo");
    if (userInfo) userInfo.textContent = `Vai trò: ${role}`;
})();

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("user_role");
        sessionStorage.removeItem(ADMIN_BOOK_KEY);
        window.location.replace("dang-nhap.html");
    });
}

// Trang menu: giữ ID gần nhất để có thể tiếp tục thao tác upload.
const recentBookCard = document.getElementById("recentBookCard");
if (recentBookCard) {
    const savedBook = getSavedBook();
    if (savedBook && savedBook.id) {
        recentBookCard.hidden = false;
        document.getElementById("recentBookTitle").textContent = savedBook.title;
        document.getElementById("recentBookId").textContent = savedBook.id;
        document.getElementById("continuePublishLink").href =
            `dang-tai-xuat-ban.html?id=${encodeURIComponent(savedBook.id)}`;
    }
}

// Trang tạo sách.
const createBookForm = document.getElementById("createBookForm");
if (createBookForm) {
    const resultCard = document.getElementById("createdBookResult");
    const idInput = document.getElementById("createdBookId");
    const titleOutput = document.getElementById("createdBookTitle");
    const continueLink = document.getElementById("continueToUpload");
    const message = document.getElementById("createBookMessage");
    const submitBtn = document.getElementById("btnCreateBook");
    const categoryPicker = document.getElementById("categoryPicker");
    const categoryChecks = [...document.querySelectorAll('input[name="bookCategory"]')];
    const categoryPickerSummary = document.getElementById("categoryPickerSummary");
    const selectedCategoryChips = document.getElementById("selectedCategoryChips");
    const customCategoryWrap = document.getElementById("customCategoryWrap");
    const customCategoryText = document.getElementById("customCategoryText");
    const categorySelectionError = document.getElementById("categorySelectionError");

    function getSelectedCategories() {
        const selected = categoryChecks
            .filter(input => input.checked && input.value !== "Khác")
            .map(input => input.value);
        const otherSelected = categoryChecks.some(input => input.checked && input.value === "Khác");
        if (otherSelected && customCategoryText && customCategoryText.value.trim()) {
            selected.push(...customCategoryText.value.split(",").map(value => value.trim()).filter(Boolean));
        }
        return [...new Map(selected.map(value => [value.toLocaleLowerCase("vi"), value])).values()];
    }

    function refreshCategoryPicker() {
        const otherSelected = categoryChecks.some(input => input.checked && input.value === "Khác");
        if (customCategoryWrap) customCategoryWrap.hidden = !otherSelected;
        const categories = getSelectedCategories();
        if (categoryPickerSummary) {
            const summaryText = categories.length
                ? `Đã chọn ${categories.length} thể loại`
                : "Chọn một hoặc nhiều thể loại";
            categoryPickerSummary.firstChild.textContent = summaryText;
        }
        if (selectedCategoryChips) {
            selectedCategoryChips.replaceChildren();
            categories.forEach(category => {
                const chip = document.createElement("span");
                chip.className = "selected-category-chip";
                chip.textContent = category;
                selectedCategoryChips.append(chip);
            });
        }
        if (categories.length && categorySelectionError) categorySelectionError.hidden = true;
    }

    categoryChecks.forEach(input => input.addEventListener("change", refreshCategoryPicker));
    if (customCategoryText) customCategoryText.addEventListener("input", refreshCategoryPicker);

    function showCreatedBook(book) {
        if (!book || !book.id) return;
        idInput.value = String(book.id);
        titleOutput.textContent = book.title || "Sách vừa tạo";
        continueLink.href = `dang-tai-xuat-ban.html?id=${encodeURIComponent(book.id)}`;
        resultCard.hidden = false;
    }

    showCreatedBook(getSavedBook());

    createBookForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (submitBtn.disabled) return;

        const categories = getSelectedCategories();
        if (!categories.length) {
            if (categorySelectionError) categorySelectionError.hidden = false;
            if (categoryPicker) categoryPicker.open = true;
            setMessage(message, "Vui lòng chọn ít nhất một thể loại.", "error");
            return;
        }

        const payload = {
            title: document.getElementById("bookTitle").value.trim(),
            author: document.getElementById("bookAuthor").value.trim(),
            categories,
            access_level: document.getElementById("bookAccessLevel").value
        };
        const token = localStorage.getItem("access_token");

        setMessage(message, "Đang tạo sách…");
        submitBtn.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/admin/books`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            const data = await readApiResponse(response);

            if (handleUnauthorized(response)) return;
            if (!response.ok) {
                throw new Error(getErrorMessage(data, "Không thể tạo sách."));
            }
            if (data.id == null) {
                throw new Error("Tạo sách thành công nhưng hệ thống không trả về mã sách.");
            }

            saveBook(data);
            showCreatedBook(data);
            createBookForm.reset();
            if (categoryPicker) categoryPicker.open = false;
            refreshCategoryPicker();
            setMessage(message, "Đã tạo sách thành công. Mã sách được lưu trong phiên này.", "success");
            resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (error) {
            setMessage(message, `Lỗi: ${error.message}`, "error");
            console.error("Create book error:", error);
        } finally {
            submitBtn.disabled = false;
        }
    });
}

const copyBookIdBtn = document.getElementById("copyBookIdBtn");
if (copyBookIdBtn) {
    copyBookIdBtn.addEventListener("click", async () => {
        const idInput = document.getElementById("createdBookId");
        if (!idInput || !idInput.value) return;

        try {
            await navigator.clipboard.writeText(idInput.value);
        } catch (error) {
            idInput.focus();
            idInput.select();
            document.execCommand("copy");
        }

        copyBookIdBtn.textContent = "Đã sao chép";
        window.setTimeout(() => { copyBookIdBtn.textContent = "Sao chép"; }, 1500);
    });
}

// Trang upload và xuất bản: nhận ID từ liên kết, phiên hiện tại hoặc nhập tay.
const uploadBookIdInput = document.getElementById("uploadBookId");
const statusBookIdInput = document.getElementById("statusBookId");
const publishPage = Boolean(uploadBookIdInput && statusBookIdInput);
if (publishPage) {
    const params = new URLSearchParams(window.location.search);
    const savedBook = getSavedBook();
    const initialId = params.get("id") || (savedBook && savedBook.id) || "";
    uploadBookIdInput.value = initialId;
    statusBookIdInput.value = initialId;

    uploadBookIdInput.addEventListener("input", () => {
        statusBookIdInput.value = uploadBookIdInput.value.trim();
    });

    const uploadPdfForm = document.getElementById("uploadPdfForm");
    uploadPdfForm.addEventListener("submit", async event => {
        event.preventDefault();
        const message = document.getElementById("uploadPdfMessage");
        const submitBtn = document.getElementById("btnUploadPdf");
        const bookId = uploadBookIdInput.value.trim();
        const fileInput = document.getElementById("pdfFileInput");
        const file = fileInput.files && fileInput.files[0];

        if (!bookId) {
            setMessage(message, "Vui lòng nhập mã sách.", "error");
            return;
        }
        if (!file) {
            setMessage(message, "Vui lòng chọn file PDF.", "error");
            return;
        }
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
            setMessage(message, "Chỉ chấp nhận file PDF.", "error");
            return;
        }

        submitBtn.disabled = true;
        setMessage(message, "Đang upload file PDF…");
        try {
            const formData = new FormData();
            formData.append("file", file);
            const response = await fetch(
                `${API_BASE_URL}/api/v1/admin/books/${encodeURIComponent(bookId)}/upload-file`,
                {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${localStorage.getItem("access_token")}` },
                    body: formData
                }
            );
            const data = await readApiResponse(response);

            if (handleUnauthorized(response)) return;
            if (!response.ok) {
                throw new Error(getErrorMessage(data, "Upload PDF thất bại."));
            }

            statusBookIdInput.value = bookId;
            setMessage(message, `Tải PDF thành công cho sách ${bookId}. Bạn có thể xuất bản ở bước tiếp theo.`, "success");
            fileInput.value = "";
        } catch (error) {
            setMessage(message, `Lỗi: ${error.message}`, "error");
            console.error("Upload PDF error:", error);
        } finally {
            submitBtn.disabled = false;
        }
    });

    const changeStatusForm = document.getElementById("changeStatusForm");
    changeStatusForm.addEventListener("submit", async event => {
        event.preventDefault();
        const message = document.getElementById("changeStatusMessage");
        const submitBtn = document.getElementById("btnChangeStatus");
        const bookId = statusBookIdInput.value.trim();

        if (!bookId) {
            setMessage(message, "Vui lòng nhập mã sách.", "error");
            return;
        }

        submitBtn.disabled = true;
        setMessage(message, "Đang xuất bản sách…");
        try {
            const response = await fetch(
                `${API_BASE_URL}/api/v1/admin/books/${encodeURIComponent(bookId)}/status?new_status=PUBLISHED`,
                {
                    method: "PATCH",
                    headers: { "Authorization": `Bearer ${localStorage.getItem("access_token")}` }
                }
            );
            const data = await readApiResponse(response);

            if (handleUnauthorized(response)) return;
            if (!response.ok) {
                throw new Error(getErrorMessage(data, "Không thể xuất bản sách."));
            }

            setMessage(message, data.message || `Đã xuất bản sách ${bookId}.`, "success");
        } catch (error) {
            setMessage(message, `Lỗi: ${error.message}`, "error");
            console.error("Publish book error:", error);
        } finally {
            submitBtn.disabled = false;
        }
    });
}
