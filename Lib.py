import uuid
import datetime
import os
import io
import json
import logging
from typing import Optional, List
from enum import Enum
from contextlib import asynccontextmanager

from fastapi import( FastAPI,
                    HTTPException,
                    status,
                    Depends,
                    Query,
                    UploadFile,
                    File)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pathlib import Path
from urllib.parse import urljoin
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import create_engine, Column, String, Integer, DateTime, or_
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from pwdlib import PasswordHash
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ==========================================
# CẤU HÌNH & HẰNG SỐ (Mục 7.6, 7.7)
# ==========================================
APP_ENV = os.getenv("APP_ENV", "development").lower()
SECRET_KEY = os.getenv("SECRET_KEY", "DEMO_SECRET_KEY_FOR_LOCAL_TESTING")
if APP_ENV == "production" and SECRET_KEY == "DEMO_SECRET_KEY_FOR_LOCAL_TESTING":
    raise RuntimeError("SECRET_KEY must be set to a unique value in production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
READING_SESSION_EXPIRE_MINUTES = 10
PUBLIC_API_BASE_URL = os.getenv("PUBLIC_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "digital-library-books")
SUPABASE_STORAGE_ENABLED = bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
if APP_ENV == "production" and not SUPABASE_STORAGE_ENABLED:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in production")
supabase_storage = None
if SUPABASE_STORAGE_ENABLED:
    from supabase import create_client
    supabase_storage = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

password_hash = PasswordHash.recommended()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./library_demo.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgres://"):]
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgresql://"):]
engine_options = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}
engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ==========================================
# CƠ SỞ DỮ LIỆU & MODELS
# ==========================================
class UserRole(str, Enum):
    READER = "READER"
    MANAGER = "MANAGER"
    ADMIN = "ADMIN"


class BookStatus(str, Enum):
    DRAFT = "DRAFT"
    PROCESSING = "PROCESSING"
    PUBLISHED = "PUBLISHED"
    HIDDEN = "HIDDEN"
    FAILED = "FAILED"
    DELETED = "DELETED"


class AccessLevel(str, Enum):
    PUBLIC = "PUBLIC"
    MEMBER = "MEMBER"


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default=UserRole.READER.value)
    is_active = Column(Integer, default=1)


class Book(Base):
    __tablename__ = "books"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False, index=True)
    author = Column(String, nullable=False, index=True)
    category = Column(String, nullable=False, index=True)
    status = Column(String, default=BookStatus.DRAFT.value)
    access_level = Column(String, default=AccessLevel.MEMBER.value)
    file_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


Base.metadata.create_all(bind=engine)


# ==========================================
# SCHEMAS (Pydantic v2 chuẩn hóa)
# ==========================================
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    role: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str


def parse_categories(value) -> List[str]:
    """Read category JSON written by newer clients and plain text from older rows."""
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        source = value
    else:
        text = str(value).strip()
        if not text:
            return []
        try:
            decoded = json.loads(text)
        except (TypeError, json.JSONDecodeError):
            decoded = text.split(",")
        source = decoded if isinstance(decoded, (list, tuple, set)) else [decoded]

    categories = []
    seen = set()
    for item in source:
        name = str(item).strip()
        key = name.casefold()
        if name and key not in seen:
            categories.append(name)
            seen.add(key)
    return categories


class BookCreate(BaseModel):
    title: str
    author: str
    categories: List[str] = Field(default_factory=list, min_length=1)
    # Keep accepting the old single-category request during the frontend transition.
    category: Optional[str] = None
    access_level: Optional[AccessLevel] = AccessLevel.MEMBER

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_category(cls, values):
        if isinstance(values, dict):
            values = values.copy()
            if not values.get("categories") and values.get("category"):
                values["categories"] = parse_categories(values["category"])
        return values

    @field_validator("categories", mode="before")
    @classmethod
    def clean_categories(cls, value):
        return parse_categories(value)


