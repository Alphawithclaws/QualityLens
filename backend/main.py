import base64
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from io import BytesIO
from typing import Any

from anthropic import Anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field

from spc_engine import run_spc

load_dotenv()

DATABASE_PATH = os.getenv("DATABASE_PATH", "qualitylens.db")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "12"))
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5")
API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()

app = FastAPI(
    title="QualityLens AI API",
    description="Image-to-structured-data ingestion and SPC charts for TQM problems.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# models
# ---------------------------------------------------------------------------
class SaveQuestionRequest(BaseModel):
    title: str = Field(default="Untitled TQM question", max_length=250)
    extracted_data: dict[str, Any]
    original_filename: str | None = None
    image_base64: str | None = None


class AnalyzeRequest(BaseModel):
    chart_type: str
    values: list[float] | None = None          # X̄ values, defectives or defects
    secondary: list[float] | None = None       # ranges, or per-sample sizes / units
    subgroups: list[list[float]] | None = None  # raw measurements, one list per subgroup
    n: float | None = None                     # subgroup size or constant sample size
    question_text: str = ""


class InterpretRequest(BaseModel):
    chart_type: str
    question_text: str = ""
    spc: dict[str, Any]


# ---------------------------------------------------------------------------
# database
# ---------------------------------------------------------------------------
def db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def initialize_database():
    with db_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS questions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                question_text TEXT,
                problem_type TEXT,
                chart_type TEXT,
                extracted_json TEXT NOT NULL,
                original_filename TEXT,
                image_base64 TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.commit()


initialize_database()


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def get_client() -> Anthropic:
    if not API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Anthropic API key is missing. Add ANTHROPIC_API_KEY to backend/.env and restart the backend.",
        )
    return Anthropic(api_key=API_KEY)


def extract_json_from_text(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.lstrip().startswith("json"):
            raw = raw.lstrip()[4:]
    try:
        parsed = json.loads(raw.strip())
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Claude returned content that was not valid JSON. Try a clearer image. Details: {exc}",
        )
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="Claude response was not a JSON object.")
    return parsed


def prepare_image(image_bytes: bytes, rotate: int = 0) -> bytes:
    """Fix phone-camera orientation, apply a manual rotation, shrink, and re-encode as JPEG."""
    try:
        img = Image.open(BytesIO(image_bytes))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="The uploaded file could not be read as an image.")
    angle = rotate % 360
    if angle:
        img = img.rotate(-angle, expand=True)  # PIL rotates counter-clockwise, so negate for clockwise
    img.thumbnail((1800, 1800))
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


EXTRACT_PROMPT = """
You are an accurate TQM (Total Quality Management), quality-control and statistics question ingestion assistant.
Read the supplied image carefully. The photo may be rotated or slightly blurry; read the text in whatever orientation it appears.
Extract only information supported by the image. Do not solve the problem.
Return ONLY one valid JSON object with exactly this structure:
{
  "question_text": "full problem statement, preserving wording as much as possible",
  "problem_type": "xbar_r | p_chart | np_chart | c_chart | u_chart | pareto | histogram | scatter | process_capability | acceptance_sampling | other | unknown",
  "chart_type": "xbar_r | p_chart | np_chart | c_chart | u_chart | auto",
  "dataset_title": "short descriptive title",
  "column_headers": ["headers in image, if any"],
  "sample_means": [],
  "sample_ranges": [],
  "observations": [],
  "defect_counts": [],
  "sample_sizes": [],
  "sample_size": null,
  "subgroup_size": null,
  "control_chart_constants": {},
  "specification_limits": {"lsl": null, "usl": null},
  "units": null,
  "given_values": {},
  "extraction_warnings": [],
  "uncertain_readings": []
}
Rules:
- If the table gives a mean (X-bar) and a range (R) for each sample, put them in sample_means and sample_ranges (same order, one number per sample) and leave observations empty.
- observations is ONLY for raw individual measurements. Use one nested array per subgroup, e.g. [[5.1, 5.3, 5.0], [5.2, 5.4, 5.1]].
- For attribute data put the number of defective items (or the number of defects) found in each sample, in order, in defect_counts.
- Put sample_size when every sample has the same size. Put sample_sizes (one number per sample) only when the sizes differ.
- For X-bar and R problems put the number of measurements per sample in subgroup_size.
- chart_type is the chart the question asks for or the one that best fits the data; use "auto" when unclear.
- Preserve the order of every row and value. Keep decimal points, signs and units exactly as shown.
- Use null for absent values; never invent values or table rows.
- If a character or number is unclear, add an entry to uncertain_readings describing where it is and the alternatives. Prefer null over guessing.
- Put constants, formulas and specification limits that are explicitly supplied in the matching fields or in given_values.
- Return valid JSON only, with no markdown fences and no commentary.
"""


