const resetPasswordForm = document.getElementById("resetPasswordForm");
const resetFragment = new URLSearchParams(window.location.hash.slice(1));
const resetToken = resetFragment.get("token") || "";
if (window.location.hash) history.replaceState(null, "", window.location.pathname);

if (resetPasswordForm) {
    const button = document.getElementById("resetPasswordButton");
    const message = document.getElementById("resetPasswordMessage");
    if (!resetToken) {
        button.disabled = true;
        message.textContent = "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.";
        message.dataset.state = "error";
    }

    resetPasswordForm.addEventListener("submit", async event => {
        event.preventDefault();
        const password = document.getElementById("newPassword").value;
        const confirmation = document.getElementById("confirmPassword").value;
        if (password !== confirmation) {
            message.textContent = "Mật khẩu nhập lại chưa khớp.";
            message.dataset.state = "error";
            return;
        }

        button.disabled = true;
        message.textContent = "Đang cập nhật mật khẩu…";
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/auth/password-resets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: resetToken, new_password: password })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || "Không đặt lại được mật khẩu. Hãy yêu cầu liên kết mới.");
            message.textContent = data.message;
            message.dataset.state = "success";
            resetPasswordForm.hidden = true;
        } catch (error) {
            message.textContent = error.message || "Không kết nối được máy chủ. Vui lòng thử lại.";
            message.dataset.state = "error";
        } finally {
            button.disabled = false;
        }
    });
}
