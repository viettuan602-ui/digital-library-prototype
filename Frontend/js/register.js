async function handleRegister(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const email = form.elements.regEmail.value.trim().toLowerCase();
    const password = form.elements.regPassword.value;
    const confirmPassword = form.elements.regConfirmPassword.value;
    const messageEl = document.getElementById("registerMessage");
    const submitBtn = document.getElementById("btnRegister");

    if (password !== confirmPassword) {
        messageEl.style.color = "red";
        messageEl.textContent = "Mật khẩu xác nhận không khớp!";
        return;
    }

    if (password.length < 8) {
        messageEl.style.color = "red";
        messageEl.textContent = "Mật khẩu phải từ 8 ký tự trở lên (BR-04)!";
        return;
    }

    messageEl.style.color = "#333";
    messageEl.textContent = "Đang xử lý đăng ký...";
    submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const detail = Array.isArray(data.detail)
                ? data.detail[0]?.msg
                : data.detail;
            throw new Error(detail || "Đăng ký thất bại");
        }

        messageEl.style.color = "green";
        messageEl.textContent = "Đăng ký thành công! Đang chuyển đến trang đăng nhập...";

        // Dùng URL tương đối theo trang hiện tại, rồi chuyển ngay khi API đã xác nhận thành công.
        window.location.replace(new URL("./dang-nhap.html", window.location.href).href);
    } catch (error) {
        messageEl.style.color = "red";
        messageEl.textContent = `Lỗi: ${error.message}`;
        console.error("Register error:", error);
        submitBtn.disabled = false;
    }
}

const registerForm = document.getElementById("registerform");
if (registerForm) {
    registerForm.addEventListener("submit", handleRegister);
} else {
    console.error('Không tìm thấy form đăng ký có id="registerform".');
}

