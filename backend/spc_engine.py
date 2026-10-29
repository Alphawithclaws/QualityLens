"""
SPC calculation engine for QualityLens AI.
Supports: X̄–R (raw subgroups OR given sample means + ranges), p, np, c, u charts.

Every chart returns the same shape so the frontend can draw it generically:
{
  "chart_type": "p_chart", "label": "p chart", "in_control": bool,
  "charts":   [{name, y_label, center_line, points[], ucl[], lcl[], out_of_control[]}],
  "summary":  [{label, value}],
  "warnings": [str], "patterns": [str], "note": str
}
ucl / lcl are lists with one value per point (they differ per point only
when the sample size varies on p and u charts).
"""

from __future__ import annotations

import math
from typing import Any

# Control chart constants for X̄–R charts, subgroup size n = 2..25
A2 = {2: 1.880, 3: 1.023, 4: 0.729, 5: 0.577, 6: 0.483, 7: 0.419, 8: 0.373, 9: 0.337,
      10: 0.308, 11: 0.285, 12: 0.266, 13: 0.249, 14: 0.235, 15: 0.223, 16: 0.212,
      17: 0.203, 18: 0.194, 19: 0.187, 20: 0.180, 21: 0.173, 22: 0.167, 23: 0.162,
      24: 0.157, 25: 0.153}
D3 = {2: 0.0, 3: 0.0, 4: 0.0, 5: 0.0, 6: 0.0, 7: 0.076, 8: 0.136, 9: 0.184, 10: 0.223,
      11: 0.256, 12: 0.283, 13: 0.307, 14: 0.328, 15: 0.347, 16: 0.363, 17: 0.378,
      18: 0.391, 19: 0.403, 20: 0.415, 21: 0.425, 22: 0.434, 23: 0.443, 24: 0.451,
      25: 0.459}
D4 = {2: 3.267, 3: 2.574, 4: 2.282, 5: 2.114, 6: 2.004, 7: 1.924, 8: 1.864, 9: 1.816,
      10: 1.777, 11: 1.744, 12: 1.717, 13: 1.693, 14: 1.672, 15: 1.653, 16: 1.637,
      17: 1.622, 18: 1.608, 19: 1.597, 20: 1.585, 21: 1.575, 22: 1.566, 23: 1.557,
      24: 1.548, 25: 1.541}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _out_of_control(points, ucl, lcl) -> list[dict[str, Any]]:
    signals = []
    for i, (y, u, l) in enumerate(zip(points, ucl, lcl)):
        if y > u:
            signals.append({"index": i + 1, "value": y, "side": "above_UCL"})
        elif y < l:
            signals.append({"index": i + 1, "value": y, "side": "below_LCL"})
    return signals


def _block(name: str, y_label: str, points: list[float], cl: float, ucl, lcl) -> dict[str, Any]:
    k = len(points)
    ucl_list = list(ucl) if isinstance(ucl, (list, tuple)) else [ucl] * k
    lcl_list = list(lcl) if isinstance(lcl, (list, tuple)) else [lcl] * k
    return {
        "name": name,
        "y_label": y_label,
        "center_line": cl,
        "points": points,
        "ucl": ucl_list,
        "lcl": lcl_list,
        "out_of_control": _out_of_control(points, ucl_list, lcl_list),
    }


def _run_patterns(name: str, points: list[float], cl: float, min_len: int = 7) -> list[str]:
    """Runs of >= 7 consecutive points on one side of the centre line."""
    notes: list[str] = []
    side, length, start = 0, 0, 0

    def flush(end_idx: int):
        if length >= min_len:
            where = "above" if side > 0 else "below"
            notes.append(
                f"{name}: {length} consecutive points {where} the center line "
                f"(points {start + 1} to {end_idx}) suggest a shift in the process."
            )

    for i, p in enumerate(points):
        s = (p > cl) - (p < cl)
        if s != 0 and s == side:
            length += 1
        else:
            flush(i)
            side, length, start = s, (1 if s != 0 else 0), i
    flush(len(points))
    return notes


def _finish(chart_type: str, label: str, charts: list[dict], summary: list[dict],
            warnings: list[str] | None = None) -> dict[str, Any]:
    patterns: list[str] = []
    for ch in charts:
        patterns += _run_patterns(ch["name"], ch["points"], ch["center_line"])
    return {
        "chart_type": chart_type,
        "label": label,
        "charts": charts,
        "summary": summary,
        "warnings": warnings or [],
        "patterns": patterns,
        "in_control": not any(ch["out_of_control"] for ch in charts),
        "note": "Control limits come from the process data. They are not specification limits.",
    }


def _check_counts(values: list[float], what: str) -> None:
    if len(values) < 2:
        raise ValueError("Enter at least two samples to build a control chart.")
    if any(v < 0 for v in values):
        raise ValueError(f"{what} cannot be negative.")


