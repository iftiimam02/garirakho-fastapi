import os
from fastapi import FastAPI, Request, Form, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .db import Base, engine, SessionLocal
from .models import User, Device
from .auth import hash_password, verify_password, make_session, read_session
from .iot import send_c2d

INGEST_API_KEY = os.getenv("INGEST_API_KEY", "devkey")

app = FastAPI(title="Garirakho")
templates = Jinja2Templates(directory="app/templates")
app.mount("/static", StaticFiles(directory="app/static"), name="static")


# -------------------- DATABASE --------------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.on_event("startup")
def on_startup():
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)


# -------------------- USER AUTH --------------------

def get_current_user(request: Request, db: Session) -> User | None:
    uid = read_session(request)
    if not uid:
        return None
    return db.query(User).filter(User.id == uid).first()


def require_login(request: Request, db: Session) -> User:
    user = get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    return user


def require_admin(request: Request, db: Session) -> User:
    user = require_login(request, db)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# -------------------- ROUTES --------------------

@app.get("/", response_class=HTMLResponse)
def root(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if user:
        return RedirectResponse("/dashboard")
    return RedirectResponse("/login")


# -------------------- AUTH UI --------------------

@app.get("/signup", response_class=HTMLResponse)
def signup_page(request: Request):
    return templates.TemplateResponse("signup.html", {"request": request, "error": None})


@app.post("/signup")
def signup(
    request: Request,
    full_name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    confirm_password: str = Form(...),
    db: Session = Depends(get_db),
):
    full_name = full_name.strip()
    email = email.strip().lower()

    if password != confirm_password:
        return templates.TemplateResponse("signup.html", {"request": request, "error": "Passwords do not match"})

    if len(password) < 6:
        return templates.TemplateResponse("signup.html", {"request": request, "error": "Password must be at least 6 characters"})

    if db.query(User).filter(User.email == email).first():
        return templates.TemplateResponse("signup.html", {"request": request, "error": "Email already exists"})

    # First user becomes admin automatically
    any_user = db.query(User).first()
    is_admin = (any_user is None)

    user = User(
        full_name=full_name,
        email=email,
        password_hash=hash_password(password),
        is_admin=is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    resp = RedirectResponse("/dashboard", status_code=302)
    resp.set_cookie("session", make_session(user.id), httponly=True, samesite="lax")
    return resp


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@app.post("/login")
def login(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    email = email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password_hash):
        return templates.TemplateResponse("login.html", {"request": request, "error": "Invalid email or password"})

    resp = RedirectResponse("/dashboard", status_code=302)
    resp.set_cookie("session", make_session(user.id), httponly=True, samesite="lax")
    return resp


@app.get("/logout")
def logout():
    resp = RedirectResponse("/login", status_code=302)
    resp.delete_cookie("session")
    return resp


# -------------------- DASHBOARD --------------------

@app.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login")
    return templates.TemplateResponse("dashboard.html", {"request": request, "user": user})


# -------------------- API --------------------

@app.get("/api/me")
def api_me(request: Request, db: Session = Depends(get_db)):
    user = require_login(request, db)
    return {"email": user.email, "fullName": user.full_name, "isAdmin": user.is_admin}


@app.get("/api/devices")
def api_devices(request: Request, db: Session = Depends(get_db)):
    user = require_login(request, db)
    devices = db.query(Device).order_by(Device.last_seen.desc()).all()
    return [
        {
            "deviceId": d.device_id,
            "entranceCm": d.entrance_cm,
            "exitApproved": d.exit_approved,
            "slots": d.slots or [],
            "lastMsgCount": d.last_msg_count,
            "lastSeen": d.last_seen.isoformat() if d.last_seen else None,
            "isAdmin": user.is_admin,
        }
        for d in devices
    ]


# -------------------- TELEMETRY INGEST --------------------

@app.post("/api/ingest")
async def ingest(request: Request, db: Session = Depends(get_db)):
    key = request.headers.get("x-api-key", "")
    if key != INGEST_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    payload = await request.json()
    device_id = payload.get("deviceId")
    if not device_id:
        raise HTTPException(status_code=400, detail="deviceId missing")

    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        device = Device(device_id=device_id)
        db.add(device)

    device.entrance_cm = int(payload.get("entranceCm") or 0)
    device.exit_approved = bool(payload.get("exitApproved") or False)
    device.slots = payload.get("slots") or []
    device.last_msg_count = int(payload.get("msgCount") or 0)

    db.commit()
    return {"ok": True}


# -------------------- ADMIN COMMANDS --------------------

@app.post("/api/cmd/open-gate")
def cmd_open_gate(request: Request, deviceId: str, db: Session = Depends(get_db)):
    require_admin(request, db)
    send_c2d(deviceId, {"openGate": True})
    return {"ok": True}


@app.post("/api/cmd/exit-approved")
def cmd_exit_approved(request: Request, deviceId: str, approved: bool, db: Session = Depends(get_db)):
    require_admin(request, db)
    send_c2d(deviceId, {"exitApproved": bool(approved)})
    return {"ok": True}


@app.post("/api/cmd/book-slots")
def cmd_book_slots(
    request: Request,
    deviceId: str,
    slot1: bool = False,
    slot2: bool = False,
    slot3: bool = False,
    slot4: bool = False,
    db: Session = Depends(get_db),
):
    require_admin(request, db)
    send_c2d(deviceId, {
        "slot1Booked": bool(slot1),
        "slot2Booked": bool(slot2),
        "slot3Booked": bool(slot3),
        "slot4Booked": bool(slot4),
    })
    return {"ok": True}