class BookOut(BaseModel):
    id: str
    title: str
    author: str
    category: str
    categories: List[str] = Field(default_factory=list)
    status: str
    access_level: str
    created_at: Optional[datetime.datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def expose_category_list(cls, value):
        if isinstance(value, dict):
            data = value.copy()
        else:
            data = {
                field: getattr(value, field, None)
                for field in ("id", "title", "author", "category", "status", "access_level", "created_at")
            }
        categories = parse_categories(data.get("categories") or data.get("category"))
        data["categories"] = categories
        # Preserve the original string field for existing frontend clients.
        data["category"] = ", ".join(categories)
        return data


# ==========================================
# HÀM BẢO MẬT & XÁC THỰC
# ==========================================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_hash.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None):
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + (expires_delta or datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db)
):
    if not token:
        return None

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        user_id = payload.get("sub")

        if user_id is None:
            return None

        user = db.query(User).filter(
            User.id == user_id,
            User.is_active == 1
        ).first()

        return user

    except JWTError:
        return None


def get_current_user(token: str = Depends(oauth2_scheme_optional), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or user.is_active != 1:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tài khoản bị khóa hoặc không tồn tại")
    return user


def require_role(roles: List[UserRole]):
    def role_checker(user: User = Depends(get_current_user)):
        if user.role not in [r.value for r in roles]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không đủ quyền thực hiện thao tác")
        return user

    return role_checker


# ==========================================
# KHỞI TẠO FASTAPI VỚI LIFESPAN
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    admin_email = os.getenv("INITIAL_ADMIN_EMAIL", "").strip().lower()
    admin_password = os.getenv("INITIAL_ADMIN_PASSWORD", "")
    if APP_ENV == "production" and (not admin_email or not admin_password):
        db.close()
        raise RuntimeError("INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be configured in production")
    if admin_email and admin_password and not db.query(User).filter(User.email == admin_email).first():
        admin = User(
            email=admin_email,
            hashed_password=hash_password(admin_password),
            role=UserRole.ADMIN.value,
            is_active=1
        )
        db.add(admin)
        db.commit()
    db.close()
    yield


app = FastAPI(title="Neptruyen API", version="1.0", lifespan=lifespan)
configured_origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500"
]
configured_origins.extend(
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(configured_origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------
# AUTH (UC-01, UC-02)
# ------------------------------------------
@app.post("/api/v1/auth/register", status_code=status.HTTP_201_CREATED, tags=["Auth"])
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    normalized_email = user_data.email.strip().lower()  # BR-01
    existing_user = db.query(User).filter(User.email == normalized_email).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email đã được sử dụng")

    if len(user_data.password) < 8:  # BR-04
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Mật khẩu phải từ 8 ký tự trở lên")

    new_user = User(
        email=normalized_email,
        hashed_password=hash_password(user_data.password),
        role=UserRole.READER.value,  # BR-02
        is_active=1
    )
    db.add(new_user)
    db.commit()
    return {"message": "Đăng ký thành công", "email": new_user.email}


@app.post("/api/v1/auth/login", response_model=TokenResponse, tags=["Auth"])
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username.strip().lower()).first()

    if not user or not verify_password(form_data.password, user.hashed_password):  # BR-08
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email hoặc mật khẩu không chính xác")

    if user.is_active != 1:  # BR-05
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tài khoản đang bị khóa")

    token = create_access_token(data={"sub": user.id, "role": user.role})
    return {"access_token": token, "token_type": "bearer", "role": user.role}


# ------------------------------------------
# SÁCH (UC-03, 04, 08, 09)
# ------------------------------------------
@app.get("/api/v1/books", tags=["Books"])
def list_books(
        q: Optional[str] = Query(None, max_length=100),  # BR-12
        category: Optional[str] = None,
        page: int = Query(1, ge=1),  # BR-27
        page_size: int = Query(10, ge=1, le=50),  # BR-28
        db: Session = Depends(get_db)
):
    query = db.query(Book).filter(Book.status == BookStatus.PUBLISHED.value)  # BR-10, BR-56

    if q:
        query = query.filter(Book.title.contains(q) | Book.author.contains(q))
    if category:
        category_json = json.dumps(category, ensure_ascii=False)
        query = query.filter(or_(
            Book.category == category,
            Book.category.contains(category_json)
        ))

    total = query.count()
    offset = (page - 1) * page_size
    books = query.order_by(Book.id).offset(offset).limit(page_size).all()

    return {
        "items": [BookOut.model_validate(book).model_dump() for book in books],
        "meta": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size if total > 0 else 0
        }
    }


