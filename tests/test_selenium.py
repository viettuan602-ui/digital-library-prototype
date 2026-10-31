from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import time
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


def create_driver():
    options = Options()
    options.add_argument("--start-maximized")

    driver = webdriver.Chrome(options=options)
    return driver
def test_open_login_page():
    driver = create_driver()

    driver.get("http://127.0.0.1:5500/dang-nhap.html")

    print("Title:", driver.title)

    driver.quit()
def test_login_interface():
    driver = create_driver()
    try:
        driver.get("http://127.0.0.1:5500/dang-nhap.html")

        # Khớp chính xác id='email', id='password' và class='btn-login'
        email_input = driver.find_element(By.ID, "email")
        password_input = driver.find_element(By.ID, "password")
        login_button = driver.find_element(By.CSS_SELECTOR, "button.btn-login")

        # Kiểm tra hiển thị
        assert email_input.is_displayed()
        assert password_input.is_displayed()
        assert login_button.is_displayed()
    finally:
        driver.quit()

def test_login_success():
    driver = create_driver()
    try:
        driver.get("http://127.0.0.1:5500/dang-nhap.html")

        # 1. Nhập thông tin tài khoản hợp lệ (hãy thay bằng email & pass thật của bạn)
        driver.find_element(By.ID, "email").send_keys("admin@example.com")
        driver.find_element(By.ID, "password").send_keys("mat_khau_that_cua_ban")

        # 2. Click nút đăng nhập
        driver.find_element(By.CSS_SELECTOR, "button.btn-login").click()

        # 3. Chờ tối đa 5 giây cho đến khi URL chuyển sang kham-pha-truyen.html
        WebDriverWait(driver, 5).until(
            EC.url_contains("kham-pha-truyen.html")
        )

        # 4. Kiểm tra URL hiện tại
        assert "kham-pha-truyen.html" in driver.current_url
        print("\n[OK] Đăng nhập thành công và đã điều hướng sang kham-pha-truyen.html!")

    finally:
        driver.quit()


def test_admin_role_displayed():
    driver = create_driver()
    try:
        driver.get("http://127.0.0.1:5500/dang-nhap.html")

        driver.find_element(By.ID, "email").send_keys("admin@example.com")
        driver.find_element(By.ID, "password").send_keys("YOUR_PASSWORD")
        driver.find_element(By.CSS_SELECTOR, "button.btn-login").click()

        WebDriverWait(driver, 5).until(
            EC.url_changes("http://127.0.0.1:5500/dang-nhap.html")
        )

        stored_role = driver.execute_script("return localStorage.getItem('user_role');")

        role_element = driver.find_element(By.ID, "userRole")

        assert stored_role is not None
        assert "ADMIN" in stored_role.upper() or "ADMIN" in role_element.text.upper()
        print("\n[OK] ST03 Passed: Cấu trúc dữ liệu role hợp lệ.")
    finally:
        driver.quit()


def test_books_are_displayed():
    driver = create_driver()
    try:
        driver.get("http://127.0.0.1:5500/dang-nhap.html")

        driver.find_element(By.ID, "email").send_keys("admin@example.com")
        driver.find_element(By.ID, "password").send_keys("YOUR_PASSWORD")
        driver.find_element(By.CSS_SELECTOR, "button.btn-login").click()

        WebDriverWait(driver, 5).until(
            EC.url_contains("kham-pha-truyen.html")
        )
        books_list = WebDriverWait(driver, 5).until(
            EC.visibility_of_element_located((By.ID, "booksList"))
        )


        items = books_list.find_elements(By.XPATH, "./*")

        assert len(items) > 0, "Danh sách sách trống hoặc chưa render xong."
        print(f"\n[OK] ST04 Passed: Container booksList hiển thị với {len(items)} phần tử.")

    finally:
        driver.quit()


def test_login_empty_fields():
    driver = create_driver()
    try:
        driver.get("http://127.0.0.1:5500/dang-nhap.html")

        driver.find_element(By.ID, "email").clear()
        driver.find_element(By.ID, "password").clear()

        driver.find_element(By.CSS_SELECTOR, "button.btn-login").click()

        time.sleep(1)

        assert "dang-nhap.html" in driver.current_url

        email_elem = driver.find_element(By.ID, "email")
        is_valid = driver.execute_script("return arguments[0].checkValidity();", email_elem)
        assert is_valid is False, "Trình duyệt phải đánh dấu ô email là không hợp lệ khi để trống"

        print("\n[OK] ST05 Passed: Form chặn thành công khi dữ liệu rỗng.")
    finally:
        driver.quit()