def _sizes(k: int, secondary: list[float] | None, n: float | None, what: str) -> list[float]:
    if secondary and len(secondary) == 1:       # a single size typed in the list box
        n, secondary = secondary[0], None
    if secondary:
        if len(secondary) != k:
            raise ValueError(f"You entered {k} counts but {len(secondary)} {what}. The two lists must match.")
        sizes = [float(s) for s in secondary]
    elif n:
        sizes = [float(n)] * k
    else:
        raise ValueError(f"Enter the {what} (one value if constant, or one per sample).")
    if any(s <= 0 for s in sizes):
        raise ValueError(f"The {what} must be positive.")
    return sizes


# ---------------------------------------------------------------------------
# X̄–R
# ---------------------------------------------------------------------------
def compute_xbar_r(means: list[float], ranges: list[float], n: int) -> dict[str, Any]:
    if len(means) < 2:
        raise ValueError("Enter at least two subgroups to build an X̄–R chart.")
    if not 2 <= n <= 25:
        raise ValueError("Subgroup size n must be between 2 and 25 to use the standard X̄–R constants.")
    if any(r < 0 for r in ranges):
        raise ValueError("Ranges cannot be negative.")

    grand_mean = _mean(means)
    r_bar = _mean(ranges)
    a2, d3, d4 = A2[n], D3[n], D4[n]

    xbar = _block("X̄ chart (sample means)", "Sample mean", means, grand_mean,
                  grand_mean + a2 * r_bar, grand_mean - a2 * r_bar)
    rchart = _block("R chart (sample ranges)", "Sample range", ranges, r_bar,
                    d4 * r_bar, d3 * r_bar)

    warnings = []
    if rchart["out_of_control"]:
        warnings.append(
            "The R chart has out-of-control points, so the spread of the process is not stable. "
            "Find and remove the cause before relying on the X̄ limits."
        )
    summary = [
        {"label": "Subgroups (k)", "value": len(means)},
        {"label": "Subgroup size (n)", "value": n},
        {"label": "Grand mean X̿", "value": grand_mean},
        {"label": "Mean range R̄", "value": r_bar},
        {"label": "A₂ / D₃ / D₄", "value": f"{a2:g} / {d3:g} / {d4:g}"},
    ]
    return _finish("xbar_r", "X̄–R chart", [xbar, rchart], summary, warnings)


# ---------------------------------------------------------------------------
# p chart
# ---------------------------------------------------------------------------
def compute_p_chart(defectives: list[float], sizes: list[float]) -> dict[str, Any]:
    for i, (d, n) in enumerate(zip(defectives, sizes), 1):
        if d > n:
            raise ValueError(f"Sample {i}: {d:g} defectives cannot be more than the sample size {n:g}.")

    p_i = [d / n for d, n in zip(defectives, sizes)]
    p_bar = sum(defectives) / sum(sizes)
    ucl, lcl = [], []
    for n in sizes:
        sigma = math.sqrt(p_bar * (1 - p_bar) / n)
        ucl.append(p_bar + 3 * sigma)
        lcl.append(max(0.0, p_bar - 3 * sigma))

    n_avg = _mean(sizes)
    warnings = []
    if n_avg * p_bar < 5:
        warnings.append(
            f"Average n·p̄ is only {n_avg * p_bar:.2f}. With so few expected defectives the "
            "3-sigma limits are only a rough guide; consider larger samples."
        )
    constant = len(set(sizes)) == 1
    summary = [
        {"label": "Samples (k)", "value": len(defectives)},
        {"label": "Sample size", "value": sizes[0] if constant else f"varies (average {n_avg:.1f})"},
        {"label": "Total defectives", "value": sum(defectives)},
        {"label": "Average fraction p̄", "value": p_bar},
    ]
    chart = _block("p chart (fraction defective)", "Fraction defective", p_i, p_bar, ucl, lcl)
    return _finish("p_chart", "p chart", [chart], summary, warnings)


# ---------------------------------------------------------------------------
# np chart
# ---------------------------------------------------------------------------
def compute_np_chart(defectives: list[float], n: float) -> dict[str, Any]:
    for i, d in enumerate(defectives, 1):
        if d > n:
            raise ValueError(f"Sample {i}: {d:g} defectives cannot be more than the sample size {n:g}.")

    np_bar = _mean(defectives)
    p_bar = np_bar / n
    sigma = math.sqrt(n * p_bar * (1 - p_bar))
    ucl = np_bar + 3 * sigma
    lcl = max(0.0, np_bar - 3 * sigma)

    warnings = []
    if np_bar < 5:
        warnings.append(
            f"The average number defective is only {np_bar:.2f}. With so few expected defectives "
            "the 3-sigma limits are only a rough guide."
        )
    summary = [
        {"label": "Samples (k)", "value": len(defectives)},
        {"label": "Sample size (n)", "value": n},
        {"label": "Average number defective n·p̄", "value": np_bar},
        {"label": "Fraction p̄", "value": p_bar},
    ]
    chart = _block("np chart (number defective)", "Number defective",
                   [float(d) for d in defectives], np_bar, ucl, lcl)
    return _finish("np_chart", "np chart", [chart], summary, warnings)


