# QualityLens
<<<<<<< HEAD

QualityLens turns a photo of a Total Quality Management (TQM) problem into a statistical process control (SPC) chart. Upload an image of a question, let Claude Vision read the numbers, check them, pick a chart type, and get the control chart with limits, out-of-control signals and a written explanation.

> **Status:** course project prototype. Always verify extracted values against the original question before relying on the results.

## Features

- **Image to data:** Claude Vision reads the problem statement and table from a JPG, PNG or WebP photo. Phone-camera rotation is fixed automatically, and a Rotate button handles sideways photos.
- **Review before you chart:** extracted numbers go into editable fields. Anything Claude was unsure about is listed so you can check it.
- **Chart type dropdown:** X̄–R, p, np, c and u charts, with a short guide for choosing between them.
- **Control charts:** center line, UCL and LCL for each chart. Points outside the limits turn red, and runs of 7 or more points on one side of the center line are flagged.
- **Variable sample sizes:** p and u charts draw stepped limits when the sample size changes.
- **Explanations:** per-chart formulas, how to read the chart, benefits and applications, plus an AI interpretation of your own result.
- **Saved library:** store extracted questions (with the source image) in a local SQLite database and reopen them later.
- **Charts work without AI:** the SPC maths is separate from the Claude call, so charts still render if the API is unavailable.

## Supported charts

| Chart | Data | Center line | Limits |
|---|---|---|---|
| X̄–R | Measurements, subgroups of equal size (n = 2 to 25) | X̿, R̄ | X̿ ± A₂R̄ and D₃R̄ to D₄R̄ |
| p | Number defective, sample size may vary | p̄ = Σd ÷ Σn | p̄ ± 3√(p̄(1 − p̄) ÷ n) |
| np | Number defective, constant sample size | n p̄ | n p̄ ± 3√(n p̄(1 − p̄)) |
| c | Defects per unit, constant unit size | c̄ | c̄ ± 3√c̄ |
| u | Defects per unit, unit size varies | ū = Σc ÷ Σn | ū ± 3√(ū ÷ n) |

Lower limits that come out negative are set to 0. For X̄–R you can enter either sample means and ranges, or raw measurements with one subgroup per line.

## Tech stack

- **Backend:** Python, FastAPI, SQLite, Pillow, the Anthropic SDK
- **Frontend:** React 18, Vite, Recharts, Axios, Lucide icons

## Project structure

```
backend/
  main.py            FastAPI app: extraction, analysis, interpretation, saved questions
  spc_engine.py      SPC calculations for every chart type
  requirements.txt
  .env.example
frontend/
  src/
    App.jsx          UI and application state
    chartInfo.js     Dropdown options, explanations, benefits and applications
    styles.css
    main.jsx
  package.json
```

## Getting started

### Prerequisites

- Python 3.10 or newer
- Node.js 18 or newer
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then add your API key
uvicorn main:app --reload --port 8000
```

The API runs at `http://127.0.0.1:8000`, and interactive docs are at `/docs`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

The frontend calls the backend at `http://127.0.0.1:8000/api`. If you run the backend elsewhere, change the `API` constant at the top of `frontend/src/App.jsx`.

### Environment variables

Set these in `backend/.env`:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | none | Used for image extraction and explanations |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-5` | Model used for both Claude calls |
| `DATABASE_PATH` | No | `qualitylens.db` | SQLite file for saved questions |
| `MAX_UPLOAD_MB` | No | `12` | Largest accepted image |

Never commit `.env`. Add `qualitylens.db` to `.gitignore` as well, since it stores uploaded images.

## How to use it

1. **Upload** a photo of the problem and click **Extract question**.
2. **Check** the problem text and the extracted numbers. Edit anything that is wrong.
3. **Choose** the chart type from the dropdown and confirm the data fields.
4. Click **Generate chart** to see the chart, any signals, and the explanation tabs.

### Worked example: p chart with varying sample sizes

For 20 lots with sample sizes from 600 to 1560 and 346 defectives in 23,040 items inspected:

- p̄ = 346 ÷ 23,040 ≈ 0.0150
- Lot 13 (33 defectives out of 1,200, so p ≈ 0.0275) is above its UCL of about 0.0256
- The first 8 lots all sit below the center line, which is flagged as a possible shift

Use a p chart, not an np chart, because the sample size is not constant.

## API reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Backend status and whether an API key is configured |
| POST | `/api/extract` | Multipart upload (`image`, optional `rotate`); returns extracted JSON |
| POST | `/api/analyze` | Computes the control chart. No AI call |
| POST | `/api/interpret` | Returns a plain-language explanation of a computed chart |
| GET | `/api/questions` | List saved questions |
| POST | `/api/questions` | Save a question |
| GET | `/api/questions/{id}` | Load one saved question |
| DELETE | `/api/questions/{id}` | Delete a saved question |

Example `/api/analyze` request:

```json
{
  "chart_type": "p_chart",
  "values": [18, 15, 13],
  "secondary": [1250, 1300, 1350]
}
```

`values` holds the primary series (sample means, defectives or defects). `secondary` holds ranges for X̄–R, or per-sample sizes and units for p and u charts. `n` is a constant subgroup or sample size. `subgroups` takes raw X̄–R measurements.

## Limitations

- Photo extraction can misread digits (6 and 8, 1 and 7), especially on blurry or rotated images, so review every number.
- Control limits are calculated from the data you enter. They are not specification limits, and a stable process can still miss its specifications.
- The app does not yet remove out-of-control points and recalculate the limits.
- Only X̄–R, p, np, c and u charts are supported. X̄–S, individuals charts and process capability indices are not.
- The interpretation text comes from a language model, so treat it as a study aid and check it against your course material.

## Roadmap

- Remove out-of-control points and recompute limits
- X̄–S and individuals (X–mR) charts
- Process capability (Cp, Cpk)
- Pareto, histogram and fishbone diagrams
- Export charts and results as PDF

## License

Add a license of your choice, for example MIT, before publishing.
=======
AI powered quality intelligence and analytics platform
>>>>>>> eccff842ceed97b64681c42a1c555e0334daf80d