def test_access_without_login():
    driver = create_driver()
    try:
        driver.get("http://127.0.0.1:5500/trang-chu.html")
        driver.execute_script("localStorage.clear();")

        driver.get("http://127.0.0.1:5500/kham-pha-truyen.html")

        time.sleep(2)

        assert "dang-nhap.html" in driver.current_url, \
            f"Bảo vệ thất bại: Vẫn ở lại '{driver.current_url}' dù chưa đăng nhập!"

        print("\n[OK] ST06 Passed: Hệ thống đã chặn và đẩy về trang đăng nhập.")
    finally:
        driver.quit()
def test_book_detail():
    driver = create_driver()
    try:
        driver.get("http://127.0.0.1:5500/dang-nhap.html")

        driver.find_element(By.ID, "email").send_keys("admin@example.com")
        driver.find_element(By.ID, "password").send_keys("YOUR_PASSWORD")
        driver.find_element(By.CSS_SELECTOR, "button.btn-login").click()

        WebDriverWait(driver, 5).until(
            EC.url_contains("kham-pha-truyen.html")
        )

        detail_button = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Xem chi tiết') or contains(text(), 'Chi tiết')] | //div[@id='booksList']//a | //div[@id='booksList']//button"))
        )
        detail_button.click()

        WebDriverWait(driver, 5).until(
            EC.url_contains("chi-tiet-truyen.html")
        )

        WebDriverWait(driver, 5).until(
            EC.visibility_of_element_located((By.ID, "bookDetail"))
        )

        assert "chi-tiet-truyen.html" in driver.current_url
        print("\n[OK] ST07 Passed: Điều hướng độc lập tới trang chi tiết sách thành công.")
    finally:
        driver.quit()
def test_invalid_book_id():
    driver = create_driver()
    try:
        driver.get("http://127.0.0.1:5500/chi-tiet-truyen.html?id=999999")

        message_elem = WebDriverWait(driver, 5).until(
            EC.visibility_of_element_located((By.ID, "bookMessage"))
        )

        WebDriverWait(driver, 5).until(
            lambda d: message_elem.text != "" and message_elem.text != "Đang tải thông tin sách..."
        )

        assert message_elem.is_displayed()
        print(f"\n[OK] ST08 Passed: Nhánh xử lý ID không tồn tại phản hồi thông báo: '{message_elem.text}'.")
    finally:
        driver.quit()
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def test_login_wrong_password():
    driver = create_driver()
    try:
        driver.get("http://127.0.0.1:5500/dang-nhap.html")

        driver.find_element(By.ID, "email").send_keys("admin@example.com")
        driver.find_element(By.ID, "password").send_keys("sai_mat_khau_123456")

        driver.find_element(By.CSS_SELECTOR, "button.btn-login").click()

        message_elem = WebDriverWait(driver, 5).until(
            EC.visibility_of_element_located((By.ID, "loginMessage"))
        )

        WebDriverWait(driver, 5).until(lambda d: message_elem.text.strip() != "")

        assert "dang-nhap.html" in driver.current_url
        assert message_elem.is_displayed()
        print(f"\n[OK] ST09 Passed: Bắt lỗi đăng nhập thành công với thông báo: '{message_elem.text}'.")
    finally:
        driver.quit()
def test_logout():
    driver = create_driver()
    try:
        driver.get("http://127.0.0.1:5500/dang-nhap.html")

        driver.find_element(By.ID, "email").send_keys("admin@example.com")
        driver.find_element(By.ID, "password").send_keys("YOUR_PASSWORD")
        driver.find_element(By.CSS_SELECTOR, "button.btn-login").click()

        WebDriverWait(driver, 5).until(
            EC.url_changes("http://127.0.0.1:5500/dang-nhap.html")
        )


        logout_btn = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "#logoutButton, #logoutBtn"))
        )
        logout_btn.click()

        WebDriverWait(driver, 5).until(
            EC.url_contains("dang-nhap.html")
        )

        token = driver.execute_script("return localStorage.getItem('access_token');")
        role = driver.execute_script("return localStorage.getItem('user_role');")

        assert token is None or token == ""
        assert role is None or role == ""
        assert "dang-nhap.html" in driver.current_url

        print("\n[OK] ST10 Passed: Đăng xuất an toàn, dữ liệu session đã được dọn sạch.")
    finally:
        driver.quit()