# ---------------------------------------------------------------------------
# c chart
# ---------------------------------------------------------------------------
def compute_c_chart(defects: list[float]) -> dict[str, Any]:
    c_bar = _mean(defects)
    sigma = math.sqrt(c_bar)
    ucl = c_bar + 3 * sigma
    lcl = max(0.0, c_bar - 3 * sigma)
    summary = [
        {"label": "Inspection units (k)", "value": len(defects)},
        {"label": "Total defects", "value": sum(defects)},
        {"label": "Average defects c̄", "value": c_bar},
    ]
    chart = _block("c chart (defects per unit)", "Defects per unit",
                   [float(c) for c in defects], c_bar, ucl, lcl)
    return _finish("c_chart", "c chart", [chart], summary)


# ---------------------------------------------------------------------------
# u chart
# ---------------------------------------------------------------------------
def compute_u_chart(defects: list[float], units: list[float]) -> dict[str, Any]:
    u_i = [d / n for d, n in zip(defects, units)]
    u_bar = sum(defects) / sum(units)
    ucl, lcl = [], []
    for n in units:
        sigma = math.sqrt(u_bar / n)
        ucl.append(u_bar + 3 * sigma)
        lcl.append(max(0.0, u_bar - 3 * sigma))

    constant = len(set(units)) == 1
    summary = [
        {"label": "Samples (k)", "value": len(defects)},
        {"label": "Units per sample", "value": units[0] if constant else f"varies (average {_mean(units):.1f})"},
        {"label": "Total defects", "value": sum(defects)},
        {"label": "Average defects per unit ū", "value": u_bar},
    ]
    chart = _block("u chart (defects per unit)", "Defects per unit", u_i, u_bar, ucl, lcl)
    return _finish("u_chart", "u chart", [chart], summary)


# ---------------------------------------------------------------------------
# dispatcher
# ---------------------------------------------------------------------------
ALIASES = {
    "xbar_r": "xbar_r", "xbar": "xbar_r", "x_bar_r": "xbar_r", "xbarr": "xbar_r", "xr": "xbar_r",
    "p": "p_chart", "p_chart": "p_chart",
    "np": "np_chart", "np_chart": "np_chart",
    "c": "c_chart", "c_chart": "c_chart",
    "u": "u_chart", "u_chart": "u_chart",
}


def normalize_chart_type(chart_type: str | None) -> str:
    key = (chart_type or "").strip().lower().replace("\u0304", "")
    key = key.replace("-", "_").replace("–", "_").replace(" ", "_")
    return ALIASES.get(key, "")


def run_spc(
    chart_type: str,
    values: list[float] | None = None,
    secondary: list[float] | None = None,
    subgroups: list[list[float]] | None = None,
    n: float | None = None,
) -> dict[str, Any]:
    ct = normalize_chart_type(chart_type)
    values = values or []
    secondary = secondary or []

    if ct == "xbar_r":
        if subgroups:
            size = len(subgroups[0])
            if size < 2 or any(len(g) != size for g in subgroups):
                raise ValueError("Every subgroup must have the same number of measurements (at least 2).")
            means = [_mean(g) for g in subgroups]
            ranges = [max(g) - min(g) for g in subgroups]
            return compute_xbar_r(means, ranges, size)
        if values and secondary:
            if len(values) != len(secondary):
                raise ValueError(
                    f"You entered {len(values)} sample means but {len(secondary)} ranges. They must match."
                )
            if not n or int(n) != n:
                raise ValueError("Enter the subgroup size n as a whole number (for example 5).")
            return compute_xbar_r(values, secondary, int(n))
        raise ValueError(
            "For an X̄–R chart enter the sample means and ranges, "
            "or paste raw measurements with one subgroup per line."
        )

    if ct in ("p_chart", "np_chart", "c_chart", "u_chart"):
        _check_counts(values, "Counts")

    if ct == "p_chart":
        return compute_p_chart(values, _sizes(len(values), secondary, n, "sample sizes"))

    if ct == "np_chart":
        size = n or (secondary[0] if secondary and len(set(secondary)) == 1 else None)
        if not size or size <= 0:
            raise ValueError("An np chart needs one constant sample size. Use a p chart if it varies.")
        return compute_np_chart(values, float(size))

    if ct == "c_chart":
        return compute_c_chart(values)

    if ct == "u_chart":
        return compute_u_chart(values, _sizes(len(values), secondary, n, "units inspected"))

    raise ValueError("Choose a chart type: X̄–R, p, np, c or u.")