const booksList = document.getElementById("booksList");
const booksMessage = document.getElementById("booksMessage");
const userRole = document.getElementById("userRole");
const loadBooksButton = document.getElementById("loadBooksButton");
const logoutButton = document.getElementById("logoutButton");


function loadUserInfo() {

    const role = localStorage.getItem("user_role");

    if (role) {
        userRole.textContent = `Role: ${role}`;
    } else {
        userRole.textContent = "Chưa đăng nhập";
    }

}


async function loadBooks() {

    booksMessage.textContent =
        "Đang tải danh sách sách...";

    booksList.innerHTML = "";

    try {

        const response = await fetch(
            `${API_BASE_URL}/api/v1/books`
        );

        const data = await response.json();


        if (!response.ok) {

            throw new Error(
                data.detail ||
                "Không thể tải danh sách sách"
            );

        }


        const books = data.items;


        if (!books || books.length === 0) {

            booksMessage.textContent =
                "Hiện chưa có sách.";

            return;
        }


        booksMessage.textContent =
            `Có ${data.meta.total} sách.`;


        books.forEach(function (book) {

            const bookCard =
                document.createElement("div");

            bookCard.className =
                "book-card";


            bookCard.innerHTML = `

                <h3>${book.title}</h3>

                <p>
                    <strong>Tác giả:</strong>
                    ${book.author}
                </p>

                <p>
                    <strong>Thể loại:</strong>
                    ${book.category}
                </p>

                <p>
                    <strong>Trạng thái:</strong>
                    ${book.status}
                </p>

                <p>
                    <strong>Quyền truy cập:</strong>
                    ${book.access_level}
                </p>

                <button
                    class="view-book-button"
                    data-book-id="${book.id}">
                    Xem chi tiết
                </button>

            `;


            const viewButton =
                bookCard.querySelector(
                    ".view-book-button"
                );


            viewButton.addEventListener(
                "click",
                function (event) {

                    event.stopPropagation();

                    const bookId =
                        this.getAttribute(
                            "data-book-id"
                        );

                    window.location.href =
                        `reader.html?id=${bookId}`;

                }
            );


            booksList.appendChild(bookCard);

        });


    } catch (error) {

        booksMessage.textContent =
            error.message;

        console.error(
            "Load books error:",
            error
        );

    }

}


if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        function () {

            localStorage.removeItem(
                "access_token"
            );

            localStorage.removeItem(
                "user_role"
            );

            window.location.href =
                "login.html";

        }
    );

}


if (loadBooksButton) {

    loadBooksButton.addEventListener(
        "click",
        loadBooks
    );

}


/* =========================
   LOAD BOOK DETAIL
========================= */

async function loadBookDetail() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    const bookId =
        params.get("id");


    if (!bookId) {

        const bookMessage =
            document.getElementById(
                "bookMessage"
            );

        if (bookMessage) {

            bookMessage.textContent =
                "Không tìm thấy ID sách.";

        }

        return;

    }


    const bookDetail =
        document.getElementById(
            "bookDetail"
        );

    const bookMessage =
        document.getElementById(
            "bookMessage"
        );


    if (!bookDetail) {

        return;

    }


    bookMessage.textContent =
        "Đang tải thông tin sách...";


    try {

        const response =
            await fetch(
                `${API_BASE_URL}/api/v1/books/${bookId}`
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.detail ||
                "Không thể tải thông tin sách"
            );

        }


        bookMessage.textContent =
            "";


        bookDetail.innerHTML = `

            <div class="book-detail-card">

                <h2>${data.title}</h2>

                <p>
                    <strong>ID:</strong>
                    ${data.id}
                </p>

                <p>
                    <strong>Tác giả:</strong>
                    ${data.author}
                </p>

                <p>
                    <strong>Thể loại:</strong>
                    ${data.category}
                </p>

                <p>
                    <strong>Trạng thái:</strong>
                    ${data.status}
                </p>

                <p>
                    <strong>Quyền truy cập:</strong>
                    ${data.access_level}
                </p>

            </div>

        `;


        const readBookButton =
            document.getElementById(
                "readBookButton"
            );


        if (readBookButton) {

    if (data.status !== "PUBLISHED") {

        readBookButton.disabled = true;

        readBookButton.textContent =
            "Sách chưa sẵn sàng để đọc";

    } else {

        readBookButton.disabled = false;

        readBookButton.textContent =
            "Đọc sách";


        readBookButton.addEventListener(
            "click",
            function () {

                openReader(
                    data.id
                );

            }
        );

    }

}


    } catch (error) {

        bookMessage.textContent =
            error.message;

        console.error(
            "Load book detail error:",
            error
        );

    }

}


/* =========================
   CREATE READING SESSION
========================= */

function openReader(bookId) {
    window.location.href = "read.html?id=" + encodeURIComponent(bookId);
}


/* =========================
   INITIALIZE
========================= */

loadUserInfo();


if (document.getElementById("booksList")) {

    loadBooks();

}


loadBookDetail();
