const forgotPasswordForm = document.getElementById("forgotPasswordForm");

if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", async event => {
        event.preventDefault();
        const button = document.getElementById("requestResetButton");
        const message = document.getElementById("forgotPasswordMessage");
        button.disabled = true;
        message.textContent = "Đang gửi yêu cầu…";

        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/auth/password-reset-requests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: document.getElementById("resetEmail").value.trim() })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || "Không gửi được yêu cầu. Vui lòng thử lại.");
            message.textContent = data.message;
            message.dataset.state = "success";
        } catch (error) {
            message.textContent = error.message || "Không kết nối được máy chủ. Vui lòng thử lại.";
            message.dataset.state = "error";
        } finally {
            button.disabled = false;
        }
    });
}
