const loginForm = document.getElementById("loginForm");


if (loginForm) {

    loginForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            const email =
                document.getElementById("email")
                    .value
                    .trim();

            const password =
                document.getElementById("password")
                    .value;

            const loginMessage =
                document.getElementById(
                    "loginMessage"
                );


            loginMessage.textContent =
                "Đang đăng nhập...";


            try {

                const formData =
                    new URLSearchParams();


                formData.append(
                    "username",
                    email
                );

                formData.append(
                    "password",
                    password
                );


                const response =
                    await fetch(
                        `${API_BASE_URL}/api/v1/auth/login`,
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/x-www-form-urlencoded"
                            },

                            body: formData
                        }
                    );


                const data =
                    await response.json();


                if (!response.ok) {

                    throw new Error(
                        data.detail ||
                        "Đăng nhập thất bại"
                    );

                }


                /*
                 * Lưu thông tin đăng nhập
                 */

                localStorage.setItem(
                    "access_token",
                    data.access_token
                );

                localStorage.setItem(
                    "user_role",
                    data.role
                );


                loginMessage.textContent =
                    `Đăng nhập thành công - Role: ${data.role}`;


                console.log(
                    "Login response:",
                    data
                );


                /*
                 * Điều hướng theo Role
                 */

                console.log("Role nhận được từ Backend:", data.role);

                if (data.role === "ADMIN" ||
                    data.role === "MANAGER") {

                    window.location.href = "admin.html";

                } else if (data.role === "READER") {

                    window.location.href = "books.html";

                } else {

                    loginMessage.textContent =
                    "Role không hợp lệ: " + data.role;

                }


            } catch (error) {

                loginMessage.textContent =
                    error.message;

                console.error(
                    "Login error:",
                    error
                );

            }

        }
    );

}
