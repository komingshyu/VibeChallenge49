
from __future__ import annotations
import pandas as pd
import numpy as np
import yfinance as yf

TAIWAN_SUFFIXES = (".TW", ".TWO")

def normalize_ticker(user_input: str) -> str:
    s = (user_input or "").strip().upper()
    if not s:
        return "2330.TW"
    if s.endswith(TAIWAN_SUFFIXES):
        return s
    if s.isdigit():
        return s + ".TW"
    return s

def _download_history_one(symbol: str, start: str, end: str) -> pd.DataFrame:
    ticker = yf.Ticker(symbol)
    df = ticker.history(start=start, end=end, interval="1d", auto_adjust=False)
    if not df.empty:
        df = df.rename(columns={
            "Open":"Open","High":"High","Low":"Low","Close":"Close","Volume":"Volume"
        })
        if isinstance(df.index, pd.DatetimeIndex) and df.index.tz is not None:
            df.index = df.index.tz_convert(None)
        keep = [c for c in ["Open","High","Low","Close","Volume"] if c in df.columns]
        df = df[keep].copy()
    return df

def fetch_history_safely(user_input: str, start: str, end: str) -> tuple[pd.DataFrame, str]:
    """Try .TW then .TWO when the base is digits. Return (df, used_symbol)."""
    s = normalize_ticker(user_input)
    if s.isdigit():
        candidates = [s + ".TW", s + ".TWO"]
    elif s.endswith(TAIWAN_SUFFIXES):
        base = s[:-3]
        if base.isdigit():
            candidates = [base + ".TW", base + ".TWO"]
        else:
            candidates = [s]
    else:
        candidates = [s]

    for sym in candidates:
        try:
            df = _download_history_one(sym, start, end)
            if not df.empty:
                return df, sym
        except Exception:
            pass
    return pd.DataFrame(), candidates[0]

def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    out = df.copy()

    # MAs
    for win in [5,20,60,120,240]:
        out[f"MA{win}"] = out["Close"].rolling(win, min_periods=1).mean()

    # ATR(14)
    prev_close = out["Close"].shift(1)
    tr = pd.concat([
        (out["High"] - out["Low"]).abs(),
        (out["High"] - prev_close).abs(),
        (out["Low"]  - prev_close).abs(),
    ], axis=1).max(axis=1)
    out["ATR14"] = tr.rolling(14, min_periods=1).mean()

    # Year line break
    prev_above = (out["Close"].shift(1) >= out["MA240"].shift(1))
    now_below  = (out["Close"] < out["MA240"])
    out["YR_BREAK"] = (prev_above & now_below).fillna(False)

    # Pivot highs/lows
    high = out["High"]; low = out["Low"]

    def pivots(series: pd.Series, n:int=3, is_high: bool=True):
        conds = []
        for i in range(1, n+1):
            if is_high:
                conds.append(series >= series.shift(i))
                conds.append(series >= series.shift(-i))
            else:
                conds.append(series <= series.shift(i))
                conds.append(series <= series.shift(-i))
        cond = np.logical_and.reduce(conds)
        # Make sure returning Series aligned to original index
        return pd.Series(cond, index=series.index)

    out["PIVOT_H"] = pivots(high, n=3, is_high=True).fillna(False)
    out["PIVOT_L"] = pivots(low,  n=3, is_high=False).fillna(False)

    atr = out["ATR14"]
    halfw = (atr.iloc[-1] if len(atr)>0 else (out["Close"].iloc[-1] * 0.01)) * 0.5
    recent = out.tail(150) if len(out) > 150 else out
    last_highs = recent.loc[recent["PIVOT_H"], "High"].tail(2)
    last_lows  = recent.loc[recent["PIVOT_L"], "Low"].tail(2)
    res_center = last_highs.mean() if len(last_highs) else float("nan")
    sup_center = last_lows.mean()  if len(last_lows)  else float("nan")

    sup_low  = (sup_center - halfw) if pd.notna(sup_center) else float("nan")
    sup_high = (sup_center + halfw) if pd.notna(sup_center) else float("nan")
    res_low  = (res_center - halfw) if pd.notna(res_center) else float("nan")
    res_high = (res_center + halfw) if pd.notna(res_center) else float("nan")

    out["SUP_LOW"]  = pd.Series(sup_low,  index=out.index)
    out["SUP_HIGH"] = pd.Series(sup_high, index=out.index)
    out["RES_LOW"]  = pd.Series(res_low,  index=out.index)
    out["RES_HIGH"] = pd.Series(res_high, index=out.index)

    return out