@app.get("/api/v1/books/{book_id}", response_model=BookOut, tags=["Books"])
def get_book_detail(book_id: str, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id, Book.status == BookStatus.PUBLISHED.value).first()
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy sách")
    return book


# ------------------------------------------
# PHIÊN ĐỌC (UC-05)
# ------------------------------------------
@app.post("/api/v1/books/{book_id}/reading-session", tags=["Books"])
def create_reading_session(
        book_id: str,
        user: Optional[User] = Depends(get_current_user_optional),
        db: Session = Depends(get_db)
):
    book = db.query(Book).filter(Book.id == book_id, Book.status == BookStatus.PUBLISHED.value).first()
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy sách")

    if book.access_level == AccessLevel.MEMBER.value and user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Vui lòng đăng nhập để đọc tài liệu thành viên")

    if not book.file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nội dung sách tạm thời không khả dụng")

    session_token = create_access_token(
        data={"book_id": book.id, "type": "reading_session"},
        expires_delta=datetime.timedelta( minutes= READING_SESSION_EXPIRE_MINUTES)
    )

    return {
        "session_url": f"{PUBLIC_API_BASE_URL}/api/v1/stream/{book.id}?token={session_token}",
        "expires_in_minutes": READING_SESSION_EXPIRE_MINUTES
    }


# ------------------------------------------
# QUẢN TRỊ (UC-10, UC-13)
# ------------------------------------------
@app.post("/api/v1/admin/books", response_model=BookOut, status_code=status.HTTP_201_CREATED, tags=["Admin - Books"])
def create_book(
        book_in: BookCreate,
        current_user: User = Depends(require_role([UserRole.MANAGER, UserRole.ADMIN])),
        db: Session = Depends(get_db)
):
    book = Book(
        title=book_in.title,
        author=book_in.author,
        category=json.dumps(book_in.categories, ensure_ascii=False),
        access_level=book_in.access_level.value,
        status=BookStatus.DRAFT.value
    )
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


STORAGE_DIR = Path("storage/files")
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


