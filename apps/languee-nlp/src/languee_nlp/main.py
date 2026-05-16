from fastapi import FastAPI

from languee_nlp.routers.health import router as health_router

app = FastAPI(title="Languee NLP", version="0.1.0")

app.include_router(health_router)
