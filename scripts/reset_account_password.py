"""Manually reset an account password without storing the plaintext password.

Run from the project root with DATABASE_URL configured in the environment or
the local .env file. The password is prompted without echoing and written to
users.hashed_password using the same pwdlib recommended hasher as Lib.py.
"""

from getpass import getpass
import os
import sys

from dotenv import load_dotenv
from pwdlib import PasswordHash
from sqlalchemy import create_engine, text


def main() -> int:
    load_dotenv()
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        print("DATABASE_URL chưa được cấu hình; không có thay đổi nào được thực hiện.")
        return 1

    if database_url.startswith("postgres://"):
        database_url = "postgresql+psycopg://" + database_url[len("postgres://"):]
    elif database_url.startswith("postgresql://"):
        database_url = "postgresql+psycopg://" + database_url[len("postgresql://"):]

    database_kind = "PostgreSQL" if database_url.startswith("postgresql") else "SQLite/local"

    email = input("Email tài khoản cần đặt lại: ").strip().lower()
    if not email:
        print("Email không được để trống.")
        return 1

    new_password = getpass("Mật khẩu mới (tối thiểu 8 ký tự): ")
    confirmation = getpass("Nhập lại mật khẩu mới: ")
    if len(new_password) < 8:
        print("Mật khẩu phải có ít nhất 8 ký tự.")
        return 1
    if new_password != confirmation:
        print("Hai mật khẩu không khớp.")
        return 1

    print(f"\nCơ sở dữ liệu mục tiêu: {database_kind} (được chọn qua DATABASE_URL).")
    print("Tác vụ chỉ cập nhật password hash; mật khẩu rõ không được ghi vào database.")
    if input('Gõ RESET để xác nhận: ').strip() != "RESET":
        print("Đã hủy; không có thay đổi nào được thực hiện.")
        return 1

    engine = create_engine(database_url, pool_pre_ping=True)
    password_hash = PasswordHash.recommended().hash(new_password)
    try:
        with engine.begin() as connection:
            user = connection.execute(
                text("SELECT id FROM users WHERE lower(email) = :email"),
                {"email": email},
            ).first()
            if user is None:
                print("Không tìm thấy tài khoản; không có thay đổi nào được thực hiện.")
                return 1

            connection.execute(
                text("UPDATE users SET hashed_password = :password_hash WHERE id = :user_id"),
                {"password_hash": password_hash, "user_id": user.id},
            )
    except Exception as error:
        print(f"Không thể cập nhật mật khẩu ({type(error).__name__}); không lưu mật khẩu dạng rõ.")
        return 1
    finally:
        engine.dispose()

    print("Đã cập nhật mật khẩu. Cơ sở dữ liệu chỉ lưu hash Argon2.")
    print("Các access token hiện hữu có thể còn hiệu lực tối đa 15 phút.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