@app.post(
    "/api/v1/admin/books/{book_id}/upload-file",
    tags=["Admin - Books"]
)
def upload_book_file(
    book_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(
        require_role([UserRole.MANAGER, UserRole.ADMIN])
    ),
    db: Session = Depends(get_db)
):
    book = db.query(Book).filter(Book.id == book_id).first()

    if not book:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy sách"
        )

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Chỉ chấp nhận tệp PDF"
        )

    try:
        file.file.seek(0, os.SEEK_END)
        file_size = file.file.tell()
        file.file.seek(0)
        max_file_size = int(os.getenv("MAX_BOOK_FILE_MB", "50")) * 1024 * 1024
        if file_size > max_file_size:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File vượt quá giới hạn {max_file_size // (1024 * 1024)} MB"
            )

        safe_filename = f"{book.id}.pdf"
        if supabase_storage:
            storage_path = safe_filename
            supabase_storage.storage.from_(SUPABASE_STORAGE_BUCKET).upload(
                path=storage_path,
                file=file.file,
                file_options={
                    "content-type": "application/pdf",
                    "upsert": "true"
                }
            )
            book.file_path = f"supabase://{storage_path}"
        else:
            file_path = STORAGE_DIR / safe_filename
            with file_path.open("wb") as output:
                while True:
                    chunk = file.file.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
            book.file_path = str(file_path.resolve())

        db.commit()

        return {
            "message": "Tải tệp thành công",
            "book_id": book.id,
            "file_path": book.file_path
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        if not supabase_storage:
            local_path = STORAGE_DIR / f"{book.id}.pdf"
            if local_path.exists():
                local_path.unlink()
        logger.exception("Book upload failed (book_id=%s)", book.id)
        raise HTTPException(
            status_code=500,
            detail="Không thể lưu tệp sách"
        )

    finally:
        file.file.close()

@app.patch("/api/v1/admin/books/{book_id}/status", tags=["Admin - Books"])
def update_book_status(
        book_id: str,
        new_status: BookStatus,
        current_user: User = Depends(require_role([UserRole.MANAGER, UserRole.ADMIN])),
        db: Session = Depends(get_db)
):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy sách")

    current_st = book.status

    if current_st == BookStatus.DRAFT.value and new_status == BookStatus.PUBLISHED:
        if not book.file_path:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Truyện chưa có tệp nội dung, không thể xuất bản (BR-40)"
            )
        book.status = BookStatus.PUBLISHED.value

    elif current_st == BookStatus.DELETED.value and new_status == BookStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể chuyển từ DELETED sang PUBLISHED trực tiếp. Cần khôi phục về HIDDEN trước."
        )

    elif current_st == BookStatus.DELETED.value and new_status == BookStatus.HIDDEN:
        book.status = BookStatus.HIDDEN.value

    elif new_status in [BookStatus.HIDDEN, BookStatus.PUBLISHED, BookStatus.DELETED]:
        book.status = new_status.value
    else:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Chuyển đổi trạng thái không hợp lệ")

    db.commit()
    return {"message": f"Chuyển trạng thái thành công: {current_st} -> {book.status}"}

@app.get("/api/v1/stream/{book_id}", tags=["Reading"])
def stream_book(
        book_id: str,
        token: str = Query(...),
        db: Session = Depends(get_db)
):
    # 1. Kiểm tra token
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Reading session không hợp lệ hoặc đã hết hạn"
        )

    # 2. Kiểm tra loại token
    if payload.get("type") != "reading_session":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không phải reading session"
        )

    # 3. Kiểm tra book_id trong token
    token_book_id = payload.get("book_id")

    if token_book_id != book_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token không thuộc về sách này"
        )

    # 4. Tìm sách và chỉ cho đọc sách đã PUBLISHED
    book = db.query(Book).filter(
        Book.id == book_id,
        Book.status == BookStatus.PUBLISHED.value
    ).first()

    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy truyện hoặc truyện chưa được xuất bản"
        )

    # 5. Kiểm tra file
    if not book.file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nội dung sách không khả dụng"
        )

    if book.file_path.startswith("supabase://"):
        if not supabase_storage:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Chưa cấu hình kho lưu trữ PDF"
            )
        storage_path = book.file_path.removeprefix("supabase://")
        try:
            signed_response = supabase_storage.storage.from_(SUPABASE_STORAGE_BUCKET).create_signed_url(
                storage_path,
                READING_SESSION_EXPIRE_MINUTES * 60
            )
            signed_url = signed_response.get("signedURL") or signed_response.get("signedUrl")
            if not signed_url:
                raise ValueError("Supabase không trả về signed URL")
            if signed_url.startswith("/"):
                if signed_url.startswith("/storage/v1/"):
                    signed_url = urljoin(SUPABASE_URL.rstrip("/") + "/", signed_url.lstrip("/"))
                else:
                    signed_url = urljoin(f"{SUPABASE_URL.rstrip('/')}/storage/v1/", signed_url.lstrip("/"))
            return RedirectResponse(url=signed_url)
        except Exception as error:
            print(f"Book stream URL creation failed: {error}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Không thể mở tệp PDF"
            )

    file_path = Path(book.file_path)

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tệp PDF"
        )

    # 6. Trả file PDF
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"{book.title}.pdf",
        content_disposition_type="inline"
    )

@app.get("/healthz", tags=["System"])
def health_check():
    return {"status": "ok", "app": "Neptruyen"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("Lib:app", host="127.0.0.1", port=8000, reload=True)
