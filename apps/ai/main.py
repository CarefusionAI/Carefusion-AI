"""CareFusion AI Service (FastAPI).

ALL outputs from this service are SIMULATED in the alpha.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import genomic, image, symptom, temporal

app = FastAPI(
    title="CareFusion AI Service",
    description=(
        "Decision-support AI service for CareFusion AI (Government Edition). "
        "NOTE: every output of this alpha service is SIMULATED (fake but realistic) "
        "and labelled 'simulated AI output'. It is not for clinical use, never gives "
        "an autonomous diagnosis, and a doctor must review every result."
    ),
    version="0.1.0",
)

# Localhost only (any port) for the laptop/dev setup. Tighten for the hosted alpha.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
def health() -> dict:
    return {"status": "ok", "service": "carefusion-ai", "simulated": True}


app.include_router(symptom.router)
app.include_router(image.router)
app.include_router(genomic.router)
app.include_router(temporal.router)
