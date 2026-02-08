# app/db.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# If DATABASE_URL is missing, you can allow sqlite fallback by setting:
# ALLOW_SQLITE_FALLBACK=1
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
ALLOW_SQLITE_FALLBACK = os.getenv("ALLOW_SQLITE_FALLBACK", "0").strip() == "1"

if not DATABASE_URL:
    if ALLOW_SQLITE_FALLBACK:
        # Use persistent path on Azure Linux App Service if you really need sqlite:
        # sqlite:////home/site/wwwroot/garirakho.db
        DATABASE_URL = "sqlite:///./garirakho.db"
        print("⚠️ DATABASE_URL missing → using SQLITE fallback:", DATABASE_URL)
    else:
        raise RuntimeError("❌ DATABASE_URL is missing. Set it in App Service → Configuration.")

# SQLite needs check_same_thread=False
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

db_kind = "SQLite" if DATABASE_URL.startswith("sqlite") else "PostgreSQL"
print(f"✅ DB selected: {db_kind}")

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    pool_recycle=1800,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