def compact_spc(spc: dict[str, Any]) -> dict[str, Any]:
    return {
        "chart": spc.get("label"),
        "summary": spc.get("summary"),
        "charts": [
            {
                "name": c.get("name"),
                "center_line": c.get("center_line"),
                "ucl": c.get("ucl"),
                "lcl": c.get("lcl"),
                "points": c.get("points"),
                "out_of_control": c.get("out_of_control"),
            }
            for c in spc.get("charts", [])
        ],
        "patterns": spc.get("patterns"),
        "warnings": spc.get("warnings"),
    }


# ---------------------------------------------------------------------------
# routes
# ---------------------------------------------------------------------------
@app.get("/")
def root():
    return {"name": "QualityLens AI", "status": "running", "docs": "/docs"}


@app.get("/api/health")
def health():
    return {"status": "ok", "api_key_configured": bool(API_KEY), "model": CLAUDE_MODEL}


@app.post("/api/extract")
async def extract_question(image: UploadFile = File(...), rotate: int = Form(0)):
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if image.content_type not in allowed_types:
        raise HTTPException(status_code=415, detail="Please upload a JPG, PNG, or WEBP image.")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")
    if len(image_bytes) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Image exceeds the {MAX_UPLOAD_MB} MB upload limit.")

    processed = prepare_image(image_bytes, rotate)
    media_type = "image/jpeg"
    encoded = base64.b64encode(processed).decode("utf-8")

    client = get_client()
    try:
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=3500,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": encoded}},
                    {"type": "text", "text": EXTRACT_PROMPT},
                ],
            }],
        )
        raw = "".join(block.text for block in response.content if getattr(block, "type", "") == "text")
        data = extract_json_from_text(raw)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Claude extraction failed: {str(exc)}")

    return {
        "extracted_data": data,
        "original_filename": image.filename,
        "image_base64": encoded,
        "media_type": media_type,
    }


@app.post("/api/analyze")
def analyze_data(payload: AnalyzeRequest):
    """Pure SPC maths. No AI call, so charts still work if the API key or network is down."""
    try:
        return run_spc(
            chart_type=payload.chart_type,
            values=payload.values,
            secondary=payload.secondary,
            subgroups=payload.subgroups,
            n=payload.n,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"SPC calculation failed: {exc}")


@app.post("/api/interpret")
def interpret(payload: InterpretRequest):
    client = get_client()
    prompt = f"""
You are a TQM tutor explaining a control chart result to an undergraduate student.
Use ONLY the question and the computed SPC results below. Do not invent causes, capability indices or numbers.
Write plain text with no markdown symbols (no #, *, - or tables). Use exactly these five paragraphs, each starting with its label and a colon:

What the chart shows: what is plotted and the centre line and limits, quoting the computed values.
Process stability: whether the process is in statistical control, based on out-of-control points and the run patterns listed.
Out-of-control points: name each point and say what it means, or say there are none.
What this does not tell us: control limits are not specification limits, so stability does not prove the product meets requirements.
Suggested next step: what a quality engineer would do next, for example investigate special causes, recalculate limits, or begin collecting data.

Keep it under 250 words.

Question: {payload.question_text or "(not provided)"}
Chart: {payload.chart_type}
SPC results: {json.dumps(compact_spc(payload.spc))}
"""
    try:
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=900,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in response.content if getattr(b, "type", "") == "text").strip()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Claude interpretation failed: {str(exc)}")
    return {"interpretation": text}


@app.post("/api/questions")
def save_question(payload: SaveQuestionRequest):
    data = payload.extracted_data
    question_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    question_text = str(data.get("question_text") or "")
    problem_type = str(data.get("problem_type") or "unknown")
    chart_type = str(data.get("chart_type") or "auto")
    title = payload.title.strip() or str(data.get("dataset_title") or "Untitled TQM question")

    with db_connection() as conn:
        conn.execute(
            """INSERT INTO questions
            (id, title, question_text, problem_type, chart_type, extracted_json,
             original_filename, image_base64, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                question_id, title, question_text, problem_type, chart_type,
                json.dumps(data, ensure_ascii=False), payload.original_filename,
                payload.image_base64, created_at,
            ),
        )
        conn.commit()

    return {"id": question_id, "title": title, "created_at": created_at}


@app.get("/api/questions")
def list_questions():
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT id, title, question_text, problem_type, chart_type,
                      original_filename, created_at
               FROM questions ORDER BY created_at DESC"""
        ).fetchall()
    return {"questions": [dict(row) for row in rows]}


@app.get("/api/questions/{question_id}")
def get_question(question_id: str):
    with db_connection() as conn:
        row = conn.execute("SELECT * FROM questions WHERE id = ?", (question_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Saved question not found.")
    result = dict(row)
    result["extracted_data"] = json.loads(result.pop("extracted_json"))
    return result


@app.delete("/api/questions/{question_id}")
def delete_question(question_id: str):
    with db_connection() as conn:
        cursor = conn.execute("DELETE FROM questions WHERE id = ?", (question_id,))
        conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Saved question not found.")
    return {"deleted": True, "id": question_id}