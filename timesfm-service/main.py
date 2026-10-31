
import os
import secrets
from contextlib import asynccontextmanager

import numpy as np
import timesfm

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

model = None
API_KEY = os.getenv("TIMESFM_API_KEY", "")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model

    model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(
        "google/timesfm-2.5-200m-pytorch"
    )

    model.compile(
        timesfm.ForecastConfig(
            max_context=512,
            max_horizon=1,
            normalize_inputs=True,
            per_core_batch_size=1,
        )
    )

    yield
    model = None


app = FastAPI(
    title="TickLens TimesFM AI",
    version="1.0.0",
    lifespan=lifespan,
)


class ForecastRequest(BaseModel):
    market: str
    prices: list[float] = Field(min_length=100, max_length=512)


@app.get("/health")
def health():
    return {
        "status": "online",
        "model": "TimesFM 2.5",
        "loaded": model is not None,
    }


@app.post("/forecast")
def forecast(
    request: ForecastRequest,
    x_api_key: str = Header(default="")
):
    if not API_KEY or not secrets.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")

    if model is None:
        raise HTTPException(status_code=503, detail="Model is loading")

    values = np.asarray(request.prices, dtype=np.float32)

    if not np.isfinite(values).all():
        raise HTTPException(status_code=400, detail="Invalid price sequence")

    try:
        point, quantiles = model.forecast(
            horizon=1,
            inputs=[values]
        )

        predicted_price = float(point[0][0])

        return {
            "status": "success",
            "market": request.market,
            "model": "TimesFM 2.5",
            "last_price": float(values[-1]),
            "forecast_price": predicted_price,
            "forecast_change": predicted_price - float(values[-1]),
            "note": "Numerical price forecast, not a guaranteed digit prediction."
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail="Forecast failed"
        ) from error
